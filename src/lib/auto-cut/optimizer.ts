import type { AutoCutClipCandidate, AutoCutSettings } from './types';
import type { Clip } from '../clipping-studio/contracts';
import type { TimelineClip } from '../timeline/model';

/** Select bounded, non-overlapping source ranges. Never invent footage to fill a target. */
export function optimizeDurationAndAssemble(candidates: AutoCutClipCandidate[], settings: AutoCutSettings) {
  const targetDurationMs = Math.round(settings.targetDurationSeconds * 1000);
  const pool = candidates.filter(c => c.selected && Number.isFinite(c.startMs) && Number.isFinite(c.endMs) && c.startMs >= 0 && c.endMs > c.startMs)
    .map(c => ({ ...c, durationMs: c.endMs - c.startMs, speedMultiplier: 1 }));
  const chronological = [...pool].sort((a, b) => a.startMs - b.startMs);
  const visualWeight = settings.sceneSelection === 'visual' ? 0.85 : settings.sceneSelection === 'speech' ? 0.15 : 0.5;
  const rank = (c: AutoCutClipCandidate) => c.analysisMethod === 'semantic' ?
    (settings.mode === 'podcast' ? c.audioScore : settings.mode === 'cooking_recipe' && c.cookingActivity && c.cookingActivity !== 'other' ? c.score + 20 : c.score) : settings.mode === 'podcast' ? c.audioScore :
    settings.mode === 'cinematic' ? c.visualActionScore + Math.min(c.durationMs / 1000, 10) :
    c.visualActionScore * visualWeight + c.audioScore * (1 - visualWeight);
  let ranked = [...pool].sort((a, b) => rank(b) - rank(a) || a.startMs - b.startMs);
  const coverage = new Set<(typeof pool)[number]>();
  const coverageShotMs = 3000;
  if (settings.mode === 'auto_highlight' && chronological.length > 1) {
    const first = chronological[0];
    const last = chronological[chronological.length - 1];
    // Reserve room for the opening and closing shots before choosing section winners.
    const count = Math.max(0, Math.min(Math.floor(targetDurationMs / 4000),
      Math.floor(targetDurationMs / coverageShotMs) - 2));
    const span = Math.max(1, last.startMs - first.startMs);
    const sections = new Map<number, (typeof pool)[number]>();
    coverage.add(first);
    coverage.add(last);
    for (const clip of ranked) {
      if (!count || coverage.has(clip)) continue;
      const section = Math.min(count - 1, Math.floor((clip.startMs - first.startMs) * count / span));
      const current = sections.get(section);
      const midpoint = first.startMs + (section + 0.5) * span / count;
      if (!current || (rank(clip) === rank(current) &&
        Math.abs(clip.startMs - midpoint) < Math.abs(current.startMs - midpoint))) {
        sections.set(section, clip);
      }
    }
    for (const clip of sections.values()) coverage.add(clip);
    const seen = new Set([...coverage].filter(clip => clip.analysisMethod === 'semantic').map(clip => clip.category.trim().toLowerCase()));
    const repeats = new Set<(typeof pool)[number]>();
    for (const clip of ranked) {
      if (coverage.has(clip) || clip.analysisMethod !== 'semantic') continue;
      const label = clip.category.trim().toLowerCase();
      if (seen.has(label)) repeats.add(clip);
      seen.add(label);
    }
    ranked = [...coverage, ...ranked.filter(clip => !coverage.has(clip) && !repeats.has(clip)), ...repeats];
  }
  if (settings.mode === 'cooking_recipe' || settings.mode === 'tutorial') {
    const count = Math.min(chronological.length, Math.max(2, Math.ceil(targetDurationMs / 5000)));
    const steps = Array.from({ length: count }, (_, i) => chronological[Math.round(i * (chronological.length - 1) / Math.max(1, count - 1))]);
    const activities = new Set<string>();
    const recipeSteps = settings.mode === 'cooking_recipe' ? ranked.filter(c => {
      if (!c.cookingActivity || c.cookingActivity === 'other' || activities.has(c.cookingActivity)) return false;
      activities.add(c.cookingActivity); return true;
    }) : [];
    ranked = [...new Set([...recipeSteps, ...steps, ...ranked])];
  }
  const intensity = settings.intensity === 'minimal' ? 1.5 : settings.intensity === 'aggressive' ? 0.65 : 1;
  const shotLimit = settings.mode === 'fast_paced' ? 3000 : settings.mode === 'cinematic' ? 8000 :
    settings.pacing === 'slow' ? 8000 : settings.pacing === 'fast' ? 3000 : 5000;
  const assembledClips: AutoCutClipCandidate[] = [];
  let totalDurationMs = 0;
  for (const c of ranked) {
    if (totalDurationMs >= targetDurationMs) break;
    const cap = Math.round(shotLimit * intensity * (settings.pacing === 'dynamic' ? (c.visualActionScore >= 65 ? 0.65 : 1.3) : 1));
    const durationMs = Math.min(c.durationMs, settings.mode === 'fast_paced' || coverage.has(c) ? Math.min(coverageShotMs, cap) : cap, targetDurationMs - totalDurationMs);
    if (durationMs < 100) continue;
    const clip = { ...c, durationMs, endMs: c.startMs + durationMs, transitionToNext: settings.transition };
    if (assembledClips.some(other => clip.startMs < other.endMs && clip.endMs > other.startMs)) continue;
    assembledClips.push(clip); totalDurationMs += durationMs;
  }
  // Expand only into unused footage within the candidate's original range.
  if (settings.mode !== 'fast_paced' && totalDurationMs < targetDurationMs) {
    for (const clip of assembledClips) {
      const original = pool.find(c => c.id === clip.id)!;
      const next = assembledClips.filter(c => c.startMs > clip.startMs).sort((a,b) => a.startMs-b.startMs)[0];
      const availableEnd = Math.min(original.endMs, next?.startMs ?? original.endMs);
      const extra = Math.max(0, Math.min(availableEnd - clip.endMs, targetDurationMs - totalDurationMs));
      clip.endMs += extra; clip.durationMs += extra; totalDurationMs += extra;
    }
  }
  assembledClips.sort((a, b) => a.startMs - b.startMs);
  return { assembledClips, totalDurationMs, targetDurationMs };
}



export function autoCutClipsToStudioClips(candidates: AutoCutClipCandidate[], projectId: string, mediaAssetId: string): Clip[] {
  const now = new Date().toISOString();
  return candidates.filter(c => c.selected).map((c, index) => ({ id: `clip_${crypto.randomUUID()}`, projectId, mediaAssetId,
    name: c.category || `Cut ${index + 1}`, startMs: c.startMs, endMs: c.endMs, durationMs: c.endMs - c.startMs,
    orderIndex: index, notes: `Auto Cut: ${c.reason}`, createdAt: now, updatedAt: now }));
}

export function autoCutClipsToTimelineClips(candidates: AutoCutClipCandidate[], trackId: string, assetId?: string): TimelineClip[] {
  if (candidates.some(c => (c.speedMultiplier ?? 1) !== 1)) {
    throw new Error('Auto Cut supports original playback speed.');
  }
  const selected = candidates.filter(c => c.selected);
  let cursor = 0;
  const clips = selected.map((c): TimelineClip => {
    const startMs = cursor; cursor += c.durationMs;
    return { id: `tc_${crypto.randomUUID()}`, trackId, assetId, name: c.category || 'Auto Cut', startMs,
      sourceStartMs: c.startMs, durationMs: c.durationMs, volume: 1, muted: false, loop: false,
      fadeInMs: 0, fadeOutMs: 0, transitionIn: 'cut' };
  });
  if (trackId !== 'video') return clips;
  for (let index = 1; index < clips.length; index++) {
    const outgoing = selected[index - 1];
    const incoming = selected[index];
    const style = outgoing.transitionToNext;
    if (style !== 'smooth' && style !== 'dynamic') continue;
    // An unused tail in the source lets the incoming clip keep its planned position.
    const overlap = Math.min(200, incoming.startMs - outgoing.endMs,
      Math.floor(outgoing.durationMs / 4), Math.floor(incoming.durationMs / 4));
    if (overlap < 150) continue;
    if (style === 'dynamic' && outgoing.category === incoming.category) continue;
    const outgoingSpeech = outgoing.transcriptWords?.some(word =>
      word.endMs > outgoing.endMs - overlap && word.startMs < outgoing.endMs + overlap);
    const incomingSpeech = incoming.transcriptWords?.some(word =>
      word.startMs < incoming.startMs + overlap && word.endMs > incoming.startMs);
    if (outgoingSpeech || incomingSpeech) continue;
    clips[index - 1].durationMs += overlap;
    clips[index - 1].audioFadeOutMs = overlap;
    clips[index].transitionIn = 'crossfade';
    clips[index].fadeInMs = overlap;
    clips[index].audioFadeInMs = overlap;
  }
  return clips;
}
