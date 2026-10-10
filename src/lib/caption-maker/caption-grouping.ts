import { CaptionGroup, TranscriptWord } from './types';

/**
 * Group an array of TranscriptWords into natural, readable caption phrases (approx 2-5 words each).
 * Splits on long pauses (e.g. > 0.45s) or sentence-ending punctuation.
 */
export function groupTranscriptWords(
  words: TranscriptWord[],
  maxWordsPerGroup = 4
): CaptionGroup[] {
  if (!words || words.length === 0) return [];

  const groups: CaptionGroup[] = [];
  let currentGroupWords: TranscriptWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = currentGroupWords[currentGroupWords.length - 1];

    // Check pause between previous word and current word
    const pauseDuration = prevWord ? Math.max(0, word.start - prevWord.end) : 0;
    const prevEndsSentence = prevWord && /[.!?।,]/.test(prevWord.text.trim().slice(-1));

    const shouldBreak =
      currentGroupWords.length >= maxWordsPerGroup ||
      (currentGroupWords.length >= 2 && prevEndsSentence) ||
      (currentGroupWords.length >= 1 && pauseDuration >= 0.45);

    if (shouldBreak && currentGroupWords.length > 0) {
      groups.push(buildCaptionGroup(currentGroupWords, `group_${groups.length + 1}`));
      currentGroupWords = [];
    }

    currentGroupWords.push(word);
  }

  if (currentGroupWords.length > 0) {
    groups.push(buildCaptionGroup(currentGroupWords, `group_${groups.length + 1}`));
  }

  return groups;
}

function buildCaptionGroup(words: TranscriptWord[], id: string): CaptionGroup {
  const start = words[0]?.start ?? 0;
  const end = words[words.length - 1]?.end ?? start + 1;
  const text = words.map((w) => w.text).join(' ');
  return {
    id,
    words,
    start,
    end,
    text,
  };
}

/**
 * Split a caption group into two separate groups at wordIndex.
 */
export function splitCaptionGroup(
  groups: CaptionGroup[],
  groupId: string,
  splitWordIndex: number
): CaptionGroup[] {
  const targetIdx = groups.findIndex((g) => g.id === groupId);
  if (targetIdx === -1) return groups;

  const targetGroup = groups[targetIdx];
  if (splitWordIndex <= 0 || splitWordIndex >= targetGroup.words.length) {
    return groups;
  }

  const firstWords = targetGroup.words.slice(0, splitWordIndex);
  const secondWords = targetGroup.words.slice(splitWordIndex);

  const groupA = buildCaptionGroup(firstWords, `${targetGroup.id}_a`);
  const groupB = buildCaptionGroup(secondWords, `${targetGroup.id}_b`);

  const next = [...groups];
  next.splice(targetIdx, 1, groupA, groupB);
  return next;
}

/**
 * Merge two adjacent caption groups into one.
 */
export function mergeCaptionGroups(
  groups: CaptionGroup[],
  firstGroupId: string,
  secondGroupId: string
): CaptionGroup[] {
  const idxA = groups.findIndex((g) => g.id === firstGroupId);
  const idxB = groups.findIndex((g) => g.id === secondGroupId);

  if (idxA === -1 || idxB === -1 || Math.abs(idxA - idxB) !== 1) {
    return groups;
  }

  const [firstIdx, secondIdx] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
  const mergedWords = [...groups[firstIdx].words, ...groups[secondIdx].words];
  const mergedGroup = buildCaptionGroup(mergedWords, groups[firstIdx].id);

  const next = [...groups];
  next.splice(firstIdx, 2, mergedGroup);
  return next;
}

/**
 * Update a specific word across groups and recompute group timing/text.
 */
export function updateWordInGroups(
  groups: CaptionGroup[],
  wordId: string,
  updates: Partial<TranscriptWord>
): CaptionGroup[] {
  return groups.map((group) => {
    const hasWord = group.words.some((w) => w.id === wordId);
    if (!hasWord) return group;

    const nextWords = group.words.map((w) =>
      w.id === wordId ? { ...w, ...updates } : w
    );
    return buildCaptionGroup(nextWords, group.id);
  });
}

/**
 * Delete a word from groups. Removes empty group if no words remain.
 */
export function deleteWordFromGroups(
  groups: CaptionGroup[],
  wordId: string
): CaptionGroup[] {
  return groups
    .map((group) => {
      const nextWords = group.words.filter((w) => w.id !== wordId);
      return buildCaptionGroup(nextWords, group.id);
    })
    .filter((group) => group.words.length > 0);
}

/**
 * Add a new word into a specific group.
 */
export function addWordToGroup(
  groups: CaptionGroup[],
  groupId: string,
  afterWordId: string | null,
  newWord: TranscriptWord
): CaptionGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;

    const nextWords = [...group.words];
    if (afterWordId === null) {
      nextWords.unshift(newWord);
    } else {
      const idx = nextWords.findIndex((w) => w.id === afterWordId);
      if (idx !== -1) {
        nextWords.splice(idx + 1, 0, newWord);
      } else {
        nextWords.push(newWord);
      }
    }
    return buildCaptionGroup(nextWords, group.id);
  });
}
