import { CaptionGroup, TranscriptWord } from './types';

export interface CaptionTimingSegment {
  start: number;
  end: number;
  activeWord?: TranscriptWord;
}

/**
 * Caption word intervals are half-open: a word is active at start, but no
 * longer active at end. This prevents adjacent words from both highlighting
 * on the same frame and keeps pauses unhighlighted.
 */
export function isTranscriptWordActiveAtTime(
  word: TranscriptWord,
  time: number
): boolean {
  return (
    Number.isFinite(time) &&
    Number.isFinite(word.start) &&
    Number.isFinite(word.end) &&
    word.end > word.start &&
    time >= word.start &&
    time < word.end
  );
}

/**
 * Return the active word for a timestamp. If malformed legacy data overlaps,
 * the most recently started word wins, matching normal speech progression.
 */
export function getActiveTranscriptWordAtTime(
  words: TranscriptWord[],
  time: number
): TranscriptWord | undefined {
  if (!Number.isFinite(time)) return undefined;
  const latestStartedWord = words.reduce<TranscriptWord | undefined>((latest, word) => {
    if (!Number.isFinite(word.start) || word.start > time) return latest;
    return !latest || word.start >= latest.start ? word : latest;
  }, undefined);
  return latestStartedWord && isTranscriptWordActiveAtTime(latestStartedWord, time)
    ? latestStartedWord
    : undefined;
}

/**
 * Split a caption group's visible interval into deterministic active-word and
 * pause intervals. Renderers can keep the complete phrase on screen while
 * removing the active-word treatment during real speech gaps.
 */
export function getCaptionTimingSegments(group: CaptionGroup): CaptionTimingSegment[] {
  const validWords = group.words.filter(
    (word) =>
      Number.isFinite(word.start) &&
      Number.isFinite(word.end) &&
      word.end > word.start
  );
  const fallbackStart = validWords.length
    ? Math.min(...validWords.map((word) => word.start))
    : 0;
  const fallbackEnd = validWords.length
    ? Math.max(...validWords.map((word) => word.end))
    : fallbackStart;
  const groupStart = Number.isFinite(group.start)
    ? Math.max(0, group.start)
    : Math.max(0, fallbackStart);
  const groupEnd = Number.isFinite(group.end)
    ? Math.max(groupStart, group.end)
    : Math.max(groupStart, fallbackEnd);

  if (groupEnd <= groupStart) return [];

  const boundaries = [groupStart, groupEnd];
  for (const word of validWords) {
    const start = Math.max(groupStart, Math.min(groupEnd, word.start));
    const end = Math.max(groupStart, Math.min(groupEnd, word.end));
    if (end > start) boundaries.push(start, end);
  }

  boundaries.sort((a, b) => a - b);
  const uniqueBoundaries = boundaries.filter(
    (time, index) => index === 0 || time - boundaries[index - 1] > 1e-9
  );
  const segments: CaptionTimingSegment[] = [];

  for (let index = 0; index < uniqueBoundaries.length - 1; index += 1) {
    const start = uniqueBoundaries[index];
    const end = uniqueBoundaries[index + 1];
    if (end <= start) continue;

    const activeWord = getActiveTranscriptWordAtTime(validWords, start + (end - start) / 2);
    const previous = segments[segments.length - 1];
    if (previous && previous.activeWord?.id === activeWord?.id && previous.end === start) {
      previous.end = end;
    } else {
      segments.push({ start, end, activeWord });
    }
  }

  return segments;
}

/** Clamp a word's entry/exit animation durations to its actual speech window. */
export function getWordAnimationWindow(
  start: number,
  end: number,
  requestedEntry: number,
  requestedExit: number
) {
  const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
  const duration = Number.isFinite(end) ? Math.max(0, end - safeStart) : 0;
  const entryDuration = Math.min(Math.max(0, requestedEntry), duration * 0.65);
  const exitDuration = Math.min(
    Math.max(0, requestedExit),
    Math.max(0, duration - entryDuration)
  );

  return {
    start: safeStart,
    end: safeStart + duration,
    duration,
    entryDuration,
    exitDuration,
    exitStart: Math.max(safeStart + entryDuration, safeStart + duration - exitDuration),
  };
}

/**
 * Normalized highlight state for the active-word styling used by the editor
 * preview and the Remotion timeline. The value is always zero outside the
 * half-open spoken interval, including pauses and the exact word end.
 */
export function getWordHighlightProgress(
  start: number,
  end: number,
  time: number,
  requestedEntry = 0.06,
  requestedExit = 0.07,
  entryEase: 'power2' | 'linear' = 'power2'
): number {
  if (!Number.isFinite(time)) return 0;
  const window = getWordAnimationWindow(start, end, requestedEntry, requestedExit);
  if (window.duration <= 0 || time < window.start || time >= window.end) return 0;

  const entryEnd = window.start + window.entryDuration;
  if (time < entryEnd && window.entryDuration > 0) {
    const progress = getUnitProgress(time - window.start, window.entryDuration);
    return entryEase === 'power2' ? easeOutPower2(progress) : progress;
  }

  if (time >= window.exitStart && window.exitDuration > 0) {
    return 1 - easeInOutPower1((time - window.exitStart) / window.exitDuration);
  }

  return 1;
}

/**
 * Calculate a stagger that completes inside its available time window. The
 * returned duration and stagger can be shared by preview and Remotion.
 */
export function getStaggeredAnimationTiming(
  itemCount: number,
  availableDuration: number,
  requestedDuration: number,
  requestedStagger: number
) {
  const count = Number.isFinite(itemCount) ? Math.max(1, Math.floor(itemCount)) : 1;
  const available = Math.max(0, Number.isFinite(availableDuration) ? availableDuration : 0);
  const duration = Math.min(Math.max(0, requestedDuration), available);
  const stagger = count > 1
    ? Math.min(Math.max(0, requestedStagger), Math.max(0, (available - duration) / (count - 1)))
    : 0;

  return {
    duration,
    stagger,
    totalDuration: duration + stagger * (count - 1),
  };
}

export function getUnitProgress(elapsed: number, duration: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, elapsed / duration));
}

/** GSAP-compatible ease approximations used for time-driven browser preview. */
export function easeOutPower2(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function easeOutBack(progress: number, overshoot = 2): number {
  const t = Math.max(0, Math.min(1, progress)) - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

export function easeInOutPower1(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

export function easeInPower1(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t * t;
}

/** Interpolate common CSS hex/rgb colors without relying on frame transitions. */
export function interpolateCssColor(from: string, to: string, progress: number): string {
  const ratio = Math.max(0, Math.min(1, progress));
  const parse = (value: string): [number, number, number, number] | undefined => {
    if (value.trim().toLowerCase() === 'transparent') return [0, 0, 0, 0];
    const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (hex) {
      const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
      return [0, 2, 4].map((index) => parseInt(expanded.slice(index, index + 2), 16)).concat(1) as [number, number, number, number];
    }
    const rgb = value.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (!rgb) return undefined;
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  };

  const start = parse(from);
  const end = parse(to);
  if (!start || !end) {
    return `color-mix(in srgb, ${from} ${(1 - ratio) * 100}%, ${to} ${ratio * 100}%)`;
  }
  const [r, g, b] = [0, 1, 2].map((index) => Math.round(start[index] + (end[index] - start[index]) * ratio));
  const alpha = Math.max(0, Math.min(1, start[3] + (end[3] - start[3]) * ratio));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function getEmojiBounceOffset(time: number, wordStart: number): number {
  const elapsed = Math.max(0, time - wordStart);
  return Math.round(Math.abs(Math.sin(elapsed * Math.PI * 5)) * 8);
}
