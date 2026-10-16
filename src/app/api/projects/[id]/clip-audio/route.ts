import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectDirs, loadProject, saveProject, sanitizeFilename } from '@/lib/storage';
import { extractClipAudio } from '@/lib/ffmpeg';
import { transcribeAudio } from '@/lib/caption-maker/transcription';

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
    const boundsMetaPath = `${outputAudioPath}.bounds.json`;
    const syncCachePath = `${outputAudioPath}.sync.json`;
    const audioUrl = `/api/files/projects/${project.id}/clips/${clipSafeId}_audio.mp3`;

    let wasCached = false;

    // 1. Check if clip audio is already extracted AND matches the exact current [start, end] trim boundaries
    if (fs.existsSync(/*turbopackIgnore: true*/ outputAudioPath)) {
      const existingStat = fs.statSync(/*turbopackIgnore: true*/ outputAudioPath);
      if (existingStat.size > 1000) {
        wasCached = true;
        if (fs.existsSync(/*turbopackIgnore: true*/ boundsMetaPath)) {
          try {
            const prevBounds = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ boundsMetaPath, 'utf8'));
            if (
              Math.abs((prevBounds.start ?? start) - start) > 0.05 ||
              Math.abs((prevBounds.end ?? end) - end) > 0.05
            ) {
              // Clip was trimmed/adjusted -> invalidate cached audio & sync cache!
              wasCached = false;
              if (fs.existsSync(/*turbopackIgnore: true*/ syncCachePath)) {
                fs.unlinkSync(/*turbopackIgnore: true*/ syncCachePath);
              }
            }
          } catch {}
        }
      }
    }

    if (!wasCached) {
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

      try {
        fs.writeFileSync(
          boundsMetaPath,
          JSON.stringify({ start, end, duration, updatedAt: new Date().toISOString() }),
          'utf8'
        );
      } catch {}
    }

    const stat = await fs.promises.stat(outputAudioPath);

    // 4. Transcribe / load cached acoustic-locked transcript for this exact audio clip
    let syncData: {
      syncedSegments?: any[];
      rawTranscriptHindi?: string;
      rawTranscriptEnglish?: string;
      titleHindi?: string;
      titleEnglish?: string;
      isAudioSynced?: boolean;
    } = {};

    try {
      const fallbackHint = candidate
        ? {
            textHindi: candidate.transcriptHindi || candidate.transcript,
            textEnglish: candidate.transcriptEnglish || candidate.transcript,
            titleHindi: candidate.titleHindi || candidate.title,
            titleEnglish: candidate.titleEnglish || candidate.title,
          }
        : undefined;

      const transResult = await transcribeAudio(outputAudioPath, 'en', fallbackHint);
      if (transResult.syncedSegments && transResult.syncedSegments.length > 0) {
        syncData = {
          syncedSegments: transResult.syncedSegments,
          rawTranscriptHindi: transResult.rawTranscriptHindi,
          rawTranscriptEnglish: transResult.rawTranscriptEnglish,
          titleHindi: transResult.titleHindi,
          titleEnglish: transResult.titleEnglish,
          isAudioSynced: true,
        };

        // Dynamically update candidate AND project.transcript in manifest so ALL players & SRTs stay 100% synced
        if (candidate) {
          (candidate as any).syncedSegments = transResult.syncedSegments;
          if (transResult.rawTranscriptHindi) {
            candidate.transcript = transResult.rawTranscriptHindi;
            candidate.transcriptHindi = transResult.rawTranscriptHindi;
          }
          if (transResult.rawTranscriptEnglish) {
            candidate.transcriptEnglish = transResult.rawTranscriptEnglish;
          }
          if (transResult.titleHindi) {
            candidate.titleHindi = transResult.titleHindi;
          }
          if (transResult.titleEnglish) {
            candidate.titleEnglish = transResult.titleEnglish;
            candidate.title = transResult.titleEnglish;
          }
        }

        // Splice exact acoustic-locked segments into project.transcript for [start, end]
        if (Array.isArray(project.transcript)) {
          const outsideSegments = project.transcript.filter(
            (seg) => seg.end <= start + 0.1 || seg.start >= end - 0.1
          );
          const syncedProjectSegments = transResult.syncedSegments.map((s, idx) => ({
            id: `sync_${clipSafeId}_${idx + 1}`,
            start: Number((start + s.start).toFixed(2)),
            end: Number((start + s.end).toFixed(2)),
            text: s.textHindi || s.textEnglish,
            textEn: s.textEnglish || s.textHindi,
            speaker: 'Speaker',
            confidence: 0.99,
          }));
          project.transcript = [...outsideSegments, ...syncedProjectSegments].sort(
            (a, b) => a.start - b.start
          );
        }

        await saveProject(project).catch(() => {});
      }
    } catch (syncErr) {
      console.warn('Clip audio transcription sync skipped:', syncErr);
    }

    return NextResponse.json({
      success: true,
      audioUrl,
      audioPath: outputAudioPath,
      duration,
      fileSize: stat.size,
      cached: wasCached,
      ...syncData,
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
