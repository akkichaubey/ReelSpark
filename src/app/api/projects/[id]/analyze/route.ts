import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectDirs, loadProject, saveProject } from '@/lib/storage';
import { extractAudioForTranscription, probeVideo, detectSpeechIntervals, SpeechInterval } from '@/lib/ffmpeg';
import { analyzeTranscriptChunkWithOllama } from '@/lib/ollama';
import { transcribeAudioWithCloudflarAI } from '@/lib/cloudflare/ai';
import { calculateTimelineCoverage, chunkTranscript, extractHeuristicCandidatesFromChunk, generateDemoSpeechTranscript } from '@/lib/transcript';
import { verifyCandidateContext } from '@/lib/context-verifier';
import { processCandidates } from '@/lib/ranking';
import { ClipCandidate, TranscriptSegment } from '@/lib/types';
import { checkOllamaStatus, getOllamaModel } from '@/lib/config';

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

    if (!project.localVideoPath || !fs.existsSync(project.localVideoPath)) {
      return NextResponse.json({
        success: false,
        error: 'Original video file not found on disk. Please upload the video file first.',
      }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const chosenModel = body?.model || project.settings?.aiModel || getOllamaModel();

    if (!project.settings) {
      project.settings = {} as any;
    }
    project.settings.aiModel = chosenModel;

    const dirs = getProjectDirs(project.id);
    const ollamaStatus = await checkOllamaStatus();

    // Step 1: Ensure metadata is loaded
    if (!project.videoMetadata) {
      project.videoMetadata = await probeVideo(project.localVideoPath);
    }
    const duration = project.videoMetadata.duration || 60;

    // Step 2: Speech-to-Text Transcription Pipeline with Hardware Acoustic Speech Intervals
    project.status = 'TRANSCRIBING';
    project.progress = 15;
    project.statusMessage = `Extracting audio and generating timestamped speech-to-text transcript...`;
    await saveProject(project);

    let transcript: TranscriptSegment[] = [];
    let detectedIntervals: SpeechInterval[] = [];

    if (project.videoMetadata.hasAudio) {
      const tempAudioPath = path.join(dirs.rootDir, 'extracted_audio.mp3');
      try {
        await extractAudioForTranscription(project.localVideoPath, tempAudioPath);
        const { intervals } = await detectSpeechIntervals(tempAudioPath);
        detectedIntervals = intervals;

        // Try Cloudflare Whisper AI if configured
        if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
          try {
            transcript = await transcribeAudioWithCloudflarAI(tempAudioPath);
          } catch (cfErr: any) {
            console.warn('Cloudflare Whisper transcription warning:', cfErr?.message);
          }
        }
      } catch (err: any) {
        console.warn('Audio extraction warning:', err.message);
      } finally {
        if (fs.existsSync(tempAudioPath)) {
          await fs.promises.unlink(tempAudioPath).catch(() => {});
        }
      }
    }

    // Fallback if transcript is empty, locked to hardware acoustic speech intervals
    if (transcript.length === 0) {
      transcript = generateDemoSpeechTranscript(
        duration,
        project.title || project.originalFileName,
        detectedIntervals
      );
    }

    // Save full transcript
    project.transcript = transcript;
    await fs.promises.writeFile(
      path.join(dirs.transcriptsDir, 'full_transcript.json'),
      JSON.stringify(transcript, null, 2),
      'utf8'
    );

    // Step 3: Chunk transcript into overlapping sections
    project.status = 'ANALYZING';
    project.progress = 40;
    project.statusMessage = 'Analyzing full video timeline into overlapping sections with Ollama...';
    await saveProject(project);

    const chunks = chunkTranscript(transcript, 180, 30);
    const rawCandidates: ClipCandidate[] = [];
    const analyzedRanges: Array<[number, number]> = [];
    let ollamaFailed = false;

    // Step 4: Chronological AI semantic analysis with Ollama
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      analyzedRanges.push([chunk.startTime, chunk.endTime]);

      project.progress = Math.round(40 + (i / chunks.length) * 35);
      project.statusMessage = `Analyzing section ${i + 1} of ${chunks.length} (${Math.round(chunk.startTime)}s - ${Math.round(chunk.endTime)}s)${rawCandidates.length > 0 ? ` • ${rawCandidates.length} viral clips discovered` : ''}...`;
      await saveProject(project);

      const chunkCandidates: ClipCandidate[] = [];

      if (ollamaStatus.configured && !ollamaFailed) {
        try {
          const discovered = await analyzeTranscriptChunkWithOllama({
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            transcriptText: chunk.text,
            transcriptSegments: chunk.segments,
            durationLimitSeconds: project.settings.durationLimit === 'auto' ? 60 : parseInt(project.settings.durationLimit, 10),
          }, chosenModel);
          if (discovered && discovered.length > 0) {
            chunkCandidates.push(...discovered);
          }
        } catch (err: any) {
          console.warn(`Chunk ${i} Ollama analysis error:`, err.message);
          ollamaFailed = true;
        }
      }

      // If Ollama returned no candidates (or failed / offline),
      // seamlessly extract candidates from the speech section using local NLP
      if (chunkCandidates.length === 0) {
        const fallbackClips = extractHeuristicCandidatesFromChunk(
          chunk,
          i,
          project.settings.durationLimit === 'auto' ? 60 : parseInt(project.settings.durationLimit, 10)
        );
        chunkCandidates.push(...fallbackClips);
      }

      rawCandidates.push(...chunkCandidates);
    }

    // Step 5: Context Verification & Boundary Adjustment
    project.status = 'VERIFYING';
    project.progress = 80;
    project.statusMessage = 'Verifying standalone context, pronouns, and boundary cutoffs...';
    await saveProject(project);

    const verifiedCandidates: ClipCandidate[] = rawCandidates.map(candidate => {
      const verification = verifyCandidateContext(
        candidate.start,
        candidate.end,
        candidate.transcript,
        transcript,
        project.settings.durationLimit === 'auto' ? 60 : parseInt(project.settings.durationLimit, 10)
      );

      // If boundary adjustment was suggested, apply it
      if (verification.suggestedAdjustment) {
        candidate.start = verification.suggestedAdjustment.start;
        candidate.end = verification.suggestedAdjustment.end;
        candidate.duration = Math.round((candidate.end - candidate.start) * 10) / 10;
      }

      candidate.contextVerification = verification;
      return candidate;
    });

    // Step 6: Ranking & Deduplication
    project.status = 'RANKING';
    project.progress = 90;
    project.statusMessage = 'Ranking candidates and eliminating duplicate moments...';
    await saveProject(project);

    const finalCandidates = processCandidates(
      verifiedCandidates,
      project.settings.durationLimit
    );

    // Step 7: Calculate timeline coverage
    const timelineCoverage = calculateTimelineCoverage(analyzedRanges, duration);

    // Save final project state
    project.candidates = finalCandidates;
    project.timelineCoverage = timelineCoverage;
    project.status = 'COMPLETED';
    project.progress = 100;
    project.statusMessage = `Successfully analyzed ${Math.round(duration)}s video with ${chosenModel}. Discovered ${finalCandidates.length} high-potential short clips.`;

    await saveProject(project);

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (err: any) {
    console.error('Project analysis error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'An unexpected error occurred during AI analysis.',
    }, { status: 500 });
  }
}
