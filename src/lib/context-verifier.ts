import { ContextVerification, TranscriptSegment } from './types';

/**
 * Common dangling pronouns and transitional conjunctions that indicate a sentence depends on preceding context.
 */
const DANGLING_STARTERS = [
  'because of this',
  'because of that',
  'and so',
  'therefore he',
  'therefore she',
  'therefore they',
  'which means',
  'so this is why',
  'as i said earlier',
  'like i mentioned',
  'furthermore',
  'on the other hand',
  'he also',
  'she also',
  'they also',
  'that is why',
];

/**
 * Words indicating an incomplete thought or cut-off ending.
 */
const INCOMPLETE_ENDERS = [
  'because',
  'and',
  'or',
  'but',
  'which',
  'that',
  'when',
  'if',
  'so',
  'although',
  'while',
];

/**
 * Verify clip candidate boundaries against surrounding speech transcript.
 * Checks for:
 * 1. Complete opening thought (no dangling pronouns)
 * 2. Satisfying conclusion (no trailing conjunctions)
 * 3. Boundary cutoffs against nearby speech segments
 * 4. Auto-adjustment within 60s limit
 */
export function verifyCandidateContext(
  start: number,
  end: number,
  transcriptText: string,
  surroundingSegments: TranscriptSegment[],
  maxDuration = 60
): ContextVerification {
  const cleanText = transcriptText.trim();
  const lowerText = cleanText.toLowerCase();

  let isCompleteThought = true;
  let hasConclusion = true;
  let hasDanglingPronouns = false;
  let contextConfidence = 95;
  const notesList: string[] = [];
  let flaggedForReview = false;
  let suggestedAdjustment: { start: number; end: number } | undefined = undefined;

  // 1. Check opening
  for (const starter of DANGLING_STARTERS) {
    if (lowerText.startsWith(starter)) {
      hasDanglingPronouns = true;
      isCompleteThought = false;
      contextConfidence -= 25;
      notesList.push(`Starts with dependent phrasing ("${starter}"). May require preceding context.`);
      break;
    }
  }

  // Check if starts mid-sentence (lowercase first character)
  if (cleanText.length > 0 && cleanText[0] === cleanText[0].toLowerCase() && /[a-z]/i.test(cleanText[0])) {
    contextConfidence -= 15;
    notesList.push('Opens mid-sentence.');
  }

  // 2. Check ending
  const lastWord = cleanText.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') || '';
  if (INCOMPLETE_ENDERS.includes(lastWord)) {
    hasConclusion = false;
    contextConfidence -= 20;
    notesList.push(`Ending ends abruptly with trailing word "${lastWord}".`);
  }

  // 3. Boundary check against surrounding segments
  // Check if start or end cuts through the middle of a spoken sentence
  const overlappingStart = surroundingSegments.find(s => start > s.start + 0.5 && start < s.end - 0.5);
  const overlappingEnd = surroundingSegments.find(s => end > s.start + 0.5 && end < s.end - 0.5);

  let adjustedStart = start;
  let adjustedEnd = end;

  if (overlappingStart) {
    // Snap to the beginning of this spoken segment if possible
    const newDur = end - overlappingStart.start;
    if (newDur <= maxDuration) {
      adjustedStart = Math.max(0, overlappingStart.start - 0.2);
      notesList.push(`Expanded start from ${start.toFixed(1)}s to ${adjustedStart.toFixed(1)}s to avoid speech cutoff.`);
      contextConfidence += 5;
    } else {
      flaggedForReview = true;
      notesList.push(`Clip start may clip into an earlier word at ${start.toFixed(1)}s.`);
    }
  }

  if (overlappingEnd) {
    // Snap to the end of the cut-off spoken segment if within maxDuration
    const newDur = overlappingEnd.end + 0.3 - adjustedStart;
    if (newDur <= maxDuration) {
      adjustedEnd = overlappingEnd.end + 0.3;
      notesList.push(`Extended end from ${end.toFixed(1)}s to ${adjustedEnd.toFixed(1)}s to complete phrase.`);
      contextConfidence += 5;
    } else {
      flaggedForReview = true;
      notesList.push(`Ending cut-off cannot be extended without exceeding ${maxDuration}s.`);
    }
  }

  if (adjustedStart !== start || adjustedEnd !== end) {
    suggestedAdjustment = {
      start: Math.round(adjustedStart * 10) / 10,
      end: Math.round(adjustedEnd * 10) / 10,
    };
  }

  if (contextConfidence < 65) {
    flaggedForReview = true;
  }

  if (notesList.length === 0) {
    notesList.push('Clear standalone thought boundaries with complete opening and closing.');
  }

  return {
    isCompleteThought,
    hasConclusion,
    hasDanglingPronouns,
    contextConfidence: Math.max(10, Math.min(100, contextConfidence)),
    suggestedAdjustment,
    notes: notesList.join(' '),
    flaggedForReview,
  };
}
