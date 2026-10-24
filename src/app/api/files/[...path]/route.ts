import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';
import { getRequestUser } from '@/lib/auth';
import { canReadMedia } from '@/lib/media-access';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const user = await getRequestUser(req);
    if (!user) return new NextResponse('Authentication required', { status: 401 });
    const { path: pathSegments } = await params;
    const relativePath = pathSegments.join('/');
    const fullPath = path.join(APP_CONFIG.storageRoot, relativePath);

    // Security: Check path traversal
    const safePath = assertSafePath(fullPath, APP_CONFIG.storageRoot);
    if (!(await canReadMedia(user.id, safePath)) && !(await restorePrivateMedia(user.id, safePath))) {
      return new NextResponse('File not found', { status: 404 });
    }

    // Security: Block sensitive internal configuration and auth files
    const basename = path.basename(safePath).toLowerCase();
    const FORBIDDEN_FILENAMES = new Set([
      'auth_store.json',
      'settings.json',
      'package.json',
      'tsconfig.json',
      '.env',
      '.env.local',
      '.env.production',
      '.env.example',
    ]);

    if (FORBIDDEN_FILENAMES.has(basename) || basename.startsWith('.')) {
      return new NextResponse('Access denied: sensitive file', { status: 403 });
    }

    if (!fs.existsSync(safePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const stat = await fs.promises.stat(safePath);
    if (!stat.isFile()) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const ext = path.extname(safePath).toLowerCase();

    // Security: Restrict JSON access to project manifests only
    if (ext === '.json' && basename !== 'manifest.json' && basename !== 'recipe.json') {
      return new NextResponse('Access denied: JSON file type not public', { status: 403 });
    }
    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.m4a') contentType = 'audio/mp4';
    else if (ext === '.aac') contentType = 'audio/aac';
    else if (ext === '.ogg') contentType = 'audio/ogg';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.srt') contentType = 'text/plain';
    else if (ext === '.ass') contentType = 'text/plain';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.csv') contentType = 'text/csv';
    else if (ext === '.zip') contentType = 'application/zip';

    // Support HTTP Range Requests for smooth HTML5 video scrubbing and seeking
    const range = req.headers.get('range');
    if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const suffix = !parts[0] && /^\d+$/.test(parts[1] || '');
      const start = suffix ? Math.max(0, stat.size - Number(parts[1])) : Number(parts[0]);
      const end = suffix || !parts[1] ? stat.size - 1 : Math.min(Number(parts[1]), stat.size - 1);
      if (!/^bytes=\d*-\d*$/.test(range) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || start >= stat.size || end < start || (suffix && Number(parts[1]) === 0)) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
      }
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(safePath, { start, end });

      return new Response(fileStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const fileStream = fs.createReadStream(safePath);
    return new Response(fileStream as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
