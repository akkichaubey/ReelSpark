import { CaptionGroup, TranscriptWord } from './types';
import { detectImportantWords } from './important-words';

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
    const prevEndsSentence = prevWord && /[.!?।,;:]/.test(prevWord.text.trim().slice(-1));

    // Avoid leaving a 1-word orphan at the end of a 5-word clause (prefer 3+2 over 4+1)
    const nextWord = words[i + 1];
    const currentEndsSentence = /[.!?।,;:]/.test(word.text.trim().slice(-1));
    const pauseAfterCurrent = nextWord ? Math.max(0, nextWord.start - word.end) : 1;
    const wouldLeaveSingleWordOrphan =
      maxWordsPerGroup >= 4 &&
      currentGroupWords.length === maxWordsPerGroup - 1 &&
      !prevEndsSentence &&
      pauseDuration < 0.06 &&
      !currentEndsSentence &&
      pauseAfterCurrent < 0.06 &&
      Boolean(
        nextWord &&
          (/[.!?।,;:]/.test(nextWord.text.trim().slice(-1)) ||
            !words[i + 2] ||
            Math.max(0, words[i + 2].start - nextWord.end) >= 0.06)
      );

    const shouldBreak =
      currentGroupWords.length >= maxWordsPerGroup ||
      wouldLeaveSingleWordOrphan ||
      (currentGroupWords.length >= 1 && prevEndsSentence) ||
      (currentGroupWords.length >= 1 && pauseDuration >= 0.06);

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
  const start = words.length > 0 ? Math.min(...words.map((w) => w.start)) : 0;
  const end = words.length > 0 ? Math.max(...words.map((w) => w.end)) : start + 1;
  const text = words.map((w) => w.text).join(' ');
  return {
    id,
    words,
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
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

/**
 * Delete an entire caption group by its id.
 */
export function deleteCaptionGroup(
  groups: CaptionGroup[],
  groupId: string
): CaptionGroup[] {
  return groups.filter((g) => g.id !== groupId);
}

/**
 * Edit an entire caption group's phrase text and/or timing.
 * Tokenizes the new phrase text and spreads words evenly across the group's time interval.
 */
export function updateCaptionGroupPhrase(
  groups: CaptionGroup[],
  groupId: string,
  newPhraseText: string,
  customStart?: number,
  customEnd?: number
): CaptionGroup[] {
  return groups.map((g) => {
    if (g.id !== groupId) return g;

    const start = customStart !== undefined ? customStart : g.start;
    const end = customEnd !== undefined ? customEnd : g.end;
    const duration = Math.max(0.2, end - start);

    const tokens = newPhraseText
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) {
      return g;
    }

    const timePerWord = duration / tokens.length;
    const newWords: TranscriptWord[] = tokens.map((token, idx) => {
      const isLast = idx === tokens.length - 1;
      const wStart = Number((start + idx * timePerWord).toFixed(2));
      const wEnd = isLast ? end : Number(Math.min(end, start + (idx + 0.9) * timePerWord).toFixed(2));
      const existingWord = g.words[idx];
      return {
        id: existingWord ? existingWord.id : `w_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        text: token,
        start: wStart,
        end: Math.max(wStart + 0.05, wEnd),
        isImportant: existingWord ? existingWord.isImportant : undefined,
      };
    });

    return buildCaptionGroup(detectImportantWords(newWords), g.id);
  });
}

/**
 * Add a brand-new caption group.
 */
export function addCaptionGroup(
  groups: CaptionGroup[],
  afterGroupId: string | null,
  text: string,
  start: number,
  end: number
): CaptionGroup[] {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const duration = Math.max(0.4, end - start);
  const timePerWord = duration / Math.max(1, tokens.length);

  const newWords: TranscriptWord[] = tokens.map((token, idx) => {
    const isLast = idx === tokens.length - 1;
    const wStart = Number((start + idx * timePerWord).toFixed(2));
    const wEnd = isLast ? end : Number(Math.min(end, start + (idx + 0.9) * timePerWord).toFixed(2));
    return {
      id: `w_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      text: token,
      start: wStart,
      end: Math.max(wStart + 0.05, wEnd),
    };
  });

  const newGroup = buildCaptionGroup(
    detectImportantWords(newWords),
    `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  );

  if (!afterGroupId) {
    const next = [...groups, newGroup];
    next.sort((a, b) => a.start - b.start);
    return next;
  }

  const idx = groups.findIndex((g) => g.id === afterGroupId);
  const next = [...groups];
  if (idx !== -1) {
    next.splice(idx + 1, 0, newGroup);
  } else {
    next.push(newGroup);
  }
  return next;
}
