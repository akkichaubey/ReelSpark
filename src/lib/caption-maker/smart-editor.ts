import { CaptionGroup, FillerSegment, TranscriptWord } from './types';

export interface SilenceDetectionOptions {
  minPauseDuration?: number; // in seconds (default 0.6s)
  detectFillers?: boolean;   // default true
  fillerWords?: string[];    // list of filler tokens
}

export const DEFAULT_FILLER_WORDS = [
  'umm',
  'um',
  'uhh',
  'uh',
  'err',
  'er',
  'ah',
  'ahh',
  'matlab',
  'yaani',
  'like',
  'basically',
  'actually',
];

/**
 * Detect silences, dead air, and verbal filler words from transcript words and total duration.
 */
export function detectSilencesAndFillers(
  words: TranscriptWord[],
  totalDuration: number,
  options: SilenceDetectionOptions = {}
): FillerSegment[] {
  const {
    minPauseDuration = 0.6,
    detectFillers = true,
    fillerWords = DEFAULT_FILLER_WORDS,
  } = options;

  const segments: FillerSegment[] = [];
  const duration = Math.max(0, totalDuration);

  if (!words || words.length === 0) {
    if (duration >= minPauseDuration) {
      segments.push({
        start: 0,
        end: Number(duration.toFixed(2)),
        text: 'Extended Silence',
        type: 'silence',
      });
    }
    return segments;
  }

  // Sort words by start time
  const sortedWords = [...words].sort((a, b) => a.start - b.start);

  // 1. Initial Dead Air (before first word)
  const firstWord = sortedWords[0];
  if (firstWord.start >= minPauseDuration) {
    segments.push({
      start: 0,
      end: Number(firstWord.start.toFixed(2)),
      text: 'Opening Pause',
      type: 'silence',
    });
  }

  // 2. Inter-word silences and verbal fillers
  for (let i = 0; i < sortedWords.length; i++) {
    const current = sortedWords[i];

    // Check if current word is a verbal filler sound
    if (detectFillers) {
      const cleanWord = current.text.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (fillerWords.includes(cleanWord)) {
        segments.push({
          start: Number(current.start.toFixed(2)),
          end: Number(current.end.toFixed(2)),
          text: current.text,
          type: 'filler',
        });
      }
    }

    // Check gap between current word end and next word start
    if (i < sortedWords.length - 1) {
      const next = sortedWords[i + 1];
      const gap = next.start - current.end;
      if (gap >= minPauseDuration) {
        segments.push({
          start: Number(current.end.toFixed(2)),
          end: Number(next.start.toFixed(2)),
          text: `Pause (${gap.toFixed(1)}s)`,
          type: 'silence',
        });
      }
    }
  }

  // 3. Trailing Dead Air (after last word)
  const lastWord = sortedWords[sortedWords.length - 1];
  if (duration - lastWord.end >= minPauseDuration) {
    segments.push({
      start: Number(lastWord.end.toFixed(2)),
      end: Number(duration.toFixed(2)),
      text: 'Ending Silence',
      type: 'silence',
    });
  }

  // 4. Merge overlapping or near-contiguous segments (< 60ms apart)
  const merged: FillerSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && seg.start <= prev.end + 0.06) {
      prev.end = Math.max(prev.end, seg.end);
      prev.text = `${prev.text} + ${seg.text}`;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

/**
 * Calculate total trimmed duration in seconds from filler segments.
 */
export function calculateSavedDuration(segments: FillerSegment[]): number {
  if (!segments || segments.length === 0) return 0;
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
  return Number(total.toFixed(2));
}

export interface ClipHighlightAnalysis {
  hookScore: number;         // 0 to 100
  pacingScore: number;       // 0 to 100
  retentionScore: number;    // 0 to 100
  overallViralScore: number; // 0 to 100
  hookInterval: { start: number; end: number; text: string };
  goldenPeak: { start: number; end: number; text: string; intensity: string };
  punchlineWords: string[];
  feedback: string[];
  wordCount: number;
  wpm: number;
}

const VIRAL_TRIGGER_KEYWORDS = [
  'kabhi',
  'haar',
  'dream',
  'pehchan',
  'lakshya',
  'focus',
  'secret',
  'truth',
  'rule',
  'mistake',
  'stop',
  'never',
  'always',
  'success',
  'money',
  'crore',
  'lakh',
  'powerful',
  'hack',
  'mindset',
  'life',
  'zindagi',
];

/**
 * Perform AI Highlight & Viral Hook analysis on selected clip transcript.
 */
export function analyzeClipHighlights(
  words: TranscriptWord[],
  totalDuration: number,
  captionGroups: CaptionGroup[] = []
): ClipHighlightAnalysis {
  const duration = Math.max(1, totalDuration);
  const wordCount = words ? words.length : 0;
  const wpm = Math.round((wordCount / (duration / 60)));

  // 1. Hook Score Analysis (First 4 seconds of speech)
  const hookWords = (words || []).filter((w) => w.start <= 4.0);
  const hookText = hookWords.map((w) => w.text).join(' ');
  let hookScore = 60;

  if (hookWords.length >= 4) hookScore += 15;
  if (hookWords.length >= 8) hookScore += 10;
  const hasTriggerInHook = hookWords.some((w) =>
    VIRAL_TRIGGER_KEYWORDS.includes(w.text.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  if (hasTriggerInHook) hookScore += 15;
  hookScore = Math.min(100, Math.max(30, hookScore));

  const hookInterval = {
    start: hookWords[0]?.start ?? 0,
    end: hookWords[hookWords.length - 1]?.end ?? Math.min(4.0, duration),
    text: hookText || 'Opening speech hook',
  };

  // 2. Pacing Score Analysis (Optimal 130 - 170 WPM)
  let pacingScore = 75;
  if (wpm >= 130 && wpm <= 170) {
    pacingScore = 95;
  } else if (wpm >= 115 && wpm <= 185) {
    pacingScore = 85;
  } else if (wpm < 100) {
    pacingScore = 60;
  } else if (wpm > 200) {
    pacingScore = 65;
  }

  // 3. Golden Peak / Punchline Detection
  let punchlineWords: string[] = [];
  let peakGroup: CaptionGroup | null = null;

  for (const grp of captionGroups) {
    const groupPunchCount = grp.words.filter(
      (w) =>
        w.isImportant ||
        w.intensity === 'punch' ||
        w.intensity === 'climax' ||
        VIRAL_TRIGGER_KEYWORDS.includes(w.text.toLowerCase().replace(/[^a-z0-9]/g, ''))
    ).length;

    if (!peakGroup || groupPunchCount > (peakGroup.words.filter((w) => w.isImportant).length)) {
      peakGroup = grp;
    }
  }

  if (words) {
    punchlineWords = words
      .filter((w) => {
        const clean = w.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          w.isImportant ||
          w.intensity === 'punch' ||
          w.intensity === 'climax' ||
          VIRAL_TRIGGER_KEYWORDS.includes(clean)
        );
      })
      .map((w) => w.text);
  }

  const goldenPeak = {
    start: peakGroup?.start ?? 0,
    end: peakGroup?.end ?? Math.min(3.0, duration),
    text: peakGroup?.text ?? (punchlineWords.slice(0, 4).join(' ') || 'Key message peak'),
    intensity: 'punch',
  };

  // 4. Retention Score (Punch word density + clean pacing)
  const punchDensity = wordCount > 0 ? punchlineWords.length / wordCount : 0;
  let retentionScore = Math.round(50 + punchDensity * 120);
  retentionScore = Math.min(98, Math.max(45, retentionScore));

  // 5. Overall Viral Score
  const overallViralScore = Math.round(
    hookScore * 0.4 + pacingScore * 0.3 + retentionScore * 0.3
  );

  // 6. Actionable Feedback
  const feedback: string[] = [];
  if (hookScore >= 85) {
    feedback.push('⚡ Strong Hook: Fast opening with emotional keyword delivery.');
  } else {
    feedback.push('💡 Hook Tip: Make the first 3 seconds punchier with a question or bold claim.');
  }

  if (pacingScore >= 85) {
    feedback.push(`🔥 Ideal Reel Tempo: ${wpm} WPM keeps viewers engaged without dragging.`);
  } else if (wpm < 120) {
    feedback.push(`⏳ Slow Pacing: ${wpm} WPM. Trim pause gaps with AI Jump-Cutter to tighten rhythm.`);
  } else {
    feedback.push(`⚡ Fast Speech: ${wpm} WPM. Ensure punchy captions help viewers follow easily.`);
  }

  if (punchlineWords.length >= 4) {
    feedback.push(`★ Key Punchlines: Found ${punchlineWords.length} high-impact words for vibrant highlight.`);
  }

  return {
    hookScore,
    pacingScore,
    retentionScore,
    overallViralScore,
    hookInterval,
    goldenPeak,
    punchlineWords,
    feedback,
    wordCount,
    wpm,
  };
}

/**
 * Automatically set `isImportant: true` on impactful viral keywords in transcript words.
 */
export function autoMarkViralHighlights(
  words: TranscriptWord[],
  targetPunchWords?: string[]
): TranscriptWord[] {
  if (!words || words.length === 0) return [];

  const targets = (targetPunchWords && targetPunchWords.length > 0
    ? targetPunchWords
    : VIRAL_TRIGGER_KEYWORDS
  ).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));

  return words.map((w) => {
    const clean = w.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isMatched = targets.includes(clean);
    return {
      ...w,
      isImportant: isMatched ? true : (w.isImportant ?? false),
    };
  });
}
