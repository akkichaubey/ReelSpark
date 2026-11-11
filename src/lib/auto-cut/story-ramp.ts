import { z } from 'zod';
import type { AutoCutClipCandidate } from './types';

export const storyClasses = ['essential', 'supporting', 'repetitive', 'duplicate', 'irrelevant'] as const;
export const storyProfiles = ['automatic', 'normal', 'gentle', 'fast'] as const;
export const StoryOverrideSchema = z.object({ importance: z.enum(storyClasses).optional(), profile: z.enum(storyProfiles).optional() });
export type StoryOverride = z.infer<typeof StoryOverrideSchema>;
export const STORY_FPS = 30;
export function rampShape(cap: number) {
  if (cap <= 1.5) return [0, 0.45, 1, 0.45, 0];
  if (cap <= 2) return [0, 0.25, 1, 0.6, 0];
  return [0, 1 / 6, 1 / 3, 1, 1 / 3, 0];
}

export function storyKey(clip: Pick<AutoCutClipCandidate, 'id' | 'sourceVideoId' | 'startMs' | 'endMs'>) {
  return JSON.stringify([clip.sourceVideoId, clip.id, clip.startMs, clip.endMs]);
}
export function classifyStory(clip: AutoCutClipCandidate, duplicate: boolean, override?: StoryOverride): typeof storyClasses[number] {
  if (clip.locked || clip.speechProtected || clip.recipeImportance === 'required') return 'essential';
  if (override?.importance) return override.importance;
  if (clip.recipeImportance === 'excluded' || clip.transitionShot === 'black' ||
    clip.recipeEvidence?.footage === 'failed_take') return 'irrelevant';
  if (clip.recipeEvidence?.essential || clip.cookingActivity === 'presentation' ||
      clip.storyImportance === 'essential' || clip.transcriptWords?.length || clip.duplicateKeep) return 'essential';
  if (duplicate) return 'duplicate';
  if (clip.repeatedTake || clip.recipeEvidence?.footage === 'repeat') return 'repetitive';
  return clip.storyImportance ?? (clip.recipeEvidence ? 'supporting' : 'essential');
}

export function rampTimeRatio(peak: number, cap = peak) {
  const rates = rampShape(cap).map(value => 1 + value * (peak - 1));
  return rates.slice(1).reduce((total, rate, index) => {
    const left = rates[index];
    return total + (rate === left ? 1 / left : Math.log(rate / left) / (rate - left)) / (rates.length - 1);
  }, 0);
}
export function peakForRatio(ratio: number, cap: number) {
  let lower = 1, upper = cap;
  for (let step = 0; step < 32; step++) {
    const middle = (lower + upper) / 2;
    if (rampTimeRatio(middle, cap) > ratio) lower = middle;
    else upper = middle;
  }
  return upper;
}

export function planStory(clips: AutoCutClipCandidate[], targetSeconds: number, hasAudio: boolean,
  overrides: Record<string, StoryOverride> = {}, duplicates: Set<string> = new Set()) {
  const rows = [...clips].sort((a, b) => a.startMs - b.startMs).map(clip => {
    const key = storyKey(clip);
    const override = overrides[key];
    const importance = classifyStory(clip, duplicates.has(clip.id), override);
    const protectedMotion = (clip.qualityMeasurements?.frames.some(frame => (frame.shift ?? 0) > 1.5) ?? false) ||
      clip.visualActionScore >= 75 || Boolean(clip.transitionBlack?.length);
    const protectedAudio = Boolean(clip.transcriptWords?.length || clip.speechProtected || (hasAudio && !clip.measuredSilence));
    const critical = importance === 'essential' && !['washing', 'mixing', 'marinating'].includes(clip.cookingActivity ?? '');
    const cap = clip.locked || critical || protectedAudio || protectedMotion || override?.profile === 'normal' ? 1 :
      override?.profile === 'gentle' || importance === 'essential' ? 1.5 :
        override?.profile === 'fast' || importance === 'repetitive' ? 4 : 2;
    const frames = Math.floor((clip.endMs - clip.startMs) * STORY_FPS / 1000);
    const minimum = Math.ceil(frames * rampTimeRatio(cap) - 1e-9);
    return { key, clip, importance, cap, frames, minimum, outputFrames: frames,
      included: frames > 0 && importance !== 'irrelevant' && importance !== 'duplicate',
      uncertain: !clip.storyImportance && !clip.recipeEvidence && !override?.importance && !clip.locked &&
        !clip.transcriptWords?.length && !duplicates.has(clip.id) };
  });
  const targetFrames = Math.round(targetSeconds * STORY_FPS);
  const candidates = rows.filter(row => row.included);
  const minimum = candidates.reduce((sum, row) => sum + row.minimum, 0);
  if (minimum > targetFrames) {
    const essential = candidates.filter(row => row.importance === 'essential');
    const optional = candidates.filter(row => row.importance !== 'essential');
    const capacity = Math.max(0, targetFrames - essential.reduce((sum, row) => sum + row.minimum, 0));
    // Maximize footage available at 1× within the safe minimum budget. This
    // avoids dropping a long shot when shorter removals can hit the target.
    const footage = new Int32Array(capacity + 1);
    const quality = new Float64Array(capacity + 1);
    const choices = optional.map(row => {
      const chosen = new Uint8Array(capacity + 1);
      const merit = row.clip.score + (row.importance === 'repetitive' ? 0 : 100);
      for (let room = capacity; room >= row.minimum; room--) {
        const previous = room - row.minimum;
        const frames = footage[previous] + row.frames;
        const score = quality[previous] + merit;
        if (frames < footage[room] || (frames === footage[room] && score <= quality[room])) continue;
        footage[room] = frames;
        quality[room] = score;
        chosen[room] = 1;
      }
      return chosen;
    });
    let room = capacity;
    for (let index = optional.length - 1; index >= 0; index--) {
      optional[index].included = choices[index][room] === 1;
      if (optional[index].included) room -= optional[index].minimum;
    }
  }
  const selected = rows.filter(row => row.included);
  const overlaps = selected.some((row, index) => index > 0 && selected[index - 1].clip.endMs > row.clip.startMs);
  let reduction = selected.reduce((sum, row) => sum + row.frames, 0) - targetFrames;
  for (const row of [...selected].sort((a, b) =>
    Number(a.importance === 'essential') - Number(b.importance === 'essential') || b.cap - a.cap || a.clip.score - b.clip.score)) {
    const cut = Math.min(Math.max(0, reduction), row.frames - row.minimum);
    row.outputFrames -= cut;
    reduction -= cut;
  }
  return { rows, targetFrames, minimumFrames: selected.reduce((sum, row) => sum + row.minimum, 0), overlaps,
    outputFrames: selected.reduce((sum, row) => sum + row.outputFrames, 0) };
}
