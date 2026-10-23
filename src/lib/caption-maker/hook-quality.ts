/**
 * Small, deterministic cover-hook helpers. Keeping this local makes the editor
 * useful offline and avoids presenting a heuristic as an AI-generated claim.
 */

const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu;

const COMMON_CONNECTORS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'your', 'you', 'are', 'from',
  'into', 'about', 'how', 'why', 'what', 'when', 'where', 'then', 'than',
]);

export interface HookQuality {
  score: number;
  label: 'Strong' | 'Good' | 'Needs focus';
  tips: string[];
  focusWords: string[];
}

export function normalizeHookWord(value: string): string {
  return value
    .normalize('NFKC')
    // Keep combining marks (\p{M}) with their letters so Indic scripts such
    // as Devanagari remain intact when a user highlights a word.
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '')
    .toLocaleLowerCase();
}

export function getHookWords(value: string): string[] {
  return value.match(WORD_PATTERN) || [];
}

/**
 * Gives transparent, editorial guidance. It is intentionally a readability
 * check, not a promise that a title will perform well on a social platform.
 */
export function assessHookQuality(title: string): HookQuality {
  const words = getHookWords(title);
  const tips: string[] = [];
  let score = 100;

  if (words.length < 3) {
    score -= 32;
    tips.push('Use at least 3 words so the promise is clear.');
  } else if (words.length > 8) {
    score -= Math.min(30, (words.length - 8) * 5);
    tips.push('Shorten this to 3–8 words for faster scanning.');
  }

  if (title.trim().length < 14) {
    score -= 14;
    tips.push('Add one specific outcome, problem, or payoff.');
  } else if (title.trim().length > 52) {
    score -= 18;
    tips.push('Keep the visible hook under roughly 52 characters.');
  }

  const focusWords = [...new Map(
    words
      .map((word, index) => ({ word, index, key: normalizeHookWord(word) }))
      .filter(({ key }) => key.length >= 3 && !COMMON_CONNECTORS.has(key))
      .sort((a, b) => b.key.length - a.key.length || a.index - b.index)
      .map(({ word, key }) => [key, word])
  ).values()].slice(0, 3);

  if (focusWords.length === 0 && words.length > 0) {
    tips.push('Choose one meaningful word to give the cover visual hierarchy.');
  } else if (focusWords.length > 0) {
    tips.push(`Emphasize ${focusWords.join(', ')} instead of every word.`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    label: finalScore >= 85 ? 'Strong' : finalScore >= 65 ? 'Good' : 'Needs focus',
    tips,
    focusWords,
  };
}
