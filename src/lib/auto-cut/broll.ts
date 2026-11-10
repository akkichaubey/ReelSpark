import { z } from 'zod';
import type { AutoCutClipCandidate } from './types';
import type { MediaAsset } from '../clipping-studio/contracts';
import { scoreAutoCutQuality } from './quality';
import { clusterDuplicates } from './duplicates';

export const brollModes = ['replace', 'overlay', 'insert'] as const;
export const BRollEditSchema = z.object({
  targetId: z.string(), targetSourceId: z.string(), targetStartMs: z.number().int().nonnegative(),
  sourceId: z.string(), startMs: z.number().int().nonnegative(), durationMs: z.number().int().min(250).max(15000),
  offsetMs: z.number().int().nonnegative(), mode: z.enum(brollModes),
});
export type BRollEdit = z.infer<typeof BRollEditSchema>;
export type BRollSuggestion = { clip: AutoCutClipCandidate; source: MediaAsset; score: number; reason: string; startMs: number };
const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)
  .filter(token => token.length >= 3 && !['the', 'and', 'with', 'this', 'then', 'from', 'for', 'video', 'footage', 'shows', 'now', 'next'].includes(token)));
const overlap = (start: number, end: number, otherStart: number, otherEnd: number) => start < otherEnd && otherStart < end;
export const brollTargetKey = (clip: Pick<AutoCutClipCandidate, 'id' | 'sourceVideoId' | 'startMs'>) =>
  JSON.stringify([clip.id, clip.sourceVideoId, clip.startMs]);

export function brollOpportunity(clip: AutoCutClipCandidate) {
  const speech = clip.transcriptWords?.some(word => word.startMs >= clip.startMs && word.endMs <= clip.endMs);
  const stage = Boolean(clip.cookingActivity && !['other', 'presentation'].includes(clip.cookingActivity));
  const lowAction = clip.visualActionScore < 40 && clip.durationMs >= 2000;
  return {
    rank: (speech ? 40 : 0) + (stage ? 20 : 0) + (lowAction ? 15 : 0) - (clip.cookingActivity === 'presentation' ? 20 : 0),
    reason: speech ? (lowAction ? 'Narration continues over a low-action shot.' : 'An illustrative shot can reinforce the spoken detail.') :
      stage ? 'A supporting angle can show this recipe step in more detail.' : 'Review whether this segment needs a supporting visual.',
  };
}

export function suggestBRoll(target: AutoCutClipCandidate, footage: AutoCutClipCandidate[], assets: MediaAsset[],
  main: AutoCutClipCandidate[], edits: BRollEdit[], projectId: string): BRollSuggestion[] {
  const catalog = new Map(assets.map(asset => [asset.id, asset]));
  const speech = words((target.transcriptWords ?? []).filter(word => word.startMs >= target.startMs && word.endMs <= target.endMs).map(word => word.text).join(' '));
  const context = words([target.category, ...(target.actionTags ?? []), ...(target.objects ?? []),
    ...(target.recipeEvidence?.ingredients ?? []), ...(target.recipeEvidence?.techniques ?? [])].join(' '));
  const mainIds = new Set(main.map(clip => clip.id));
  const duplicateOfMain = new Set<string>();
  const equivalent = new Map<string, string>();
  for (const group of clusterDuplicates([...new Map([...footage, ...main].map(clip => [clip.id, clip])).values()], [])) {
    const matches = group.alternatives.filter(item => item.match.kind === 'Exact file match' || item.match.kind === 'Visual duplicate');
    const ids = [group.preferred.id, ...matches.map(item => item.clip.id)];
    if (ids.length < 2) continue;
    for (const id of ids) {
      equivalent.set(id, group.preferred.id);
      if (ids.some(item => mainIds.has(item))) duplicateOfMain.add(id);
    }
  }
  const suggestions: BRollSuggestion[] = [];
  for (const clip of footage) {
    const source = catalog.get(clip.sourceVideoId ?? '');
    const frames = clip.evidenceFrames?.filter(frame => frame >= clip.startMs && frame < clip.endMs) ?? [];
    if (!source?.metadata.hasVideo || !clip.visionProvider || !frames.length || duplicateOfMain.has(clip.id) || clip.recipeImportance === 'excluded' ||
        clip.recipeEvidence?.footage === 'failed_take' || clip.repeatedTake || clip.durationMs < 350 ||
        clip.endMs > source.metadata.durationMs || main.some(item => item.sourceVideoId === source.id && overlap(clip.startMs, clip.endMs, item.startMs, item.endMs)) ||
        edits.some(edit => edit.sourceId === source.id && overlap(clip.startMs, clip.endMs, edit.startMs, edit.startMs + edit.durationMs))) continue;
    const observed = words([clip.category, ...(clip.actionTags ?? []), ...(clip.objects ?? []),
      ...(clip.recipeEvidence?.ingredients ?? []), ...(clip.recipeEvidence?.techniques ?? [])].join(' '));
    const speechMatches = [...speech].filter(token => observed.has(token));
    const contextMatches = [...context].filter(token => observed.has(token));
    const stage = target.cookingActivity && target.cookingActivity !== 'other' && target.cookingActivity === clip.cookingActivity;
    const a = target.recipeEvidence?.ingredients ?? [], b = clip.recipeEvidence?.ingredients ?? [];
    if (stage && a.length && b.length && !a.some(item => b.some(other => other.toLowerCase() === item.toLowerCase())) && !speechMatches.length) continue;
    if (!speechMatches.length && !stage && contextMatches.length < 2) continue;
    const measurements = scoreAutoCutQuality(clip, { mode: 'cinematic' }).details.filter(item =>
      ['sharpness', 'exposure', 'stability', 'subject'].includes(item.dimension));
    const quality = measurements.length ? measurements.reduce((sum, item) => sum + item.score, 0) / measurements.length : 50;
    const portrait = Boolean(source.metadata.width && source.metadata.height && source.metadata.height > source.metadata.width);
    const score = Math.min(100, Math.round((source.projectId === projectId ? 20 : 0) + (portrait ? 4 : 0) + quality * 0.15 +
      Math.min(40, speechMatches.length * 18) + Math.min(24, contextMatches.length * 8) + (stage ? 27 : 0)));
    if (score < 25) continue;
    const terms = [...new Set([...speechMatches, ...contextMatches])].slice(0, 4);
    const reasons = [speechMatches.length ? 'Matches source narration' : '', stage ? 'Same observed recipe stage' : '',
      terms.length ? 'Shared details: ' + terms.join(', ') : '', source.projectId === projectId ? 'Project footage' : 'Library footage',
      measurements.length ? 'Visual quality considered' : '', portrait ? 'Portrait composition' : ''].filter(Boolean);
    suggestions.push({ clip, source, score, reason: reasons.join(' · '), startMs: Math.max(clip.startMs, Math.min(frames[0] - 200, clip.endMs - 350)) });
  }
  const unique: BRollSuggestion[] = [];
  for (const item of suggestions.sort((a, b) => b.score - a.score || a.clip.startMs - b.clip.startMs)) {
    if (unique.some(other => (equivalent.has(item.clip.id) && equivalent.get(item.clip.id) === equivalent.get(other.clip.id)) ||
      (other.clip.duplicateEvidence?.contentHash && other.clip.duplicateEvidence.contentHash === item.clip.duplicateEvidence?.contentHash &&
        overlap(other.clip.startMs, other.clip.endMs, item.clip.startMs, item.clip.endMs)))) continue;
    unique.push(item);
    if (unique.length === 3) break;
  }
  return unique;
}
