import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectDirs, loadProject, sanitizeFilename } from '@/lib/storage';
import { extractClipAudio } from '@/lib/ffmpeg';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const clipId = body.clipId as string | undefined;

    if (!clipId) {
      return NextResponse.json({ success: false, error: 'clipId is required' }, { status: 400 });
    }

    const candidate = project.candidates.find((c) => c.id === clipId);
    const start = typeof body.start === 'number' ? body.start : (candidate ? candidate.start : 0);
    const end = typeof body.end === 'number' ? body.end : (candidate ? candidate.end : 0);
    const duration = Math.max(0.5, end - start);

    const dirs = getProjectDirs(project.id);
    const clipSafeId = sanitizeFilename(clipId);
    const outputAudioPath = path.join(dirs.clipsDir, `${clipSafeId}_audio.mp3`);
    const audioUrl = `/api/files/projects/${project.id}/clips/${clipSafeId}_audio.mp3`;

    // 1. If clip audio is already extracted and non-empty, return cached asset immediately
    if (fs.existsSync(/*turbopackIgnore: true*/ outputAudioPath)) {
      const stat = fs.statSync(/*turbopackIgnore: true*/ outputAudioPath);
      if (stat.size > 1000) {
        return NextResponse.json({
          success: true,
          audioUrl,
          audioPath: outputAudioPath,
          duration,
          fileSize: stat.size,
          cached: true,
        });
      }
    }

    // 2. Identify source video for audio extraction
    let sourceVideoPath: string | undefined = undefined;

    if (candidate?.renderedVideoPath && fs.existsSync(/*turbopackIgnore: true*/ candidate.renderedVideoPath)) {
      sourceVideoPath = candidate.renderedVideoPath;
    } else if (project.localVideoPath && fs.existsSync(/*turbopackIgnore: true*/ project.localVideoPath)) {
      sourceVideoPath = project.localVideoPath;
    } else if (fs.existsSync(/*turbopackIgnore: true*/ dirs.originalDir)) {
      const files = fs.readdirSync(dirs.originalDir);
      const vid = files.find((f) => /\.(mp4|mov|webm|mkv|m4a|mp3|wav)$/i.test(f));
      if (vid) {
        sourceVideoPath = path.join(dirs.originalDir, vid);
      }
    }

    if (!sourceVideoPath || !fs.existsSync(/*turbopackIgnore: true*/ sourceVideoPath)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Original source video is not available locally to extract clip audio.',
        },
        { status: 400 }
      );
    }

    // 3. Extract precise clip audio segment using FFmpeg
    // If sourceVideoPath is already a rendered clip of the exact segment, start from 0; otherwise use clip start/end
    const isRenderedClip = sourceVideoPath === candidate?.renderedVideoPath;
    const extractStart = isRenderedClip ? 0 : start;
    const extractEnd = isRenderedClip ? duration : end;

    await extractClipAudio({
      sourceVideoPath,
      outputPath: outputAudioPath,
      start: extractStart,
      end: extractEnd,
      normalizeAudio: false,
    });

    const stat = await fs.promises.stat(outputAudioPath);

    return NextResponse.json({
      success: true,
      audioUrl,
      audioPath: outputAudioPath,
      duration,
      fileSize: stat.size,
      cached: false,
    });
  } catch (err: any) {
    console.error('Failed to extract clip audio:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to extract clip audio' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const clipId = searchParams.get('clipId');

    if (!clipId) {
      return NextResponse.json({ success: false, error: 'clipId query parameter is required' }, { status: 400 });
    }

    const dirs = getProjectDirs(project.id);
    const clipSafeId = sanitizeFilename(clipId);
    const outputAudioPath = path.join(dirs.clipsDir, `${clipSafeId}_audio.mp3`);
    const fileApiUrl = `/api/files/projects/${project.id}/clips/${clipSafeId}_audio.mp3`;

    // If file doesn't exist, extract it on demand if possible
    if (!fs.existsSync(/*turbopackIgnore: true*/ outputAudioPath) || fs.statSync(/*turbopackIgnore: true*/ outputAudioPath).size <= 1000) {
      const candidate = project.candidates.find((c) => c.id === clipId);
      let sourceVideoPath = candidate?.renderedVideoPath && fs.existsSync(/*turbopackIgnore: true*/ candidate.renderedVideoPath)
        ? candidate.renderedVideoPath
        : project.localVideoPath && fs.existsSync(/*turbopackIgnore: true*/ project.localVideoPath)
        ? project.localVideoPath
        : undefined;

      if (!sourceVideoPath && fs.existsSync(/*turbopackIgnore: true*/ dirs.originalDir)) {
        const files = fs.readdirSync(dirs.originalDir);
        const vid = files.find((f) => /\.(mp4|mov|webm|mkv|m4a|mp3|wav)$/i.test(f));
        if (vid) {
          sourceVideoPath = path.join(dirs.originalDir, vid);
        }
      }

      if (sourceVideoPath && fs.existsSync(/*turbopackIgnore: true*/ sourceVideoPath) && candidate) {
        const isRenderedClip = sourceVideoPath === candidate.renderedVideoPath;
        await extractClipAudio({
          sourceVideoPath,
          outputPath: outputAudioPath,
          start: isRenderedClip ? 0 : candidate.start,
          end: isRenderedClip ? candidate.duration : candidate.end,
          normalizeAudio: false,
        });
      }
    }

    if (searchParams.get('json') === 'true') {
      const exists = fs.existsSync(/*turbopackIgnore: true*/ outputAudioPath);
      return NextResponse.json({
        success: true,
        audioUrl: fileApiUrl,
        audioPath: exists ? outputAudioPath : undefined,
        exists,
      });
    }

    // Redirect to static file streaming route which handles range requests
    return NextResponse.redirect(new URL(fileApiUrl, req.url));
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
