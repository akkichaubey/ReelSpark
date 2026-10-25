import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { probeVideo } from '@/lib/ffmpeg';
import { APP_CONFIG } from '@/lib/config';
import { sanitizeFilename, assertSafePath } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, validateUpload } from '@/lib/media-validation';
import { MediaAsset } from '@/lib/clipping-studio/contracts';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { backupPrivateMedia, deletePrivateMedia } from '@/lib/cloudflare/private-media';
import { getIncomingUploadMetadata, streamRequestBodyToFile, UploadRequestError } from '@/lib/stream-upload';
import { registerStorageTask } from '@/lib/storage-runtime';

// Permitted media extensions
const ALLOWED_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'
]);

function getProjectMediaDir(projectId: string): string {
  const projectsDir = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
  const safeProjectId = sanitizeFilename(projectId);
  const dir = assertSafePath(path.join(projectsDir, safeProjectId, 'media'), projectsDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getAvailableManagedPath(mediaDir: string, filename: string): string {
  const safeName = sanitizeFilename(filename);
  const extension = path.extname(safeName);
  const stem = path.basename(safeName, extension) || 'media';
  let target = assertSafePath(path.join(mediaDir, safeName), mediaDir);
  let suffix = 1;
  while (fs.existsSync(target)) {
    target = assertSafePath(path.join(mediaDir, `${stem}_${suffix}${extension}`), mediaDir);
    suffix++;
  }
  return target;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let finishStorageTask: (() => void) | undefined;
  let uploadAbort: AbortController | undefined;
  let createdFilePath: string | undefined;
  let keepCreatedFile = false;
  let uploadOwnerId: string | undefined;
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    uploadOwnerId = access.user.id;
    const { id: projectId } = await params;
    if (!(await clippingProjectAccess(access.user.id, projectId, true))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const contentType = req.headers.get('content-type') || '';

    let targetFilePath = '';
    let originalFilename = '';
    let fileSizeBytes = 0;

    if (contentType.includes('application/octet-stream')) {
      const { filename, expectedSize, uploadId } = getIncomingUploadMetadata(req);
      const uploadError = validateUpload({ name: filename, size: expectedSize }, ['video', 'audio']);
      if (uploadError) {
        return NextResponse.json({ success: false, error: uploadError }, { status: 400 });
      }

      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json({
          success: false,
          error: `Unsupported media format: ${ext}. Supported formats: MP4, MOV, WEBM, MKV, AVI, MP3, WAV, M4A, AAC, OGG, FLAC`,
        }, { status: 400 });
      }

      const safeName = sanitizeFilename(filename);
      const mediaDir = getProjectMediaDir(projectId);
      targetFilePath = getAvailableManagedPath(mediaDir, safeName);
      originalFilename = filename;

      // Stream raw request bytes to a staging file so large uploads stay off the heap.
      const stagingPath = path.join(mediaDir, `.incoming-${randomUUID()}`);
      uploadAbort = new AbortController();
      finishStorageTask = registerStorageTask({
        id: uploadId,
        ownerId: access.user.id,
        kind: 'upload',
        paths: [mediaDir],
        cancel: () => uploadAbort?.abort(),
      });
      try {
        fileSizeBytes = await streamRequestBodyToFile(req, stagingPath, undefined, AbortSignal.any([req.signal, uploadAbort.signal]));
        if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
        await fs.promises.rename(stagingPath, targetFilePath);
        createdFilePath = targetFilePath;
      } catch (error) {
        await fs.promises.rm(stagingPath, { force: true }).catch(() => undefined);
        throw error;
      }
    } else {
      if (contentType.includes('multipart/form-data')) {
        throw new UploadRequestError('This page is using an older upload format. Refresh the page and upload again.', 415);
      }
      // JSON body with localFilePath
      const body = await req.json();
      const { localFilePath } = body;
      if (typeof localFilePath !== 'string' || !(await canReadMedia(access.user.id, localFilePath))) {
        return NextResponse.json({ error: 'Media not found. Upload the file instead of supplying a PC path.' }, { status: 404 });
      }

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
      if (!stat.isFile()) {
        return NextResponse.json({ success: false, error: 'localFilePath must point to a media file' }, { status: 400 });
      }
      if (stat.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ success: false, error: 'Files larger than 500 MB are not supported.' }, { status: 400 });
      }

      // Keep imported files inside the project workspace. Besides making projects
      // portable, this prevents later export/probe requests from depending on an
      // arbitrary client-provided path.
      const mediaDir = getProjectMediaDir(projectId);
      targetFilePath = getAvailableManagedPath(mediaDir, path.basename(localFilePath));
      fs.copyFileSync(localFilePath, targetFilePath);
      createdFilePath = targetFilePath;
      originalFilename = path.basename(localFilePath);
      fileSizeBytes = stat.size;
    }

    // Validate the complete media before recording it in local or cloud storage.
    const meta = await probeVideo(targetFilePath);
    if (uploadAbort?.signal.aborted) throw new Error('Upload cancelled.');
    await backupPrivateMedia(access.user.id, targetFilePath);
    if (uploadAbort?.signal.aborted) throw new Error('Upload cancelled.');
    keepCreatedFile = true;
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
    if (createdFilePath && !keepCreatedFile) {
      try {
        if (uploadOwnerId) await deletePrivateMedia(uploadOwnerId, createdFilePath);
        await fs.promises.rm(createdFilePath, { force: true });
      } catch (cleanupError) {
        console.error('[Clipping media upload] Rollback failed; janitor will retry:', cleanupError);
        const rootRelative = path.relative(APP_CONFIG.storageRoot, createdFilePath).split(path.sep).join('/');
        const markerPath = path.join(path.dirname(createdFilePath), `.partial-${randomUUID()}.json`);
        await fs.promises.writeFile(markerPath, JSON.stringify({ ownerId: uploadOwnerId, target: rootRelative })).catch(() => undefined);
      }
    }
    console.error('[Clipping Media Import Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Media import failed' }, { status: err instanceof UploadRequestError ? err.status : 500 });
  } finally {
    finishStorageTask?.();
  }
}

// Relink missing source media
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const { id: projectId } = await params;
    if (!(await clippingProjectAccess(access.user.id, projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const body = await req.json();
    const { assetId, newPath } = body;
    if (typeof newPath !== 'string' || !(await canReadMedia(access.user.id, newPath))) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    if (!assetId || !newPath) {
      return NextResponse.json({ success: false, error: 'assetId and newPath are required' }, { status: 400 });
    }

    if (!fs.existsSync(newPath)) {
      return NextResponse.json({ success: false, error: `Relinked file does not exist: ${newPath}` }, { status: 404 });
    }

    const stat = fs.statSync(newPath);
    if (!stat.isFile() || stat.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'Relinked file is not a supported local media file.' }, { status: 400 });
    }
    const ext = path.extname(newPath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ success: false, error: `Unsupported media format: ${ext}` }, { status: 400 });
    }

    const mediaDir = getProjectMediaDir(projectId);
    const managedPath = getAvailableManagedPath(mediaDir, `${sanitizeFilename(assetId)}_${path.basename(newPath)}`);
    fs.copyFileSync(newPath, managedPath);
    await backupPrivateMedia(access.user.id, managedPath);
    const meta = await probeVideo(managedPath);

    return NextResponse.json({
      success: true,
      updatedPath: managedPath,
      fileSizeBytes: stat.size,
      durationMs: Math.round(meta.duration * 1000),
      meta,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Relink failed' }, { status: 500 });
  }
}
