import type { AutoCutClipCandidate, AutoCutSettings } from './types';
import { scoreAutoCutQuality } from './quality';
import { clusterDuplicates, qualityRedundancy } from './duplicates';

const styleTiming = {
  recipe: { minimum: 1000, preferred: 4000 },
  cinematic: { minimum: 1400, preferred: 6500 },
  quick_tip: { minimum: 650, preferred: 2200 },
  step_by_step: { minimum: 1300, preferred: 5000 },
};

export function assembleRecipe(candidates: AutoCutClipCandidate[], settings: AutoCutSettings) {
  const targetDurationMs = Math.round(settings.targetDurationSeconds * 1000);
  const timing = styleTiming[settings.recipeStyle ?? 'recipe'];
  const sourceOrder = new Map(candidates.map((clip, index) => [clip.id, index]));
  const chronological = (a: AutoCutClipCandidate, b: AutoCutClipCandidate) => {
    if (a.recipeOrder !== undefined && b.recipeOrder !== undefined) return a.recipeOrder - b.recipeOrder;
    if (a.sourceVideoId === b.sourceVideoId) return a.startMs - b.startMs;
    return sourceOrder.get(a.id)! - sourceOrder.get(b.id)!;
  };
  const pool = candidates.filter(clip => clip.selected && clip.recipeImportance !== 'excluded' &&
    Number.isSafeInteger(clip.startMs) && Number.isSafeInteger(clip.endMs) && clip.startMs >= 0 &&
    clip.endMs - clip.startMs >= 100);
  const priority = (clip: AutoCutClipCandidate) => {
    if (clip.locked || clip.recipeImportance === 'required' || clip.duplicateKeep) return 4;
    if (clip.recipeEvidence && clip.recipeEvidence.footage !== 'step') return 0;
    if (clip.cookingActivity === 'presentation') return 3;
    if (clip.recipeImportance === 'optional') return 1;
    if (clip.recipeEvidence?.essential) return 2;
    return 1;
  };
  const useful = pool.filter(clip => priority(clip) > 0 ||
    (settings.recipeStyle === 'cinematic' && clip.recipeEvidence?.footage === 'aesthetic'));
  const redundancy = qualityRedundancy(clusterDuplicates(useful, []));
  const quality = new Map(useful.map(clip => [clip, scoreAutoCutQuality(clip, settings, redundancy.get(clip.id)).total ?? clip.score]));
  const ranked = [...useful].sort((a, b) => priority(b) - priority(a) ||
    (a.cookingActivity === 'presentation' && b.cookingActivity === 'presentation' ? chronological(b, a) : 0) ||
    quality.get(b)! - quality.get(a)! || chronological(a, b));
  const distinct = ranked;
  const stages = new Set<string>();
  const stageWinners = distinct.filter(clip => {
    if (!clip.cookingActivity || clip.cookingActivity === 'other' || stages.has(clip.cookingActivity)) return false;
    stages.add(clip.cookingActivity);
    return true;
  });
  const mandatory = distinct.filter(clip => priority(clip) >= 2 && clip.recipeImportance !== 'optional');
  // With sparse evidence, spread review footage over the source instead of filling from the start.
  const sourceSequence = [...distinct].sort(chronological);
  const coverageCount = Math.min(sourceSequence.length, Math.max(2, Math.ceil(targetDurationMs / timing.preferred)));
  const hasFinalDish = useful.some(clip => clip.cookingActivity === 'presentation');
  const coverage = stageWinners.length
    ? [sourceSequence[0], ...(hasFinalDish ? [] : sourceSequence.slice(-1))]
    : Array.from({ length: coverageCount }, (_, index) =>
      sourceSequence[Math.round(index * (sourceSequence.length - 1) / Math.max(1, coverageCount - 1))]);
  const anchors = new Set([...mandatory, ...stageWinners, ...coverage]);
  const ordered = [...new Set([...anchors, ...distinct])];
  const picks = pool.filter(clip => clip.locked).map(clip => ({ clip, duration: clip.endMs - clip.startMs }));
  let totalDurationMs = picks.reduce((sum, pick) => sum + pick.duration, 0);
  let preferredCoverageMs = totalDurationMs;
  for (const clip of ordered) {
    if (clip.locked) continue;
    if (!anchors.has(clip) && preferredCoverageMs >= targetDurationMs) break;
    const duration = Math.min(timing.minimum, clip.endMs - clip.startMs);
    if (totalDurationMs + duration > targetDurationMs) continue;
    if (picks.some(pick => pick.clip.sourceVideoId === clip.sourceVideoId &&
      pick.clip.startMs < clip.endMs && clip.startMs < pick.clip.endMs)) continue;
    picks.push({ clip, duration });
    totalDurationMs += duration;
    preferredCoverageMs += Math.min(timing.preferred, clip.endMs - clip.startMs);
  }
  for (const pick of picks) {
    if (pick.clip.locked) continue;
    const extra = Math.min(Math.max(0, targetDurationMs - totalDurationMs),
      Math.max(0, Math.min(timing.preferred, pick.clip.endMs - pick.clip.startMs) - pick.duration));
    pick.duration += extra;
    totalDurationMs += extra;
  }
  const assembledClips = picks.sort((a, b) => chronological(a.clip, b.clip)).map(({ clip, duration }) => {
    const evidence = clip.evidenceFrames?.find(time => time >= clip.startMs && time < clip.endMs);
    const startMs = evidence === undefined ? clip.startMs :
      Math.max(clip.startMs, Math.min(clip.endMs - duration, evidence - Math.floor(duration / 3)));
    return { ...clip, startMs, endMs: startMs + duration, durationMs: duration, transitionToNext: settings.transition };
  });
  const included = new Set(assembledClips.map(clip => clip.id));
  return {
    assembledClips, totalDurationMs, targetDurationMs,
    omittedSteps: mandatory.filter(clip => !included.has(clip.id)).map(clip => clip.category),
    hasFinalDish,
  };
}
