import { CaptionGroup, TranscriptWord } from './types';

/**
 * Format seconds into SRT timestamp: HH:MM:SS,mmm (comma separator)
 */
export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Format seconds into WebVTT timestamp: HH:MM:SS.mmm (dot separator)
 */
export function formatVttTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Format seconds into clean readable timestamp: MM:SS
 */
export function formatReadableTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(m)}:${pad(s)}`;
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

/**
 * Generate a phrase/group-level WebVTT (.vtt) file.
 */
export function generatePhraseLevelVtt(groups: CaptionGroup[], title?: string): string {
  if (!groups || groups.length === 0) return 'WEBVTT\n\n';

  const lines: string[] = ['WEBVTT'];
  if (title) {
    lines.push(`NOTE Title: ${title}`);
  }
  lines.push('');

  let index = 1;
  for (const group of groups) {
    const text = group.text.trim();
    if (!text) continue;

    const start = formatVttTime(group.start);
    const end = formatVttTime(Math.max(group.start + 0.3, group.end));

    lines.push(`${index}`);
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push('');
    index++;
  }

  return lines.join('\n');
}

/**
 * Generate a word-level WebVTT (.vtt) file.
 */
export function generateWordLevelVtt(words: TranscriptWord[], title?: string): string {
  if (!words || words.length === 0) return 'WEBVTT\n\n';

  const lines: string[] = ['WEBVTT'];
  if (title) {
    lines.push(`NOTE Title: ${title}`);
  }
  lines.push('');

  let index = 1;
  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;

    const start = formatVttTime(word.start);
    const end = formatVttTime(Math.max(word.start + 0.1, word.end));

    lines.push(`${index}`);
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push('');
    index++;
  }

  return lines.join('\n');
}

/**
 * Generate a plain text (.txt) transcript.
 */
export function generatePlainTextTranscript(
  groups: CaptionGroup[],
  options: {
    includeTimestamps?: boolean;
    title?: string;
  } = { includeTimestamps: true }
): string {
  if (!groups || groups.length === 0) return '';

  const lines: string[] = [];

  if (options.title) {
    lines.push(`TRANSCRIPT: ${options.title}`);
    lines.push('='.repeat(40));
    lines.push('');
  }

  for (const group of groups) {
    const text = group.text.trim();
    if (!text) continue;

    if (options.includeTimestamps !== false) {
      const start = formatReadableTime(group.start);
      const end = formatReadableTime(group.end);
      lines.push(`[${start} - ${end}] ${text}`);
    } else {
      lines.push(text);
    }
  }

  return lines.join('\n');
}

/**
 * Generate word-level plain text transcript.
 */
export function generateWordLevelTxt(words: TranscriptWord[]): string {
  if (!words || words.length === 0) return '';
  return words
    .map((w) => `[${formatReadableTime(w.start)}] ${w.text.trim()}`)
    .filter(Boolean)
    .join('\n');
}

export type SubtitleExportFormat = 'srt' | 'vtt' | 'txt';
export type SubtitleGranularity = 'phrase' | 'word';

export interface SubtitleExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

/**
 * Unified multi-format subtitle exporter.
 */
export function generateSubtitleExport(
  format: SubtitleExportFormat,
  granularity: SubtitleGranularity,
  data: { words: TranscriptWord[]; groups: CaptionGroup[] },
  title = 'reel_captions'
): SubtitleExportResult {
  const sanitizedTitle = (title || 'reel_captions')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 40);

  let content = '';
  const extension = format;
  let mimeType = 'text/plain;charset=utf-8';

  if (format === 'srt') {
    content =
      granularity === 'word'
        ? generateWordLevelSrt(data.words)
        : generatePhraseLevelSrt(data.groups);
    mimeType = 'application/x-subrip;charset=utf-8';
  } else if (format === 'vtt') {
    content =
      granularity === 'word'
        ? generateWordLevelVtt(data.words, title)
        : generatePhraseLevelVtt(data.groups, title);
    mimeType = 'text/vtt;charset=utf-8';
  } else if (format === 'txt') {
    content =
      granularity === 'word'
        ? generateWordLevelTxt(data.words)
        : generatePlainTextTranscript(data.groups, { includeTimestamps: true, title });
    mimeType = 'text/plain;charset=utf-8';
  }

  const filename = `${sanitizedTitle}_${granularity}.${extension}`;

  return { content, filename, mimeType };
}

// Aliases for uppercase convention
export const generateWordLevelSRT = generateWordLevelSrt;
export const generatePhraseSRT = generatePhraseLevelSrt;
export const generatePhraseVTT = generatePhraseLevelVtt;
export const generateWordLevelVTT = generateWordLevelVtt;
export const generatePlainText = generatePlainTextTranscript;
