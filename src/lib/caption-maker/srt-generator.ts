import { CaptionGroup, TranscriptWord } from './types';

function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Generate a word-level SRT subtitle file.
 */
export function generateWordLevelSrt(words: TranscriptWord[]): string {
  if (!words || words.length === 0) return '';

  const entries: string[] = [];
  let index = 1;

  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;

    const start = formatSrtTime(word.start);
    const end = formatSrtTime(Math.max(word.start + 0.1, word.end));

    entries.push(`${index}\n${start} --> ${end}\n${text}\n`);
    index++;
  }

  return entries.join('\n');
}

/**
 * Generate a phrase/group-level SRT subtitle file.
 */
export function generatePhraseLevelSrt(groups: CaptionGroup[]): string {
  if (!groups || groups.length === 0) return '';

  const entries: string[] = [];
  let index = 1;

  for (const group of groups) {
    const text = group.text.trim();
    if (!text) continue;

    const start = formatSrtTime(group.start);
    const end = formatSrtTime(Math.max(group.start + 0.3, group.end));

    entries.push(`${index}\n${start} --> ${end}\n${text}\n`);
    index++;
  }

  return entries.join('\n');
}

// Aliases for uppercase convention
export const generateWordLevelSRT = generateWordLevelSrt;
export const generatePhraseSRT = generatePhraseLevelSrt;

