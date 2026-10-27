import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFfmpegPath } from '../config';
import { probeAudioDuration } from './ffmpeg-renderer';
import type { CaptionGroup, TranscriptWord, TrimRange, SfxCue } from './types';

const run = promisify(execFile);

/** Source coordinates remain untouched in saved state. Rebase only the export copy. */
export function trimCaptionTiming(
  words: TranscriptWord[],
  groups: CaptionGroup[],
  range: TrimRange
) {
  const trimWords = (input: TranscriptWord[]) =>
    input
      .filter((word) => word.end > range.start && word.start < range.end)
      .map((word) => ({
        ...word,
        start: Math.max(range.start, word.start) - range.start,
        end: Math.min(range.end, word.end) - range.start,
      }));
  return {
    words: trimWords(words),
    groups: groups
      .filter((group) => group.end > range.start && group.start < range.end)
      .map((group) => {
        const retained = trimWords(group.words);
        return {
          ...group,
          start: Math.max(range.start, group.start) - range.start,
          end: Math.min(range.end, group.end) - range.start,
          words: retained,
          text: retained.map((word) => word.text).join(' '),
        };
      })
      .filter((group) => group.words.length > 0),
  };
}

export async function prepareRenderTrim(input: {
  audioPath: string;
  imagePath: string;
  mediaType: 'image' | 'video';
  range?: TrimRange;
  words: TranscriptWord[];
  groups: CaptionGroup[];
  sfxCues?: SfxCue[];
  directory: string;
  signal?: AbortSignal;
}) {
  const temporary: string[] = [];
  const cleanup = async () => {
    await Promise.all(
      temporary.map((filename) => fs.rm(filename, { force: true }))
    );
  };
  const range = input.range;
  if (!range) return { ...input, offset: 0, cleanup };
  const duration = await probeAudioDuration(input.audioPath);
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end <= range.start ||
    range.end > duration + 0.05
  )
    throw new Error('Invalid trim range for source audio');
  if (range.start === 0 && Math.abs(range.end - duration) < 0.01)
    return { ...input, offset: 0, cleanup };
  const seconds = range.end - range.start;
  const suffix = randomUUID();
  const audioPath = path.join(input.directory, `trim_${suffix}.wav`);
  temporary.push(audioPath);
  try {
    await run(
      getFfmpegPath(),
      [
        '-v',
        'error',
        '-y',
        '-ss',
        String(range.start),
        '-i',
        input.audioPath,
        '-t',
        String(seconds),
        '-vn',
        '-c:a',
        'pcm_s16le',
        audioPath,
      ],
      { windowsHide: true, signal: input.signal }
    );
    let imagePath = input.imagePath;
    if (input.mediaType === 'video') {
      imagePath = path.join(input.directory, `trim_${suffix}.mp4`);
      temporary.push(imagePath);
      await run(
        getFfmpegPath(),
        [
          '-v',
          'error',
          '-y',
          '-stream_loop',
          '-1',
          '-ss',
          String(range.start),
          '-i',
          input.imagePath,
          '-t',
          String(seconds),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-c:a',
          'aac',
          imagePath,
        ],
        { windowsHide: true, signal: input.signal }
      );
    }
    return {
      ...input,
      ...trimCaptionTiming(input.words, input.groups, range),
      audioPath,
      imagePath,
      offset: range.start,
      sfxCues: input.sfxCues
        ?.filter((cue) => cue.time >= range.start && cue.time < range.end)
        .map((cue) => ({ ...cue, time: cue.time - range.start })),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
