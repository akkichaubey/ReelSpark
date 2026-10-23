import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath } from '../config';
import { probeVideo } from '../ffmpeg';
import { FillerSegment, SfxCue, SyncedPhraseSegment, TranscriptWord } from './types';

const execFileAsync = promisify(execFile);

export interface KeepInterval {
  start: number;
  end: number;
  duration: number;
  accumulatedOffset: number;
}

/**
 * Given the total duration and a list of filler/silence segments to cut out,
 * compute the complementary intervals to KEEP.
 */
export function computeKeepIntervals(
  totalDuration: number,
  fillerSegments: FillerSegment[]
): KeepInterval[] {
  if (!totalDuration || totalDuration <= 0) {
    return [{ start: 0, end: 0, duration: 0, accumulatedOffset: 0 }];
  }

  if (!fillerSegments || fillerSegments.length === 0) {
    return [{ start: 0, end: totalDuration, duration: totalDuration, accumulatedOffset: 0 }];
  }

  // 1. Sanitize and sort filler intervals
  const sortedFillers = fillerSegments
    .map((f) => ({
      start: Math.max(0, Math.min(totalDuration, Number(f.start) || 0)),
      end: Math.max(0, Math.min(totalDuration, Number(f.end) || 0)),
    }))
    .filter((f) => f.end > f.start + 0.05) // ignore micro-intervals under 50ms
    .sort((a, b) => a.start - b.start);

  if (sortedFillers.length === 0) {
    return [{ start: 0, end: totalDuration, duration: totalDuration, accumulatedOffset: 0 }];
  }

  // 2. Merge overlapping or contiguous filler intervals
  const mergedFillers: { start: number; end: number }[] = [];
  for (const f of sortedFillers) {
    const last = mergedFillers[mergedFillers.length - 1];
    if (last && f.start <= last.end + 0.05) {
      last.end = Math.max(last.end, f.end);
    } else {
      mergedFillers.push({ start: f.start, end: f.end });
    }
  }

  // 3. Invert merged fillers to derive keep intervals
  const keepList: { start: number; end: number }[] = [];
  let currentPos = 0;

  for (const filler of mergedFillers) {
    if (filler.start > currentPos + 0.05) {
      keepList.push({ start: currentPos, end: filler.start });
    }
    currentPos = Math.max(currentPos, filler.end);
  }

  if (currentPos < totalDuration - 0.05) {
    keepList.push({ start: currentPos, end: totalDuration });
  }

  // If every part got trimmed, preserve at least a minimal fallback
  if (keepList.length === 0) {
    return [{ start: 0, end: totalDuration, duration: totalDuration, accumulatedOffset: 0 }];
  }

  // 4. Calculate accumulated offsets
  let accumulated = 0;
  const keepIntervals: KeepInterval[] = [];

  for (const item of keepList) {
    const duration = Math.max(0, item.end - item.start);
    keepIntervals.push({
      start: item.start,
      end: item.end,
      duration,
      accumulatedOffset: accumulated,
    });
    accumulated += duration;
  }

  return keepIntervals;
}

/**
 * Map an original timestamp `t` to the new timeline after cutting.
 * Returns null if the timestamp falls completely inside a cut interval.
 */
export function remapTimestamp(
  t: number,
  keepIntervals: KeepInterval[]
): { newTime: number; insideCut: boolean } {
  if (keepIntervals.length === 0) return { newTime: t, insideCut: false };

  // Before first keep interval
  if (t < keepIntervals[0].start) {
    return { newTime: 0, insideCut: true };
  }

  for (let i = 0; i < keepIntervals.length; i++) {
    const interval = keepIntervals[i];
    if (t >= interval.start && t <= interval.end) {
      const offsetInInterval = t - interval.start;
      return {
        newTime: interval.accumulatedOffset + offsetInInterval,
        insideCut: false,
      };
    }

    // Inside a cut interval between i and i+1
    if (i < keepIntervals.length - 1) {
      const nextInterval = keepIntervals[i + 1];
      if (t > interval.end && t < nextInterval.start) {
        return {
          newTime: interval.accumulatedOffset + interval.duration,
          insideCut: true,
        };
      }
    }
  }

  // Beyond last keep interval
  const last = keepIntervals[keepIntervals.length - 1];
  return {
    newTime: last.accumulatedOffset + last.duration,
    insideCut: t > last.end,
  };
}

/**
 * Re-align transcript words to the shortened timeline.
 * Words entirely inside cut filler gaps are removed.
 */
export function remapTranscriptWords(
  words: TranscriptWord[],
  keepIntervals: KeepInterval[]
): TranscriptWord[] {
  if (!words || words.length === 0) return [];
  if (keepIntervals.length === 0) return words;

  const remapped: TranscriptWord[] = [];

  for (const w of words) {
    // Check overlap with kept intervals
    const hasOverlap = keepIntervals.some(
      (k) => Math.max(w.start, k.start) < Math.min(w.end, k.end)
    );

    if (!hasOverlap) {
      // Entirely inside a cut interval (filler word) -> prune
      continue;
    }

    const startMapped = remapTimestamp(w.start, keepIntervals);
    const endMapped = remapTimestamp(w.end, keepIntervals);

    const newStart = Math.max(0, startMapped.newTime);
    const newEnd = Math.max(newStart + 0.05, endMapped.newTime);

    remapped.push({
      ...w,
      start: Math.round(newStart * 100) / 100,
      end: Math.round(newEnd * 100) / 100,
    });
  }

  return remapped;
}

/**
 * Re-align synced phrase segments.
 */
export function remapSyncedSegments(
  segments: SyncedPhraseSegment[],
  keepIntervals: KeepInterval[]
): SyncedPhraseSegment[] {
  if (!segments || segments.length === 0) return [];
  if (keepIntervals.length === 0) return segments;

  const remapped: SyncedPhraseSegment[] = [];

  for (const seg of segments) {
    const hasOverlap = keepIntervals.some(
      (k) => Math.max(seg.start, k.start) < Math.min(seg.end, k.end)
    );
    if (!hasOverlap) continue;

    const startMapped = remapTimestamp(seg.start, keepIntervals);
    const endMapped = remapTimestamp(seg.end, keepIntervals);

    const newStart = Math.max(0, startMapped.newTime);
    const newEnd = Math.max(newStart + 0.1, endMapped.newTime);

    remapped.push({
      ...seg,
      start: Math.round(newStart * 100) / 100,
      end: Math.round(newEnd * 100) / 100,
    });
  }

  return remapped;
}

/**
 * Re-align SFX cues, discarding cues that fell into cut regions.
 */
export function remapSfxCues(cues: SfxCue[], keepIntervals: KeepInterval[]): SfxCue[] {
  if (!cues || cues.length === 0) return [];
  if (keepIntervals.length === 0) return cues;

  const remapped: SfxCue[] = [];

  for (const cue of cues) {
    const mapped = remapTimestamp(cue.time, keepIntervals);
    if (mapped.insideCut) {
      // Drop SFX that fired during a trimmed dead-air or filler
      continue;
    }
    remapped.push({
      ...cue,
      time: Math.round(mapped.newTime * 100) / 100,
    });
  }

  return remapped;
}

/**
 * Cut and assemble audio segments using FFmpeg filtergraph atrim and concat.
 */
export async function trimAudioWithFfmpeg(
  inputAudioPath: string,
  outputAudioPath: string,
  keepIntervals: KeepInterval[]
): Promise<void> {
  const ffmpeg = getFfmpegPath();
  const dir = path.dirname(outputAudioPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // If there's only 1 keep interval that spans the whole audio, copy directly
  if (keepIntervals.length === 1 && keepIntervals[0].start === 0) {
    const args = [
      '-y',
      '-i', inputAudioPath,
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      outputAudioPath,
    ];
    await execFileAsync(ffmpeg, args);
    return;
  }

  // Build filter_complex with atrim and concat
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < keepIntervals.length; i++) {
    const k = keepIntervals[i];
    filterParts.push(
      `[0:a]atrim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    );
    concatInputs.push(`[a${i}]`);
  }

  filterParts.push(
    `${concatInputs.join('')}concat=n=${keepIntervals.length}:v=0:a=1[outa]`
  );

  const filterGraph = filterParts.join('; ');

  const args = [
    '-y',
    '-i', inputAudioPath,
    '-filter_complex', filterGraph,
    '-map', '[outa]',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    outputAudioPath,
  ];

  await execFileAsync(ffmpeg, args);
}
