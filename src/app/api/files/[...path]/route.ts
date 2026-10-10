import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const relativePath = pathSegments.join('/');
    const fullPath = path.join(APP_CONFIG.storageRoot, relativePath);

    // Security: Check path traversal
    const safePath = assertSafePath(fullPath, APP_CONFIG.storageRoot);

    if (!fs.existsSync(safePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const stat = await fs.promises.stat(safePath);
    if (!stat.isFile()) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const ext = path.extname(safePath).toLowerCase();
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
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(safePath, { start, end });

      return new Response(fileStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
        },
      });
    }

    const fileStream = fs.createReadStream(safePath);
    return new Response(fileStream as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
