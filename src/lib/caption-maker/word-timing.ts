import type { SyncedPhraseSegment, SyncedWordTiming } from './types';

export interface ParsedWordTimings {
  words: SyncedWordTiming[];
  language: 'hi' | 'en';
}

function parseOffset(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:s)?$/i);
  return match ? Number(match[1]) : undefined;
}

function inferTimingLanguage(words: SyncedWordTiming[]): 'hi' | 'en' {
  const devanagariCount = words.filter((word) => /[\u0900-\u097f]/u.test(word.text)).length;
  return devanagariCount / Math.max(1, words.length) >= 0.5 ? 'hi' : 'en';
}

/** Read official Gemini AudioTranscription word annotations without inventing timestamps. */
export function parseGeminiWordTimingResponse(
  response: unknown,
  durationSeconds: number
): ParsedWordTimings | undefined {
  const root = response as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
  } | null;
  const parts = root?.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const rawWords = parts.flatMap((part) => {
    const annotation = (part.audioTranscription || part.audio_transcription) as
      | { words?: unknown[] }
      | undefined;
    return Array.isArray(annotation?.words) ? annotation.words : [];
  });
  if (!rawWords.length) return undefined;

  const words: SyncedWordTiming[] = [];
  for (const raw of rawWords) {
    const item = raw as Record<string, unknown>;
    const text = String(item.word || item.text || '').trim();
    const start = parseOffset(item.startOffset ?? item.start_offset ?? item.start);
    const end = parseOffset(item.endOffset ?? item.end_offset ?? item.end);
    if (!text || start === undefined || end === undefined || end <= start || start < 0) continue;
    if (Number.isFinite(durationSeconds) && durationSeconds > 0 && start >= durationSeconds) continue;
    const clippedEnd = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.min(end, durationSeconds)
      : end;
    if (clippedEnd <= start) continue;
    words.push({ text, start, end: clippedEnd });
  }

  if (!words.length) return undefined;
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  return { words, language: inferTimingLanguage(words) };
}

/** Attach each recognized word to the nearest AI clause while retaining the model's original times. */
export function attachWordTimingsToSegments(
  segments: SyncedPhraseSegment[],
  timings: ParsedWordTimings
): SyncedPhraseSegment[] {
  const attached = segments.map((segment) => ({ ...segment, wordTimings: [] as SyncedWordTiming[] }));
  if (!attached.length) return attached;

  for (const word of timings.words) {
    const midpoint = (word.start + word.end) / 2;
    let bestIndex = 0;
    let bestOverlap = -1;
    for (let index = 0; index < attached.length; index += 1) {
      const segment = attached[index];
      const overlap = Math.max(0, Math.min(word.end, segment.end) - Math.max(word.start, segment.start));
      const containsMidpoint = midpoint >= segment.start && midpoint <= segment.end;
      const score = overlap + (containsMidpoint ? 1 : 0);
      if (score > bestOverlap) {
        bestOverlap = score;
        bestIndex = index;
      }
    }
    attached[bestIndex].wordTimings!.push(word);
  }

  return attached.map((segment) => ({
    ...segment,
    wordTimings: segment.wordTimings?.sort((a, b) => a.start - b.start),
    wordTimingLanguage: segment.wordTimings?.length ? inferTimingLanguage(segment.wordTimings) : undefined,
  }));
}

function normalizeToken(token: string): string {
  return token
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '');
}

/**
 * Match exact recognizer timings to the displayed phrase. Translation words are
 * deliberately rejected because their timing cannot be claimed as word-aligned.
 */
export function matchExactWordTimings(
  tokens: string[],
  timings: SyncedWordTiming[] | undefined,
  displayedLanguage: 'hi' | 'en' | 'hinglish',
  timingLanguage: 'hi' | 'en' | undefined
): SyncedWordTiming[] | undefined {
  if (!timings?.length || !timingLanguage || tokens.length !== timings.length) return undefined;
  if (displayedLanguage === 'hinglish' && timingLanguage === 'hi') return timings;
  if (displayedLanguage !== timingLanguage) return undefined;
  if (!tokens.every((token, index) => normalizeToken(token) === normalizeToken(timings[index].text))) {
    return undefined;
  }
  return timings;
}
