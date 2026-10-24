import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getProjectDirs, loadProject, sanitizeFilename, saveProject } from '@/lib/storage';
import { probeVideo } from '@/lib/ffmpeg';
import { validateUpload } from '@/lib/media-validation';

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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No video file provided' }, { status: 400 });
    }
    const uploadError = validateUpload(file, ['video', 'audio']);
    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError }, { status: 400 });
    }

    const dirs = getProjectDirs(project.id);
    const safeName = sanitizeFilename(file.name || 'uploaded_video.mp4');
    const targetFilePath = path.join(dirs.originalDir, safeName);

    project.status = 'UPLOADING';
    project.progress = 10;
    project.statusMessage = `Saving ${file.name} to local workspace...`;
    await saveProject(project);

    // Stream file to disk
    const nodeStream = Readable.fromWeb(file.stream() as any);
    const writeStream = fs.createWriteStream(targetFilePath);
    await pipeline(nodeStream, writeStream);

    project.progress = 40;
    project.statusMessage = 'Inspecting video format and streams with FFprobe...';
    await saveProject(project);

    // FFprobe inspection
    const metadata = await probeVideo(targetFilePath);

    project.localVideoPath = targetFilePath;
    project.originalFileName = file.name;
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
