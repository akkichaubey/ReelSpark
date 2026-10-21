import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { probeVideo } from '@/lib/ffmpeg';
import { APP_CONFIG } from '@/lib/config';
import { sanitizeFilename, assertSafePath } from '@/lib/storage';
import { MediaAsset } from '@/lib/clipping-studio/contracts';

// Permitted media extensions
const ALLOWED_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'
]);

function getProjectMediaDir(projectId: string): string {
  const dir = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects', projectId, 'media');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const contentType = req.headers.get('content-type') || '';

    let targetFilePath = '';
    let originalFilename = '';
    let fileSizeBytes = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No media file provided' }, { status: 400 });
      }

      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json({
          success: false,
          error: `Unsupported media format: ${ext}. Supported formats: MP4, MOV, WEBM, MKV, AVI, MP3, WAV, M4A, AAC, OGG, FLAC`,
        }, { status: 400 });
      }

      const safeName = sanitizeFilename(file.name);
      const mediaDir = getProjectMediaDir(projectId);
      targetFilePath = path.join(mediaDir, safeName);
      originalFilename = file.name;
      fileSizeBytes = file.size;

      // Stream file to local workspace
      const nodeStream = Readable.fromWeb(file.stream() as any);
      const writeStream = fs.createWriteStream(targetFilePath);
      await pipeline(nodeStream, writeStream);
    } else {
      // JSON body with localFilePath
      const body = await req.json();
      const { localFilePath } = body;

      if (!localFilePath || typeof localFilePath !== 'string') {
        return NextResponse.json({ success: false, error: 'localFilePath must be provided' }, { status: 400 });
      }

      if (!fs.existsSync(localFilePath)) {
        return NextResponse.json({ success: false, error: `File not found at path: ${localFilePath}` }, { status: 404 });
      }

      const ext = path.extname(localFilePath).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json({ success: false, error: `Unsupported media format: ${ext}` }, { status: 400 });
      }

      const stat = fs.statSync(localFilePath);
      targetFilePath = localFilePath;
      originalFilename = path.basename(localFilePath);
      fileSizeBytes = stat.size;
    }

    // Inspect media with FFprobe
    const meta = await probeVideo(targetFilePath);
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const mediaAsset: MediaAsset = {
      id: assetId,
      projectId,
      filename: originalFilename,
      localPath: targetFilePath,
      fileSizeBytes,
      metadata: {
        durationSeconds: meta.duration,
        durationMs: Math.round(meta.duration * 1000),
        sizeBytes: fileSizeBytes,
        formatName: meta.format,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        aspectRatio: meta.aspectRatio,
        hasVideo: meta.aspectRatio !== 'Audio',
        hasAudio: meta.hasAudio,
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
      },
      createdAt: now,
    };

    return NextResponse.json({
      success: true,
      asset: mediaAsset,
    });
  } catch (err: any) {
    console.error('[Clipping Media Import Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Media import failed' }, { status: 500 });
  }
}

// Relink missing source media
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const { assetId, newPath } = body;

    if (!assetId || !newPath) {
      return NextResponse.json({ success: false, error: 'assetId and newPath are required' }, { status: 400 });
    }

    if (!fs.existsSync(newPath)) {
      return NextResponse.json({ success: false, error: `Relinked file does not exist: ${newPath}` }, { status: 404 });
    }

    const stat = fs.statSync(newPath);
    const meta = await probeVideo(newPath);

    return NextResponse.json({
      success: true,
      updatedPath: newPath,
      fileSizeBytes: stat.size,
      durationMs: Math.round(meta.duration * 1000),
      meta,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Relink failed' }, { status: 500 });
  }
}
