import { TranscriptWord } from './types';

// High-impact emotional, motivational, and emphasis keywords across Hindi, Hinglish, and English
const HIGH_IMPACT_KEYWORDS = new Set([
  // Hindi & Hinglish Motivational / Emotional Keywords
  'zindagi', 'jindagi', 'haar', 'jeet', 'sapna', 'sapne', 'manzil', 'himmat', 'junoon',
  'hausla', 'lakshya', 'kamyabi', 'safal', 'safalta', 'koshish', 'mehnat', 'vishwas',
  'bharosa', 'darr', 'khauf', 'shanti', 'dhyaan', 'prem', 'pyar', 'khushi', 'dard',
  'takleef', 'sach', 'satya', 'jhooth', 'samay', 'waqt', 'karma', 'bhagya', 'kismat',
  'shakti', 'taqat', 'aag', 'junooni', 'asli', 'pehchan', 'samman', 'izzat', 'ahankaar',
  'guroor', 'mukti', 'azadi', 'jazba', 'irada', 'fateh', 'veer', 'yodha', 'shunya',
  'anubhav', 'gyan', 'vidya', 'guru', 'roshni', 'ujala', 'andhera', 'toofan', 'parinaam',

  // English High-Impact & Action Keywords
  'success', 'failure', 'dream', 'dreams', 'fear', 'focus', 'discipline', 'respect',
  'power', 'never', 'always', 'truth', 'life', 'believe', 'fight', 'win', 'winner',
  'lose', 'champion', 'greatness', 'passion', 'purpose', 'courage', 'strength',
  'mindset', 'destiny', 'future', 'freedom', 'light', 'darkness', 'silence', 'peace',
  'action', 'miracle', 'warrior', 'unstoppable', 'hustle', 'energy', 'fire', 'heart',
  'soul', 'moment', 'destiny', 'victory', 'legend', 'impossible', 'possible',
]);

/**
 * Heuristic check to test if a single word has emotional/motivational emphasis.
 */
export function isWordImportantHeuristic(rawText: string): boolean {
  if (!rawText) return false;
  // Clean punctuation from word (e.g. "haar!" -> "haar")
  const clean = rawText.toLowerCase().replace(/[^a-zA-Z\u0900-\u097F]/g, '');
  if (!clean || clean.length <= 2) return false;

  // Check dictionary
  if (HIGH_IMPACT_KEYWORDS.has(clean)) return true;

  // Check if originally capitalized in uppercase (e.g. "HAAR", "DREAM")
  if (rawText.length >= 3 && rawText === rawText.toUpperCase() && /[A-Z]/.test(rawText)) {
    return true;
  }

  return false;
}

/**
 * Analyze an array of TranscriptWords and mark important words.
 * Avoids marking too many words in a row to maintain high visual impact.
 */
export function detectImportantWords(words: TranscriptWord[]): TranscriptWord[] {
  let consecutiveImportantCount = 0;

  return words.map((word) => {
    // If user already manually toggled or assigned, preserve explicit true/false
    if (word.isImportant !== undefined) {
      return word;
    }

    const isMatch = isWordImportantHeuristic(word.text);

    // Limit consecutive highlights so the reel doesn't highlight whole sentences
    if (isMatch && consecutiveImportantCount < 2) {
      consecutiveImportantCount++;
      return { ...word, isImportant: true };
    } else {
      consecutiveImportantCount = 0;
      return { ...word, isImportant: false };
    }
  });
}

/**
 * Toggle importance of a word by id in a word array.
 */
export function toggleWordImportance(
  words: TranscriptWord[],
  wordId: string
): TranscriptWord[] {
  return words.map((w) =>
    w.id === wordId ? { ...w, isImportant: !w.isImportant } : w
  );
}

export const isWordImportantByDefault = isWordImportantHeuristic;

