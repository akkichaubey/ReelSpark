import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { getProjectDirs, loadProject, sanitizeFilename, saveProject } from '@/lib/storage';
import { probeVideo } from '@/lib/ffmpeg';
import { validateUpload } from '@/lib/media-validation';
import { getIncomingUploadMetadata, streamRequestBodyToFile, UploadRequestError } from '@/lib/stream-upload';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { filename, expectedSize } = getIncomingUploadMetadata(req);
    const uploadError = validateUpload({ name: filename, size: expectedSize }, ['video', 'audio']);
    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError }, { status: 400 });
    }

    const dirs = getProjectDirs(project.id);
    const safeName = sanitizeFilename(filename || 'uploaded_video.mp4');
    const targetFilePath = path.join(dirs.originalDir, safeName);
    const stagingFilePath = path.join(dirs.originalDir, `.incoming-${randomUUID()}`);

    project.status = 'UPLOADING';
    project.progress = 10;
    project.statusMessage = `Saving ${filename} to local workspace...`;
    await saveProject(project);

    // Stream raw request bytes to a temporary file, then atomically install them.
    let fileSize = 0;
    try {
      fileSize = await streamRequestBodyToFile(req, stagingFilePath);
      if (process.platform === 'win32' && fs.existsSync(targetFilePath)) {
        const previousFilePath = `${targetFilePath}.previous-${randomUUID()}`;
        await fs.promises.rename(targetFilePath, previousFilePath);
        try {
          await fs.promises.rename(stagingFilePath, targetFilePath);
        } catch (error) {
          await fs.promises.rename(previousFilePath, targetFilePath).catch(() => undefined);
          throw error;
        }
        await fs.promises.rm(previousFilePath, { force: true });
      } else {
        await fs.promises.rename(stagingFilePath, targetFilePath);
      }
    } catch (error) {
      await fs.promises.rm(stagingFilePath, { force: true }).catch(() => undefined);
      throw error;
    }

    project.progress = 40;
    project.statusMessage = 'Inspecting video format and streams with FFprobe...';
    await saveProject(project);

    // FFprobe inspection
    const metadata = await probeVideo(targetFilePath);

    project.localVideoPath = targetFilePath;
    project.originalFileName = filename;
    project.videoMetadata = metadata;
    project.status = 'QUEUED';
    project.progress = 100;

    const isAudioOnly = !metadata.videoCodec && metadata.hasAudio;
    if (isAudioOnly) {
      project.sourceType = 'audio';
    }

    project.statusMessage = isAudioOnly
      ? `Audio inspection complete. Duration: ${Math.round(metadata.duration)}s, Codec: ${metadata.audioCodec || 'audio'}. Ready for AI analysis.`
      : `Video inspection complete. Duration: ${Math.round(metadata.duration)}s, Resolution: ${metadata.width}x${metadata.height}. Ready for AI analysis.`;
    await saveProject(project);

    return NextResponse.json({
      success: true,
      project,
      metadata,
    });
  } catch (err: any) {
    console.error('Upload handler error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err instanceof UploadRequestError ? err.status : 500 });
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
