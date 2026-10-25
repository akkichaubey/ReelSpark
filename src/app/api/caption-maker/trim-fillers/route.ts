import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertStorageFile, resolveStoragePath } from '@/lib/storage';
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
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia, mediaUserNamespace, recordMediaOwner } from '@/lib/media-access';
import { backupPrivateMedia, restorePrivateMedia } from '@/lib/cloudflare/private-media';

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const body = await req.json();
    const {
      storagePath,
      fileUrl,
      fillerSegments = [] as FillerSegment[],
      transcript = [] as TranscriptWord[],
      syncedSegments = [] as SyncedPhraseSegment[],
      sfxCues = [] as SfxCue[],
    } = body;

    let targetPath: string | undefined;
    if (storagePath) {
      targetPath = assertStorageFile(storagePath);
    }

    // Resolve from fileUrl if storagePath is not directly passed
    if ((!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) && fileUrl) {
      const decodedUrl = decodeURIComponent(fileUrl);
      if (decodedUrl.startsWith('/api/files/')) {
        const relPart = decodedUrl.replace('/api/files/', '');
        targetPath = resolveStoragePath(relPart);
      } else if (decodedUrl.startsWith('/')) {
        const publicPath = path.resolve(process.cwd(), 'public', decodedUrl.replace(/^\/+/, ''));
        const publicRoot = path.resolve(process.cwd(), 'public');
        if (!publicPath.startsWith(`${publicRoot}${path.sep}`)) throw new Error('Invalid public media path');
        targetPath = publicPath;
      }
    }

    if (targetPath && !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) await restorePrivateMedia(access.user.id, targetPath);
    if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for trimming' },
        { status: 400 }
      );
    }

    if (!(await canReadMedia(access.user.id, targetPath))) {
      return NextResponse.json({ error: 'Media not found. Upload media to your account first.' }, { status: 404 });
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

    // Derived media must remain private and downloadable by its owner.
    const outputDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'trimmed', mediaUserNamespace(access.user.id));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    await recordMediaOwner(outputDir, access.user.id);
    const filename = `jumpcut-${Date.now()}-${path.basename(targetPath, path.extname(targetPath))}.mp3`;
    const outputPath = path.join(outputDir, filename);

    // Perform FFmpeg trim & stitch
    await trimAudioWithFfmpeg(targetPath, outputPath, keepIntervals);
    await backupPrivateMedia(access.user.id, outputPath);

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
