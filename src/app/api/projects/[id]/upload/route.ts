import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { getProjectDirs, loadProject, sanitizeFilename, saveProject } from '@/lib/storage';
import { probeVideo } from '@/lib/ffmpeg';
import { validateUpload } from '@/lib/media-validation';
import { getIncomingUploadMetadata, streamRequestBodyToFile, UploadRequestError } from '@/lib/stream-upload';
import { registerStorageTask } from '@/lib/storage-runtime';
import { backupPrivateMedia } from '@/lib/cloudflare/private-media';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let finishStorageTask: (() => void) | undefined;
  let uploadAbort: AbortController | undefined;
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { filename, expectedSize, uploadId } = getIncomingUploadMetadata(req);
    const uploadError = validateUpload({ name: filename, size: expectedSize }, ['video', 'audio']);
    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError }, { status: 400 });
    }

    const dirs = getProjectDirs(project.id);
    const safeName = sanitizeFilename(filename || 'uploaded_video.mp4');
    const targetFilePath = path.join(dirs.originalDir, safeName);
    const stagingFilePath = path.join(dirs.originalDir, `.incoming-${randomUUID()}`);

    uploadAbort = new AbortController();
    finishStorageTask = registerStorageTask({
      id: uploadId,
      ownerId: project.ownerUserId as string,
      kind: 'upload',
      paths: [dirs.rootDir],
      cancel: () => uploadAbort?.abort(),
    });

    project.status = 'UPLOADING';
    project.progress = 10;
    project.statusMessage = `Saving ${filename} to local workspace...`;
    await saveProject(project);

    // Stream and inspect the staging file before replacing a previously uploaded source.
    let fileSize = 0;
    let previousFilePath: string | undefined;
    let installedNewFile = false;
    try {
      fileSize = await streamRequestBodyToFile(req, stagingFilePath, undefined, AbortSignal.any([req.signal, uploadAbort.signal]));
      const metadata = await probeVideo(stagingFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');

      if (fs.existsSync(targetFilePath)) {
        previousFilePath = `${targetFilePath}.previous-${randomUUID()}`;
        await fs.promises.rename(targetFilePath, previousFilePath);
      }
      await fs.promises.rename(stagingFilePath, targetFilePath);
      installedNewFile = true;

      // On ephemeral hosts, do not expose an uploaded source as complete until
      // its durable private R2 copy has been committed to the ownership catalog.
      if (project.ownerUserId) await backupPrivateMedia(project.ownerUserId, targetFilePath);

      project.localVideoPath = targetFilePath;
      project.originalFileName = filename;
      project.videoMetadata = metadata;
      project.status = 'QUEUED';
      project.progress = 100;
      const isAudioOnly = !metadata.videoCodec && metadata.hasAudio;
      if (isAudioOnly) project.sourceType = 'audio';
      project.statusMessage = isAudioOnly
        ? `Audio inspection complete. Duration: ${Math.round(metadata.duration)}s, Codec: ${metadata.audioCodec || 'audio'}. Ready for AI analysis.`
        : `Video inspection complete. Duration: ${Math.round(metadata.duration)}s, Resolution: ${metadata.width}x${metadata.height}. Ready for AI analysis.`;
      await saveProject(project);
      if (previousFilePath) await fs.promises.rm(previousFilePath, { force: true });

      return NextResponse.json({ success: true, project, metadata });
    } catch (error) {
      await fs.promises.rm(stagingFilePath, { force: true }).catch(() => undefined);
      if (installedNewFile) await fs.promises.rm(targetFilePath, { force: true }).catch(() => undefined);
      if (previousFilePath) await fs.promises.rename(previousFilePath, targetFilePath).catch(() => undefined);
      project.status = 'QUEUED';
      project.progress = 0;
      project.statusMessage = uploadAbort.signal.aborted
        ? 'Upload cancelled. Attach the source file again to continue.'
        : 'Upload failed. The previous source was preserved; retry when ready.';
      await saveProject(project).catch((saveError) => console.error('Could not reset project after upload failure:', saveError));
      throw error;
    }
  } catch (err: any) {
    console.error('Upload handler error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err instanceof UploadRequestError ? err.status : 500 });
  } finally {
    finishStorageTask?.();
  }
}

/** Reset the project state after the client cancels an incomplete upload. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    const project = await loadProject(id);
    if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

    if (project.status === 'UPLOADING') {
      project.status = 'QUEUED';
      project.progress = 0;
      project.statusMessage = 'Upload cancelled. Attach the source file again to continue.';
      await saveProject(project);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Upload cancellation handler error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to cancel upload' }, { status: 500 });
  }
}
