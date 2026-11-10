import { z } from 'zod';
import type { AutoCutClipCandidate, AutoCutScene } from './types';

export const naturalTransitionKinds = ['cut', 'crossfade', 'fade', 'match', 'action'] as const;
export const naturalTransitionProfiles = ['none', 'natural', 'cinematic', 'fast'] as const;
export const naturalTransitionNames = { cut: 'Hard Cut', crossfade: 'Cross Dissolve', fade: 'Fade', match: 'Match Cut', action: 'Action-Aligned Cut' };
export const NaturalTransitionConfigSchema = z.object({
  profile: z.enum(naturalTransitionProfiles),
  durationMs: z.number().int().min(67).max(600),
  overrides: z.record(z.string(), z.object({ kind: z.enum(naturalTransitionKinds), durationMs: z.number().int().min(67).max(600) })),
});
export type NaturalTransitionConfig = z.infer<typeof NaturalTransitionConfigSchema>;
export type NaturalTransitionKind = typeof naturalTransitionKinds[number];
export const defaultNaturalTransitions: NaturalTransitionConfig = { profile: 'natural', durationMs: 200, overrides: {} };
type Clip = AutoCutClipCandidate;
const identity = (clip: Clip) => [clip.sourceVideoId, clip.id, clip.startMs, clip.endMs];
export const transitionKey = (a: Clip, b: Clip) => JSON.stringify([identity(a), identity(b)]);
const shared = (a: string[] = [], b: string[] = []) => {
  const other = new Set(b.map(value => value.toLowerCase().trim()));
  return a.some(value => other.has(value.toLowerCase().trim()));
};
const nextCookingAction = (a: Clip, b: Clip) => Boolean(a.cookingActivity && b.cookingActivity && [
  'chopping:chopping', 'mixing:plating', 'frying:plating', 'garnishing:presentation', 'plating:presentation',
].includes(a.cookingActivity + ':' + b.cookingActivity));

export function annotateTransitionScenes(clips: Clip[], scenes: AutoCutScene[]) {
  return clips.map(clip => ({
    ...clip,
    transitionShot: scenes.find(scene => scene.startMs <= clip.startMs && scene.endMs > clip.startMs)?.shotType,
    transitionBlack: scenes.filter(scene => scene.shotType === 'black' && scene.startMs < clip.endMs && scene.endMs > clip.startMs)
      .map(scene => ({ startMs: scene.startMs, endMs: scene.endMs })),
  }));
}

export function suggestTransition(a: Clip, b: Clip, config: NaturalTransitionConfig) {
  const key = transitionKey(a, b);
  const choice = config.overrides[key];
  if (config.profile === 'none' || a.locked || b.locked || a.id === 'opening-hook') {
    return { key, kind: 'cut' as const, durationMs: 0, reason: 'Use a clean boundary for disabled transitions, locked ranges, or the opening hook.' };
  }
  const measuredA = a.qualityMeasurements?.frames.filter(frame => frame.timeMs >= a.startMs && frame.timeMs < a.endMs).at(-1);
  const measuredB = b.qualityMeasurements?.frames.find(frame => frame.timeMs >= b.startMs && frame.timeMs < b.endMs);
  const dxA = measuredA?.motionX ?? 0, dyA = measuredA?.motionY ?? 0;
  const dxB = measuredB?.motionX ?? 0, dyB = measuredB?.motionY ?? 0;
  const aligned = dxA * dxB + dyA * dyB > 0.75 * Math.hypot(dxA, dyA) * Math.hypot(dxB, dyB);
  const meaningful = Boolean(a.visionProvider && b.visionProvider &&
    (shared(a.actionTags, b.actionTags) || nextCookingAction(a, b)));
  const visualMatch = Boolean(a.visionProvider && b.visionProvider && shared(a.objects, b.objects) &&
    measuredA && measuredB && Math.abs(measuredA.luminance - measuredB.luminance) <= 35);
  let kind: NaturalTransitionKind = 'cut';
  let reason = 'A clean cut preserves the original scene and speech timing.';
  if (meaningful && aligned) { kind = 'action'; reason = 'Related actions have consistent measured motion direction at the selected shots.'; }
  else if (visualMatch && config.profile !== 'fast') { kind = 'match'; reason = 'The shots share an observed subject and similar sampled brightness.'; }
  else if (config.profile === 'cinematic' && measuredA && measuredB &&
    measuredA.luminance >= 28 && measuredB.luminance >= 28 && (measuredA.shift ?? Infinity) <= 1 && (measuredB.shift ?? Infinity) <= 1) {
    kind = b.transitionShot === 'fade' ? 'fade' : 'crossfade';
    reason = 'Low measured motion on both sides supports a short blend.';
  }
  if (choice) { kind = choice.kind; reason = 'Manually selected transition.'; }
  return { key, kind, reason, durationMs: kind === 'fade' || kind === 'crossfade' ? choice?.durationMs ?? config.durationMs : 0 };
}
