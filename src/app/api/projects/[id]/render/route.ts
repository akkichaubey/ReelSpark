import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectDirs, loadProject, saveProject } from '@/lib/storage';
import { extractClipAudio, renderClip } from '@/lib/ffmpeg';
import { transcribeAudio } from '@/lib/caption-maker/transcription';
import { generateAssForClip, generateSrtForClip } from '@/lib/srt';
import { ClipCandidate } from '@/lib/types';

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

    if (!project.localVideoPath || !fs.existsSync(project.localVideoPath)) {
      return NextResponse.json({
        success: false,
        error: 'Local video file is missing. Please ensure the original video is available for rendering.',
      }, { status: 400 });
    }

    const body = await req.json();
    const clipId = body.clipId as string | undefined;
    const renderAllSelected = body.renderAllSelected as boolean | undefined;

    const dirs = getProjectDirs(project.id);
    const clipsToRender: ClipCandidate[] = [];

    if (clipId) {
      const target = project.candidates.find(c => c.id === clipId);
      if (!target) {
        return NextResponse.json({ success: false, error: 'Clip candidate not found' }, { status: 404 });
      }
      clipsToRender.push(target);
    } else if (renderAllSelected) {
      clipsToRender.push(...project.candidates.filter(c => c.selected));
    } else {
      return NextResponse.json({ success: false, error: 'Please specify clipId or renderAllSelected' }, { status: 400 });
    }

    if (clipsToRender.length === 0) {
      return NextResponse.json({ success: false, error: 'No clips selected for rendering' }, { status: 400 });
    }

    project.status = 'RENDERING';
    project.statusMessage = `Rendering ${clipsToRender.length} clip(s) with FFmpeg...`;
    await saveProject(project);

    const results = [];

    for (let i = 0; i < clipsToRender.length; i++) {
      const clip = clipsToRender[i];
      clip.renderStatus = 'rendering';
      await saveProject(project);

      const clipSafeId = clip.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const outputVideoPath = path.join(dirs.renderedDir, `${clipSafeId}.mp4`);
      const outputSrtPath = path.join(dirs.srtDir, `${clipSafeId}.srt`);
      const outputAssPath = path.join(dirs.srtDir, `${clipSafeId}.ass`);

      try {
        // 0. Dynamically ensure this clip has acoustic-locked speech segments before generating SRT/ASS
        try {
          const clipAudioPath = path.join(dirs.clipsDir, `${clipSafeId}_audio.mp3`);
          if (!fs.existsSync(clipAudioPath) || fs.statSync(clipAudioPath).size < 1000) {
            await extractClipAudio({
              sourceVideoPath: project.localVideoPath,
              outputPath: clipAudioPath,
              start: clip.start,
              end: clip.end,
              normalizeAudio: false,
            });
          }
          const transRes = await transcribeAudio(clipAudioPath, 'en', {
            textHindi: clip.transcriptHindi || clip.transcript,
            textEnglish: clip.transcriptEnglish || clip.transcript,
            titleHindi: clip.titleHindi || clip.title,
            titleEnglish: clip.titleEnglish || clip.title,
          });
          if (transRes.syncedSegments && transRes.syncedSegments.length > 0) {
            (clip as any).syncedSegments = transRes.syncedSegments;
            const outsideSegments = (project.transcript || []).filter(
              (seg) => seg.end <= clip.start + 0.1 || seg.start >= clip.end - 0.1
            );
            const syncedProjectSegments = transRes.syncedSegments.map((s, idx) => ({
              id: `sync_${clipSafeId}_${idx + 1}`,
              start: Number((clip.start + s.start).toFixed(2)),
              end: Number((clip.start + s.end).toFixed(2)),
              text: s.textHindi || s.textEnglish,
              textEn: s.textEnglish || s.textHindi,
              speaker: 'Speaker',
              confidence: 0.99,
            }));
            project.transcript = [...outsideSegments, ...syncedProjectSegments].sort(
              (a, b) => a.start - b.start
            );
          }
        } catch (syncErr) {
          console.warn('Pre-render clip acoustic sync fallback:', syncErr);
        }

        // 1. Generate local synchronized SRT file
        const srtContent = generateSrtForClip(project.transcript, clip.start, clip.end);
        await fs.promises.writeFile(outputSrtPath, srtContent, 'utf8');
        clip.renderedSrtPath = outputSrtPath;

        // 2. Generate ASS subtitle if subtitles are to be burned in
        let assPathToUse: string | undefined = undefined;
        if (project.settings.burnSubtitles) {
          const assContent = generateAssForClip(
            project.transcript,
            clip.start,
            clip.end,
            project.settings.subtitleStyle,
            1080,
            1920
          );
          await fs.promises.writeFile(outputAssPath, assContent, 'utf8');
          assPathToUse = outputAssPath;
        }

        // 3. Render with FFmpeg
        const renderResult = await renderClip({
          sourceVideoPath: project.localVideoPath,
          outputPath: outputVideoPath,
          start: clip.start,
          end: clip.end,
          aspectRatio: project.settings.aspectRatio,
          normalizeAudio: project.settings.normalizeAudio,
          subtitlesAssPath: assPathToUse,
        });

        clip.renderStatus = 'completed';
        clip.renderedVideoPath = renderResult.outputPath;
        clip.renderError = undefined;

        results.push({
          clipId: clip.id,
          success: true,
          videoPath: renderResult.outputPath,
          srtPath: outputSrtPath,
          duration: renderResult.duration,
        });
      } catch (renderErr: any) {
        console.error(`Rendering failed for clip ${clip.id}:`, renderErr);
        clip.renderStatus = 'failed';
        clip.renderError = renderErr.message;
        results.push({
          clipId: clip.id,
          success: false,
          error: renderErr.message,
        });
      }

      project.progress = Math.round(((i + 1) / clipsToRender.length) * 100);
      await saveProject(project);
    }

    project.status = 'COMPLETED';
    project.statusMessage = `Rendering completed for ${results.filter(r => r.success).length} of ${clipsToRender.length} clip(s).`;
    await saveProject(project);

    return NextResponse.json({
      success: true,
      project,
      results,
    });
  } catch (err: any) {
    console.error('Rendering handler error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
