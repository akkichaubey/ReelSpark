import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { probeVideo } from '@/lib/ffmpeg';
import {
  computeKeepIntervals,
  remapTranscriptWords,
  remapSyncedSegments,
  remapSfxCues,
  trimAudioWithFfmpeg,
} from '@/lib/caption-maker/audio-trimmer';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';
import { FillerSegment, SfxCue, SyncedPhraseSegment, TranscriptWord } from '@/lib/caption-maker/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      storagePath,
      fileUrl,
      fillerSegments = [] as FillerSegment[],
      transcript = [] as TranscriptWord[],
      syncedSegments = [] as SyncedPhraseSegment[],
      sfxCues = [] as SfxCue[],
    } = body;

    let targetPath = storagePath;

    // Resolve from fileUrl if storagePath is not directly passed
    if ((!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) && fileUrl) {
      const decodedUrl = decodeURIComponent(fileUrl);
      if (decodedUrl.startsWith('/api/files/')) {
        const relPart = decodedUrl.replace('/api/files/', '');
        targetPath = path.join(APP_CONFIG.storageRoot, relPart);
      } else if (decodedUrl.startsWith('/')) {
        targetPath = path.join(process.cwd(), 'public', decodedUrl.replace(/^\/+/, ''));
      }
    }

    if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for trimming' },
        { status: 400 }
      );
    }

    if (!fillerSegments || fillerSegments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No filler segments to trim',
        storagePath: targetPath,
        fileUrl,
        transcript,
        syncedSegments,
        sfxCues,
        trimmedSeconds: 0,
      });
    }

    // Inspect audio duration
    const meta = await probeVideo(targetPath);
    const originalDuration = meta.duration || 0;

    if (originalDuration <= 0.1) {
      return NextResponse.json(
        { error: 'Invalid audio duration' },
        { status: 400 }
      );
    }

    // Compute keep intervals
    const keepIntervals = computeKeepIntervals(originalDuration, fillerSegments);

    // If total kept duration is virtually identical to original, skip trimming
    const totalKeptDuration = keepIntervals.reduce((sum, k) => sum + k.duration, 0);
    if (Math.abs(totalKeptDuration - originalDuration) < 0.1) {
      return NextResponse.json({
        success: true,
        message: 'No detectable gaps to trim',
        storagePath: targetPath,
        fileUrl,
        transcript,
        syncedSegments,
        sfxCues,
        trimmedSeconds: 0,
      });
    }

    // Generate output file in temp directory
    if (!fs.existsSync(APP_CONFIG.tempDir)) {
      fs.mkdirSync(APP_CONFIG.tempDir, { recursive: true });
    }
    const filename = `jumpcut-${Date.now()}-${path.basename(targetPath, path.extname(targetPath))}.mp3`;
    const outputPath = path.join(APP_CONFIG.tempDir, filename);

    // Perform FFmpeg trim & stitch
    await trimAudioWithFfmpeg(targetPath, outputPath, keepIntervals);

    // Inspect newly generated audio duration
    const newMeta = await probeVideo(outputPath);
    const newDuration = newMeta.duration || totalKeptDuration;

    // Remap transcript words, phrase segments, and SFX cues
    const remappedWords = remapTranscriptWords(transcript, keepIntervals);
    const remappedSynced = remapSyncedSegments(syncedSegments, keepIntervals);
    const remappedSfx = remapSfxCues(sfxCues, keepIntervals);
    const newCaptionGroups = groupTranscriptWords(remappedWords, 4);

    const relativePath = path.relative(APP_CONFIG.storageRoot, outputPath).replace(/\\/g, '/');
    const newAudioUrl = `/api/files/${relativePath}`;
    const trimmedSeconds = Math.max(0, originalDuration - newDuration);

    return NextResponse.json({
      success: true,
      audioUrl: newAudioUrl,
      storagePath: outputPath,
      duration: Math.round(newDuration * 100) / 100,
      trimmedSeconds: Math.round(trimmedSeconds * 100) / 100,
      transcript: remappedWords,
      captionGroups: newCaptionGroups,
      syncedSegments: remappedSynced,
      sfxCues: remappedSfx,
      fillerSegments: [], // Clear trimmed fillers
    });
  } catch (err: any) {
    console.error('Trim fillers API error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to trim fillers' },
      { status: 500 }
    );
  }
}
