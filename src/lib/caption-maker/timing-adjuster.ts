import { CaptionGroup, TranscriptWord } from './types';

/**
 * Nudge a word's start and/or end time by delta seconds.
 * Clamps duration to a minimum of 0.05 seconds and prevents start from going negative.
 */
export function nudgeWordTiming(
  groups: CaptionGroup[],
  wordId: string,
  deltaStart: number,
  deltaEnd: number
): CaptionGroup[] {
  return groups.map((group) => {
    const wordIndex = group.words.findIndex((w) => w.id === wordId);
    if (wordIndex === -1) return group;

    const target = group.words[wordIndex];
    let newStart = Number((target.start + deltaStart).toFixed(2));
    let newEnd = Number((target.end + deltaEnd).toFixed(2));

    if (newStart < 0) newStart = 0;
    if (newEnd <= newStart + 0.05) {
      newEnd = Number((newStart + 0.05).toFixed(2));
    }

    const updatedWords = group.words.map((w, idx) =>
      idx === wordIndex ? { ...w, start: newStart, end: newEnd } : w
    );

    return {
      ...group,
      words: updatedWords,
      start: updatedWords[0]?.start ?? group.start,
      end: updatedWords[updatedWords.length - 1]?.end ?? group.end,
      text: updatedWords.map((w) => w.text).join(' '),
    };
  });
}

/**
 * Shift an entire word (both start and end) by delta seconds, preserving its duration.
 */
export function shiftWordTiming(
  groups: CaptionGroup[],
  wordId: string,
  deltaSeconds: number
): CaptionGroup[] {
  return groups.map((group) => {
    const wordIndex = group.words.findIndex((w) => w.id === wordId);
    if (wordIndex === -1) return group;

    const target = group.words[wordIndex];
    const duration = target.end - target.start;

    let newStart = Number((target.start + deltaSeconds).toFixed(2));
    if (newStart < 0) newStart = 0;
    const newEnd = Number((newStart + duration).toFixed(2));

    const updatedWords = group.words.map((w, idx) =>
      idx === wordIndex ? { ...w, start: newStart, end: newEnd } : w
    );

    return {
      ...group,
      words: updatedWords,
      start: updatedWords[0]?.start ?? group.start,
      end: updatedWords[updatedWords.length - 1]?.end ?? group.end,
      text: updatedWords.map((w) => w.text).join(' '),
    };
  });
}

/**
 * Snap a word's start time to a specific target time (e.g. current playhead position).
 * Preserves the word's original duration.
 */
export function snapWordToTime(
  groups: CaptionGroup[],
  wordId: string,
  targetTime: number
): CaptionGroup[] {
  return groups.map((group) => {
    const wordIndex = group.words.findIndex((w) => w.id === wordId);
    if (wordIndex === -1) return group;

    const target = group.words[wordIndex];
    const duration = Math.max(0.1, target.end - target.start);

    const safeTarget = Math.max(0, Number(targetTime.toFixed(2)));
    const newEnd = Number((safeTarget + duration).toFixed(2));

    const updatedWords = group.words.map((w, idx) =>
      idx === wordIndex ? { ...w, start: safeTarget, end: newEnd } : w
    );

    return {
      ...group,
      words: updatedWords,
      start: updatedWords[0]?.start ?? group.start,
      end: updatedWords[updatedWords.length - 1]?.end ?? group.end,
      text: updatedWords.map((w) => w.text).join(' '),
    };
  });
}

/**
 * Auto-distribute words evenly across a caption group's total duration.
 * Useful when transcription returns bunched-up words or after phrase boundary edits.
 */
export function autoDistributeGroupWords(
  groups: CaptionGroup[],
  groupId: string
): CaptionGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId || group.words.length <= 1) return group;

    const totalDuration = Math.max(0.2, group.end - group.start);
    const wordCount = group.words.length;
    const wordDuration = totalDuration / wordCount;

    const updatedWords: TranscriptWord[] = group.words.map((w, idx) => {
      const start = Number((group.start + idx * wordDuration).toFixed(2));
      const end = Number((group.start + (idx + 1) * wordDuration).toFixed(2));
      return {
        ...w,
        start,
        end,
      };
    });

    return {
      ...group,
      words: updatedWords,
      start: updatedWords[0].start,
      end: updatedWords[updatedWords.length - 1].end,
      text: updatedWords.map((w) => w.text).join(' '),
    };
  });
}

/**
 * Expand a word's end boundary to close micro-gaps (< 0.15s) with the next word.
 * Prevents subtitle flickering and dead zones during continuous speech.
 */
export function autoExpandWordToGap(
  groups: CaptionGroup[],
  wordId: string
): CaptionGroup[] {
  return groups.map((group) => {
    const wordIndex = group.words.findIndex((w) => w.id === wordId);
    if (wordIndex === -1) return group;

    const nextWord = group.words[wordIndex + 1];
    if (!nextWord) return group;

    const gap = nextWord.start - group.words[wordIndex].end;
    if (gap > 0 && gap <= 0.25) {
      const updatedWords = group.words.map((w, idx) =>
        idx === wordIndex ? { ...w, end: nextWord.start } : w
      );
      return {
        ...group,
        words: updatedWords,
        start: updatedWords[0]?.start ?? group.start,
        end: updatedWords[updatedWords.length - 1]?.end ?? group.end,
        text: updatedWords.map((w) => w.text).join(' '),
      };
    }

    return group;
  });
}
