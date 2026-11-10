import { validateAutoCutScenes, type AutoCutClipCandidate, type AutoCutScene, type SceneCut } from './types';

export function buildAutoCutScenes(
  sourceVideoId: string,
  durationMs: number,
  cuts: SceneCut[],
  blackIntervals: { startMs: number; endMs: number }[],
  candidates: AutoCutClipCandidate[],
  motionMs: number[] = [],
) {
  const boundaries = new Map<number, { shotType: AutoCutScene['shotType']; confidence: number }>();
  boundaries.set(0, { shotType: 'continuous', confidence: 0 });
  for (const cut of cuts) {
    const time = Math.round(cut.timestampSec * 1000);
    if (time > 0 && time < durationMs) {
      boundaries.set(time, { shotType: cut.kind ?? 'hard_cut', confidence: Math.min(100, cut.score * 100) });
    }
  }
  for (const interval of blackIntervals) {
    for (const time of boundaries.keys()) {
      if (time >= interval.startMs && time < interval.endMs) boundaries.delete(time);
    }
    boundaries.set(interval.startMs, { shotType: 'black', confidence: 98 });
    if (!boundaries.has(interval.endMs)) boundaries.set(interval.endMs, { shotType: 'continuous', confidence: 0 });
  }
  const points = [...new Set([...boundaries.keys(), durationMs])].sort((a, b) => a - b);
  let motionIndex = 0;
  const scenes = points.slice(0, -1).map((startMs, index): AutoCutScene => {
    const endMs = points[index + 1];
    const boundary = boundaries.get(startMs)!;
    const observations = boundary.shotType === 'black' ? [] : candidates.filter(candidate =>
      candidate.analysisMethod === 'semantic' && candidate.startMs < endMs && candidate.endMs > startMs &&
      candidate.evidenceFrames?.some(time => time >= startMs && time < endMs));
    const strongest = observations.reduce<AutoCutClipCandidate | undefined>((best, candidate) =>
      !best || candidate.score > best.score ? candidate : best, undefined);
    while (motionIndex < motionMs.length && motionMs[motionIndex] < startMs) motionIndex++;
    const firstMotion = motionIndex;
    while (motionIndex < motionMs.length && motionMs[motionIndex] < endMs) motionIndex++;
    const semanticActions: AutoCutScene['semanticActions'] = [];
    for (const observation of observations.sort((a, b) => a.startMs - b.startMs)) {
      const start = Math.max(startMs, observation.startMs);
      const end = Math.min(endMs, observation.endMs);
      const label = observation.category;
      if (!label) continue;
      const previous = semanticActions.at(-1);
      if (previous?.label === label && previous.endMs === start) {
        previous.endMs = end;
        previous.confidence = Math.min(previous.confidence, observation.confidence);
      } else {
        semanticActions.push({ startMs: start, endMs: end, label, confidence: observation.confidence });
      }
    }
    return {
      sourceVideoId,
      sceneId: `scene_${startMs}_${endMs}`,
      startMs,
      endMs,
      ...boundary,
      actionTags: [...new Set(observations.flatMap(candidate => [...(candidate.actionTags ?? []), ...(candidate.cookingActivity ? [candidate.cookingActivity] : [])]))].slice(0, 12),
      objects: [...new Set(observations.flatMap(candidate => candidate.objects ?? []))].slice(0, 12),
      motionDetected: motionIndex - firstMotion >= 3,
      semanticActions,
      description: strongest?.category || (boundary.shotType === 'black' ? 'Black frames' : 'Continuous source footage'),
      evidenceFrames: [...new Set(observations.flatMap(candidate => candidate.evidenceFrames ?? []))]
        .filter(time => time >= startMs && time < endMs).sort((a, b) => a - b).slice(0, 12),
      provenance: strongest ? 'hybrid' : 'ffmpeg',
      visionProviders: [...new Set(observations.flatMap(candidate => candidate.visionProvider ? [candidate.visionProvider] : []))],
      excluded: boundary.shotType === 'black',
      locked: false,
    };
  });
  return validateAutoCutScenes(scenes, sourceVideoId, durationMs);
}

/** Preserve edits as a coherent set. Reanalysis can refresh untouched boundaries only. */
export function reconcileAutoCutScenes(previous: AutoCutScene[], detected: AutoCutScene[]) {
  if (!previous.some(scene => scene.locked || scene.provenance === 'manual' || scene.excluded !== (scene.shotType === 'black'))) return detected;
  return previous;
}

export function sceneCandidates(scenes: AutoCutScene[], candidates: AutoCutClipCandidate[]) {
  return scenes.filter(scene => !scene.excluded).map((scene): AutoCutClipCandidate => {
    const observed = candidates.find(candidate => candidate.startMs <= scene.startMs && candidate.endMs > scene.startMs);
    return {
      ...observed,
      id: scene.sceneId,
      sourceVideoId: scene.sourceVideoId,
      locked: scene.locked,
      transitionShot: scene.shotType,
      startMs: scene.startMs,
      endMs: scene.endMs,
      durationMs: scene.endMs - scene.startMs,
      category: scene.description,
      reason: 'Accepted scene range',
      confidence: scene.confidence,
      score: observed?.score ?? scene.confidence,
      visualActionScore: observed?.visualActionScore ?? 0,
      audioScore: observed?.audioScore ?? 0,
      selected: true,
      transcriptWords: candidates.flatMap(candidate => candidate.transcriptWords ?? [])
        .filter(word => word.startMs >= scene.startMs && word.endMs <= scene.endMs),
    };
  });
}
