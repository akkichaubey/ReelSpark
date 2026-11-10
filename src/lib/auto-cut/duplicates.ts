import { z } from 'zod';
import type { AutoCutClipCandidate } from './types';

type Clip = AutoCutClipCandidate;
type Match = { kind: 'Exact file match' | 'Visual duplicate' | 'Possible alternate take' | 'Possible simultaneous angle'; confidence: number; reason: string };
export type DuplicateCluster = { preferred: Clip; alternatives: { clip: Clip; match: Match }[] };

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const list = (values: string[] = []) => new Set(values.map(normalize).filter(Boolean));
const durationRatio = (a: Clip, b: Clip) => Math.min(a.durationMs, b.durationMs) / Math.max(a.durationMs, b.durationMs);
const overlap = (a: Pick<Clip, 'startMs' | 'endMs'>, b: Pick<Clip, 'startMs' | 'endMs'>) =>
  Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
const timedSpeech = (clip: Clip) => (clip.transcriptWords ?? []).filter(word => word.startMs >= clip.startMs && word.endMs <= clip.endMs);
const spoken = (clip: Clip) => normalize(timedSpeech(clip).map(word => word.text).join(' '));
const action = (clip: Clip) => clip.visionProvider && clip.evidenceFrames?.length
  ? normalize(clip.cookingActivity ?? clip.actionTags?.[0] ?? '') : '';

function distance(a: string, b: string) {
  let count = 0;
  for (let start = 0; start < 16; start += 8) {
    let difference = Number.parseInt(a.slice(start, start + 8), 16) ^ Number.parseInt(b.slice(start, start + 8), 16);
    while (difference) { difference &= difference - 1; count++; }
  }
  return count;
}

function sharedAudio(a?: number[], b?: number[]) {
  if (!a || !b) return false;
  for (let lag = -6; lag <= 6; lag++) {
    const startA = Math.max(0, lag), startB = Math.max(0, -lag);
    const count = Math.min(a.length - startA, b.length - startB);
    if (count < 32) continue;
    let changes = 0, energyA = 0, energyB = 0, cross = 0;
    for (let i = 1; i < count; i++) {
      const x = Math.max(-70, a[startA + i]) - Math.max(-70, a[startA + i - 1]);
      const y = Math.max(-70, b[startB + i]) - Math.max(-70, b[startB + i - 1]);
      if (Math.abs(x) >= 4 && Math.abs(y) >= 4) changes++;
      energyA += x * x;
      energyB += y * y;
      cross += x * y;
    }
    if (changes >= 10 && cross > 0.96 * Math.sqrt(energyA * energyB)) return true;
  }
  return false;
}

function compare(a: Clip, b: Clip): Match | undefined {
  const differentSources = a.sourceVideoId !== b.sourceVideoId;
  if (!differentSources && overlap(a, b) > 0) return;
  if (differentSources && a.duplicateEvidence?.contentHash && a.duplicateEvidence.contentHash === b.duplicateEvidence?.contentHash &&
      overlap(a, b) >= Math.min(a.durationMs, b.durationMs) * 0.85 && durationRatio(a, b) >= 0.8) {
    return { kind: 'Exact file match', confidence: 100, reason: 'Identical SHA-256 file hashes and corresponding source ranges.' };
  }
  const aFrames = a.duplicateEvidence?.frames;
  const bFrames = b.duplicateEvidence?.frames;
  const ingredientsA = list(a.recipeEvidence?.ingredients);
  const ingredientsB = list(b.recipeEvidence?.ingredients);
  const sharedIngredients = [...ingredientsA].filter(item => ingredientsB.has(item));
  if (ingredientsA.size && ingredientsB.size && (sharedIngredients.length !== ingredientsA.size || sharedIngredients.length !== ingredientsB.size)) return;
  if (aFrames?.length === 3 && bFrames?.length === 3 && durationRatio(a, b) >= 0.7) {
    const distances = aFrames.map((hashes, index) => Math.min(64, ...hashes.flatMap(hash => bFrames[index].map(other => distance(hash, other)))));
    if (Math.max(...distances) <= 12 && distances.reduce((sum, item) => sum + item, 0) <= 27) {
      return { kind: 'Visual duplicate', confidence: Math.round(98 - distances.reduce((sum, item) => sum + item, 0) / 2),
        reason: 'Three ordered frame fingerprints match across the source ranges.' };
    }
  }
  if (differentSources && aFrames?.every(frame => frame.length) && bFrames?.every(frame => frame.length) &&
      sharedAudio(a.duplicateEvidence?.audio, b.duplicateEvidence?.audio)) {
    return { kind: 'Possible simultaneous angle', confidence: 83,
      reason: 'Different visual fingerprints share a distinctive audio pattern. Shared backing audio can also match.' };
  }
  const sharedAction = action(a);
  if (!sharedAction || sharedAction !== action(b) || sharedAction === 'other') return;
  const speech = spoken(a);
  const aSpeech = timedSpeech(a), bSpeech = timedSpeech(b);
  if (differentSources && speech.split(' ').length >= 5 && speech === spoken(b) && aSpeech.length === bSpeech.length &&
      aSpeech.every((word, index) => Math.abs((word.startMs - aSpeech[0].startMs) - (bSpeech[index].startMs - bSpeech[0].startMs)) <= 160)) {
    return { kind: 'Possible simultaneous angle', confidence: 78, reason: 'Different views share an evidenced action and the same timed phrase. Review synchronization.' };
  }
  const repeat = a.repeatedTake || b.repeatedTake || a.recipeEvidence?.footage === 'repeat' || b.recipeEvidence?.footage === 'repeat';
  const tags = list(b.actionTags);
  const sharedTags = [...list(a.actionTags)].filter(tag => tags.has(tag));
  const sameDescription = normalize(a.category) === normalize(b.category) && normalize(a.category).split(' ').length >= 3;
  const objects = list(b.objects);
  const sharedObject = [...list(a.objects)].some(item => objects.has(item));
  if (repeat && (sharedIngredients.length || sharedTags.length >= 2 || (sameDescription && sharedObject)) && durationRatio(a, b) >= 0.5) {
    return { kind: 'Possible alternate take', confidence: 68, reason: 'The semantic analyzer flagged a repeat and the ranges share ingredient or action evidence.' };
  }
}

export const DuplicateDecisionSchema = z.object({
  sourceVideoId: z.string().optional(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
  value: z.enum(['keep', 'exclude']),
});
export type DuplicateDecision = z.infer<typeof DuplicateDecisionSchema>;
export function duplicateDecision(clip: Clip, decisions: DuplicateDecision[]) {
  for (let index = decisions.length - 1; index >= 0; index--) {
    const item = decisions[index];
    if (item.sourceVideoId !== clip.sourceVideoId) continue;
    const shared = overlap(item, clip);
    if (shared > 0 && (item.value === 'exclude' || shared >= clip.durationMs * 0.85)) return item.value;
  }
}
export function applyDuplicateDecisions(clips: Clip[], decisions: DuplicateDecision[]): Clip[] {
  return clips.map(clip => {
    const value = duplicateDecision(clip, decisions);
    return value ? { ...clip, selected: value === 'keep', duplicateKeep: value === 'keep' } : { ...clip, duplicateKeep: undefined };
  });
}

export function clusterDuplicates(clips: Clip[], decisions: DuplicateDecision[], primaryId?: string,
  sourcePixels: Record<string, number> = {}): DuplicateCluster[] {
  const rank = (clip: Clip) => (duplicateDecision(clip, decisions) === 'keep' || clip.duplicateKeep ? 1000 : 0) -
    (duplicateDecision(clip, decisions) === 'exclude' ? 1000 : 0) + (clip.sourceVideoId === primaryId ? 8 : 0) +
    clip.visualActionScore * 0.4 + clip.confidence * 0.2 + clip.score * 0.2 + Math.min(clip.durationMs / 500, 15) +
    Math.min((sourcePixels[clip.sourceVideoId ?? ''] ?? 0) / 200_000, 10) - (clip.audioQuality === 'clipped_signal' ? 5 : 0) +
    (clip.recipeEvidence?.footage === 'step' ? 10 : 0);
  const ordered = clips.map(clip => ({ clip, rank: rank(clip) })).sort((a, b) => b.rank - a.rank).map(item => item.clip);
  const keys = (clip: Clip) => {
    const evidence = clip.duplicateEvidence;
    const keys = evidence?.contentHash ? ['file:' + evidence.contentHash + ':' + Math.floor(clip.startMs / 1000)] : [];
    const label = action(clip);
    if (label) keys.push('action:' + label);
    if (evidence?.audio?.length) keys.push('audio-time:' + Math.floor(clip.startMs / 3000), 'audio-time:' + Math.floor((clip.startMs + 1500) / 3000));
    evidence?.frames?.forEach((frames, index) => frames.forEach(hash => {
      for (let band = 0; band < 4; band++) keys.push('frame:' + index + ':' + band + ':' + hash.slice(band * 4, band * 4 + 4));
    }));
    return keys;
  };
  const buckets = new Map<string, Clip[]>();
  const indexed = new Map(ordered.map(clip => [clip, keys(clip)]));
  for (const [clip, entries] of indexed) for (const key of new Set(entries)) {
    const bucket = buckets.get(key) ?? [];
    if (bucket.length < 48) bucket.push(clip);
    buckets.set(key, bucket);
  }
  const assigned = new Set<Clip>();
  const clusters: DuplicateCluster[] = [];
  for (const preferred of ordered) {
    if (assigned.has(preferred)) continue;
    const entries = indexed.get(preferred) ?? [];
    const options = new Set(entries.flatMap(key => buckets.get(key) ?? []));
    const alternatives = [...options].flatMap(clip => {
      if (clip === preferred || assigned.has(clip)) return [];
      const match = compare(preferred, clip);
      return match ? [{ clip, match }] : [];
    });
    if (!alternatives.length) continue;
    assigned.add(preferred);
    for (const item of alternatives) assigned.add(item.clip);
    clusters.push({ preferred, alternatives });
  }
  return clusters;
}

export function qualityRedundancy(clusters: DuplicateCluster[]) {
  return new Map(clusters.flatMap(({ alternatives }) => alternatives.map(({ clip, match }) => {
    const measured = match.kind === 'Exact file match' || match.kind === 'Visual duplicate';
    return [clip.id, { measured, score: measured ? 25 : 55, reason: match.reason }] as const;
  })));
}
