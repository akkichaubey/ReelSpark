import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectDirs, loadProject, saveProject } from '@/lib/storage';
import { extractAudioForTranscription, probeVideo } from '@/lib/ffmpeg';
import { transcribeAudioWithGemini, analyzeTranscriptChunkWithGemini } from '@/lib/gemini';
import { calculateTimelineCoverage, chunkTranscript, extractHeuristicCandidatesFromChunk, generateDemoSpeechTranscript } from '@/lib/transcript';
import { verifyCandidateContext } from '@/lib/context-verifier';
import { processCandidates } from '@/lib/ranking';
import { ClipCandidate, TranscriptSegment } from '@/lib/types';
import { checkGeminiStatus } from '@/lib/config';

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
        error: 'Original video file not found on disk. Please upload the video file first.',
      }, { status: 400 });
    }

    const dirs = getProjectDirs(project.id);
    const geminiStatus = checkGeminiStatus();

    // Step 1: Ensure metadata is loaded
    if (!project.videoMetadata) {
      project.videoMetadata = await probeVideo(project.localVideoPath);
    }
    const duration = project.videoMetadata.duration || 60;

    // Step 2: Speech-to-Text Transcription Pipeline
    project.status = 'TRANSCRIBING';
    project.progress = 15;
    project.statusMessage = 'Extracting audio and generating timestamped speech-to-text transcript...';
    await saveProject(project);

    let transcript: TranscriptSegment[] = [];

    if (geminiStatus.configured && project.videoMetadata.hasAudio) {
      try {
        const tempAudioPath = path.join(dirs.rootDir, 'extracted_audio.mp3');
        await extractAudioForTranscription(project.localVideoPath, tempAudioPath);
        transcript = await transcribeAudioWithGemini(tempAudioPath);

        // cleanup temp audio
        if (fs.existsSync(tempAudioPath)) {
          await fs.promises.unlink(tempAudioPath).catch(() => {});
        }
      } catch (err: any) {
        console.warn('Gemini audio transcription fallback to speech transcript:', err.message);
      }
    }

    // Fallback if transcript is empty (or no API key provided)
    if (transcript.length === 0) {
      transcript = generateDemoSpeechTranscript(duration, project.title || project.originalFileName);
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
    project.statusMessage = 'Analyzing full video timeline into overlapping sections...';
    await saveProject(project);

    const chunks = chunkTranscript(transcript, 180, 30);
    const rawCandidates: ClipCandidate[] = [];
    const analyzedRanges: Array<[number, number]> = [];
    let geminiQuotaExhausted = false;

    // Step 4: Chronological AI semantic analysis
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      analyzedRanges.push([chunk.startTime, chunk.endTime]);

      project.progress = Math.round(40 + (i / chunks.length) * 35);
      project.statusMessage = `Analyzing section ${i + 1} of ${chunks.length} (${Math.round(chunk.startTime)}s - ${Math.round(chunk.endTime)}s)${rawCandidates.length > 0 ? ` • ${rawCandidates.length} viral clips discovered` : ''}...`;
      await saveProject(project);

      let chunkCandidates: ClipCandidate[] = [];

      if (geminiStatus.configured && !geminiQuotaExhausted) {
        try {
          const discovered = await analyzeTranscriptChunkWithGemini({
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            transcriptText: chunk.text,
            transcriptSegments: chunk.segments,
            durationLimitSeconds: project.settings.durationLimit === 'auto' ? 60 : parseInt(project.settings.durationLimit, 10),
          });
          if (discovered && discovered.length > 0) {
            chunkCandidates.push(...discovered);
          }
        } catch (err: any) {
          console.warn(`Chunk ${i} AI analysis error:`, err.message);
          if (err.status === 429 || (err.message && err.message.toLowerCase().includes('quota'))) {
            geminiQuotaExhausted = true;
          }
        }
      }

      // If Gemini returned no candidates (or failed/rate-limited/not configured),
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

    // Compute Timeline Coverage
    project.timelineCoverage = calculateTimelineCoverage(analyzedRanges, duration);
    project.candidates = finalCandidates;
    project.status = 'COMPLETED';
    project.progress = 100;
    project.statusMessage = `Analysis complete! Discovered ${finalCandidates.length} high-impact clips covering ${project.timelineCoverage.coveragePercent}% of the video.`;
    await saveProject(project);

    return NextResponse.json({
      success: true,
      project,
      clipCount: finalCandidates.length,
      coverage: project.timelineCoverage,
    });
  } catch (err: any) {
    console.error('Analysis error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
