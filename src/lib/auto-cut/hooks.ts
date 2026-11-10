import { z } from 'zod';
import { buildSpeechMoments } from './speech';
import { AutoCutClipCandidateSchema, type AutoCutClipCandidate } from './types';

export const hookStyles = ['Visual Reveal', 'Question', 'Problem/Solution', 'Quick Tip', 'Before/After', 'Recipe Result', 'Cinematic Teaser'] as const;

export const HookSchema = z.object({
  style: z.enum(hookStyles),
  clip: AutoCutClipCandidateSchema,
  bounds: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
  audio: z.enum(['source', 'voice', 'visual']),
  text: z.string().max(80),
  replay: z.boolean(),
});
export type AutoCutHook = z.infer<typeof HookSchema>;

export function trimHook(hook: AutoCutHook, startMs: number, endMs: number): AutoCutHook {
  const source = hook.clip;
  if (![startMs, endMs].every(Number.isSafeInteger) || startMs < hook.bounds[0] || endMs > hook.bounds[1] ||
      endMs - startMs < 250 || endMs - startMs > 5000) {
    throw new Error('Choose 0.25–5 seconds inside the suggested source range.');
  }
  const words = source.transcriptWords ?? [];
  if (hook.audio !== 'visual' && words.some(word => [startMs, endMs].some(time => word.startMs < time && time < word.endMs))) {
    throw new Error('Move the boundary outside the timed speech, or choose Visual only.');
  }
  if (hook.audio === 'voice' && !buildSpeechMoments([{ ...source, startMs: hook.bounds[0], endMs: hook.bounds[1] }]).some(moment =>
    moment.complete && moment.startMs >= startMs && moment.endMs <= endMs)) {
    throw new Error('A voice hook needs a complete timed phrase in this range.');
  }
  const resultMs = source.hookEvidence?.resultMs;
  const removesResult = hook.style === 'Recipe Result' && hook.text === 'Final dish' &&
    (resultMs === undefined || resultMs < startMs || resultMs >= endMs);
  const removesQuote = hook.text === words.map(word => word.text).join(' ') &&
    words.some(word => word.startMs < startMs || word.endMs > endMs);
  return { ...hook, text: removesResult || removesQuote ? '' : hook.text,
    clip: { ...source, startMs, endMs, durationMs: endMs - startMs } };
}

export function suggestHooks(candidates: AutoCutClipCandidate[], durationMs: number, cooking: boolean): AutoCutHook[] {
  const complete = buildSpeechMoments(candidates).filter(moment => moment.complete && !moment.repeat);
  const visual = candidates.filter(clip => clip.recipeImportance !== 'excluded' && clip.durationMs >= 250 &&
    (clip.visualActionScore > 0 || clip.evidenceFrames?.length));
  const options: { hook: AutoCutHook; rank: number }[] = [];
  for (const clip of visual) {
    const frames = (clip.evidenceFrames ?? []).filter(time => time >= clip.startMs && time < clip.endMs).sort((a, b) => a - b);
    const semantic = Boolean(frames.length && clip.visionProvider);
    const resultMs = clip.hookEvidence?.resultMs;
    const pair = clip.hookEvidence?.beforeAfterMs;
    const result = cooking && semantic && clip.confidence >= 65 && clip.cookingActivity === 'presentation' &&
      resultMs !== undefined && frames.includes(resultMs);
    const beforeAfter = semantic && pair && frames.includes(pair[0]) && frames.includes(pair[1]) &&
      pair[0] < pair[1] && pair[1] - pair[0] < durationMs;
    const style = result ? 'Recipe Result' : beforeAfter ? 'Before/After' :
      clip.visualActionScore >= 60 ? 'Visual Reveal' : 'Cinematic Teaser';
    const anchor = result ? resultMs : frames[Math.floor(frames.length / 2)];
    const length = Math.min(durationMs, clip.endMs - clip.startMs);
    const start = !result && beforeAfter ? Math.min(pair[0], clip.endMs - length) :
      Math.max(clip.startMs, Math.min(clip.endMs - length, (anchor ?? clip.startMs) - Math.floor(length / 2)));
    const hook: AutoCutHook = { style, clip: { ...clip, reason: result ? 'The visual analysis identified a plated result in this source range.' :
      beforeAfter ? 'Both before and after were identified in sampled frames inside this range.' :
      'Ranked using visible action and scene evidence from this source range.' },
      bounds: [clip.startMs, clip.endMs], audio: clip.transcriptWords?.length ? 'visual' : 'source', text: result ? 'Final dish' : '', replay: false };
    options.push({ hook: trimHook(hook, start, start + length), rank: clip.visualActionScore + clip.score / 4 + (result ? 100 : 0) });
  }
  for (const [index, moment] of complete.entries()) {
    if (moment.endMs - moment.startMs > durationMs || moment.endMs - moment.startMs < 250 ||
        moment.context.recipeImportance === 'excluded') continue;
    const question = moment.kind === 'question';
    const next = complete[index + 1];
    const solution = question && next && next.sourceVideoId === moment.sourceVideoId && next.kind === 'explanation' &&
      next.startMs >= moment.endMs && next.startMs - moment.endMs <= 500 && next.endMs - moment.startMs <= durationMs ? next : undefined;
    const style = solution ? 'Problem/Solution' : question ? 'Question' : moment.kind === 'tip' ? 'Quick Tip' : 'Cinematic Teaser';
    const words = solution ? [...moment.words, ...solution.words] : moment.words;
    const quote = words.map(word => word.text).join(' ');
    const endMs = solution?.endMs ?? moment.endMs;
    const clip = { ...moment.context, id: moment.id, startMs: moment.startMs, endMs,
      durationMs: endMs - moment.startMs, transcriptWords: words,
      reason: solution ? 'The source question and its following explanation both fit in this hook.' : 'A complete phrase from the source transcript.' };
    options.push({ hook: { style, clip, bounds: [clip.startMs, clip.endMs], audio: 'voice',
      text: moment.timing === 'provider_segment' && (!solution || solution.timing === 'provider_segment') && quote.length <= 80 ? quote : '',
      replay: false }, rank: moment.score + 25 });
  }
  const chosen: AutoCutHook[] = [];
  for (const { hook } of options.sort((a, b) => b.rank - a.rank)) {
    const clip = hook.clip;
    if (chosen.some(other => other.clip.sourceVideoId === clip.sourceVideoId &&
      other.clip.startMs < clip.endMs && clip.startMs < other.clip.endMs)) continue;
    chosen.push(hook);
    if (chosen.length === 5) break;
  }
  return chosen;
}

export function prependHook(sequence: AutoCutClipCandidate[], hook: AutoCutHook): AutoCutClipCandidate[] {
  const { clip } = trimHook(hook, hook.clip.startMs, hook.clip.endMs);
  const body = sequence.filter(item => item.selected).flatMap(item => {
    if (hook.replay || item.sourceVideoId !== clip.sourceVideoId || item.startMs >= clip.endMs || item.endMs <= clip.startMs) return [item];
    if (item.locked || item.speechProtected || item.recipeImportance === 'required' || item.transcriptWords?.some(word =>
      word.endMs > clip.startMs && word.startMs < clip.endMs)) {
      if (!item.locked && item.startMs === clip.startMs && item.endMs === clip.endMs && hook.audio !== 'visual') return [];
      throw new Error('This hook overlaps a locked clip, protected speech, or a required recipe step. Choose another hook or allow intentional replay.');
    }
    return [[item.startMs, Math.min(item.endMs, clip.startMs)], [Math.max(item.startMs, clip.endMs), item.endMs]]
      .filter(([startMs, endMs]) => endMs - startMs >= 100)
      .map(([startMs, endMs]) => ({ ...item, startMs, endMs, durationMs: endMs - startMs }));
  });
  return [{ ...clip, id: 'opening-hook', selected: true, transitionToNext: 'cut' }, ...body];
}
