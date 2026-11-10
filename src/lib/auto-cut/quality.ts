import { z } from 'zod';
import type { AutoCutClipCandidate, AutoCutSettings } from './types';

export const QUALITY_VERSION = 1;
export const qualityDimensions = ['sharpness', 'exposure', 'stability', 'subject', 'audio', 'relevance',
  'story', 'hook', 'cooking', 'continuity'] as const;
type Dimension = typeof qualityDimensions[number];
export const qualityLabels: Record<Dimension, string> = {
  sharpness: 'Sharpness & focus', exposure: 'Exposure & lighting', stability: 'Motion stability', subject: 'Subject visibility',
  audio: 'Audio clarity', relevance: 'Semantic relevance', story: 'Storytelling', hook: 'Hook potential',
  cooking: 'Cooking-step importance', continuity: 'Continuity & redundancy',
};
export const qualityProfiles = ['Cooking', 'Podcast', 'Tutorial', 'Vlog', 'Cinematic'] as const;
export const qualityPreferences = ['Balanced', 'Storytelling', 'Visual Quality'] as const;
export const QualityConfigSchema = z.object({
  version: z.literal(QUALITY_VERSION), profile: z.enum(qualityProfiles).optional(),
  preference: z.enum(qualityPreferences),
  weights: z.partialRecord(z.enum(qualityDimensions), z.number().min(0).max(100)).optional(),
});
export type QualityConfig = z.infer<typeof QualityConfigSchema>;
export const QualityMeasurementsSchema = z.object({
  version: z.literal(QUALITY_VERSION),
  frames: z.array(z.object({
    timeMs: z.number().int().nonnegative(), edgeDetail: z.number().min(0).max(255),
    luminance: z.number().min(0).max(255), shadows: z.number().min(0).max(1), highlights: z.number().min(0).max(1),
    shift: z.number().min(0).max(5).optional(),
    motionX: z.number().int().min(-3).max(3).optional(), motionY: z.number().int().min(-3).max(3).optional(),
  })).max(3),
  audio: z.object({ rmsDb: z.number().min(-120).max(0), clipped: z.number().min(0).max(1),
    startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }).optional(),
});
export type QualityMeasurements = z.infer<typeof QualityMeasurementsSchema>;
export const SemanticQualitySchema = z.object({
  subject: z.number().min(0).max(100).optional(), relevance: z.number().min(0).max(100).optional(),
  story: z.number().min(0).max(100).optional(), hook: z.number().min(0).max(100).optional(),
  reasons: z.object({ subject: z.string().max(180).optional(), relevance: z.string().max(180).optional(),
    story: z.string().max(180).optional(), hook: z.string().max(180).optional() }).optional(),
});
const profileWeights: Record<typeof qualityProfiles[number], number[]> = {
  Cooking: [6, 8, 5, 10, 7, 12, 14, 6, 24, 8],
  Podcast: [3, 4, 4, 6, 24, 18, 18, 13, 0, 10],
  Tutorial: [6, 8, 6, 12, 14, 18, 17, 5, 0, 14],
  Vlog: [10, 10, 9, 10, 12, 12, 15, 12, 0, 10],
  Cinematic: [15, 15, 16, 13, 6, 7, 11, 9, 0, 8],
};
export const defaultQualityConfig: QualityConfig = { version: QUALITY_VERSION, preference: 'Balanced' };
const technical: Dimension[] = ['sharpness', 'exposure', 'stability', 'subject'];
const narrative: Dimension[] = ['relevance', 'story', 'hook', 'cooking', 'continuity'];
export function qualityWeights(config: QualityConfig, mode: AutoCutSettings['mode']) {
  const profile = config.profile ?? (mode === 'cooking_recipe' ? 'Cooking' : mode === 'podcast' ? 'Podcast' :
    mode === 'tutorial' ? 'Tutorial' : mode === 'cinematic' ? 'Cinematic' : 'Vlog');
  return Object.fromEntries(qualityDimensions.map((dimension, index) => {
    const preferred = config.preference === 'Visual Quality' ? technical : config.preference === 'Storytelling' ? narrative : [];
    const secondary = config.preference === 'Visual Quality' ? narrative : config.preference === 'Storytelling' ? technical : [];
    const multiplier = preferred.includes(dimension) ? 1.8 : secondary.includes(dimension) ? 0.55 : 1;
    return [dimension, config.weights?.[dimension] ?? profileWeights[profile][index] * multiplier];
  })) as Record<Dimension, number>;
}
type Detail = { dimension: Dimension; score: number; provenance: 'Measured proxy' | 'AI estimate' | 'Editorial evidence'; reason: string; timestamps: number[] };
const score100 = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const average = (values: number[]) => values.reduce((sum, item) => sum + item, 0) / values.length;

export function scoreAutoCutQuality(clip: AutoCutClipCandidate, settings: Pick<AutoCutSettings, 'mode' | 'quality'>,
  redundancy?: { score: number; reason: string; measured: boolean }) {
  const weights = qualityWeights(settings.quality ?? defaultQualityConfig, settings.mode);
  const details: Detail[] = [];
  const add = (dimension: Dimension, value: number | undefined, provenance: Detail['provenance'], reason: string, timestamps: number[] = []) => {
    if (value !== undefined && Number.isFinite(value)) details.push({ dimension, score: score100(value), provenance, reason, timestamps });
  };
  const frames = clip.qualityMeasurements?.frames.filter(frame => frame.timeMs >= clip.startMs && frame.timeMs < clip.endMs) ?? [];
  if (frames.length) {
    const times = frames.map(frame => frame.timeMs);
    const detail = average(frames.map(frame => frame.edgeDetail));
    add('sharpness', detail * 12, 'Measured proxy', `Average edge detail ${detail.toFixed(1)}. Low-texture scenes can score low.`, times);
    const luma = average(frames.map(frame => frame.luminance));
    const shadows = average(frames.map(frame => frame.shadows));
    const highlights = average(frames.map(frame => frame.highlights));
    add('exposure', 100 - Math.abs(luma - 126) * 0.52 - Math.max(shadows, highlights) * 66, 'Measured proxy',
      `Mean luma ${Math.round(luma)}/255, ${Math.round(shadows * 100)}% dark pixels and ${Math.round(highlights * 100)}% bright pixels.`, times);
    const motion = frames.filter(frame => frame.shift !== undefined);
    if (motion.length) {
      const shift = average(motion.map(frame => frame.shift!));
      add('stability', 100 - shift * 24, 'Measured proxy', `Estimated frame shift ${shift.toFixed(1)} px at analysis resolution. Intentional movement can score low.`, motion.map(frame => frame.timeMs));
    }
  }
  const audio = clip.qualityMeasurements?.audio;
  if (audio && audio.startMs >= clip.startMs && audio.endMs <= clip.endMs && audio.rmsDb > -75) {
    add('audio', 100 - Math.max(0, -28 - audio.rmsDb) * 2.3 - Math.min(70, audio.clipped * 1200), 'Measured proxy',
      `Level ${audio.rmsDb} dBFS with ${(audio.clipped * 100).toFixed(1)}% clipping. Noise and intelligibility require review.`, [audio.startMs, audio.endMs]);
  }
  const times = (clip.evidenceFrames ?? []).filter(time => time >= clip.startMs && time < clip.endMs);
  const speechTimes = (clip.transcriptWords ?? []).filter(word => word.startMs >= clip.startMs && word.endMs <= clip.endMs).slice(0, 2).map(word => word.startMs);
  if (clip.analysisMethod === 'semantic' && (times.length || speechTimes.length)) {
    const evidence = times.length ? times : speechTimes;
    const reason = clip.reason || 'Estimated from the sampled source evidence.';
    const reasons = clip.semanticQuality?.reasons;
    if (times.length) add('subject', clip.semanticQuality?.subject, 'AI estimate', reasons?.subject || reason, times);
    add('relevance', clip.semanticQuality?.relevance, 'AI estimate', reasons?.relevance || reason, evidence);
    add('story', clip.semanticQuality?.story, 'AI estimate', reasons?.story || reason, evidence);
    add('hook', clip.semanticQuality?.hook ?? (speechTimes.length ? clip.speechHook : undefined), 'AI estimate', reasons?.hook || reason, evidence);
  }
  if (clip.recipeImportance || (times.length && clip.recipeEvidence)) {
    const importance = clip.recipeImportance === 'required' ? 100 : clip.recipeImportance === 'excluded' ? 0 :
      clip.recipeImportance === 'optional' ? 50 : clip.recipeEvidence?.essential ? 95 : 55;
    add('cooking', importance, clip.recipeImportance ? 'Editorial evidence' : 'AI estimate',
      clip.recipeImportance ? `Marked ${clip.recipeImportance} in recipe review.` : 'Recipe analysis classified this step by importance.', times);
  }
  if (!clip.duplicateKeep && redundancy) {
    add('continuity', redundancy.score, redundancy.measured ? 'Measured proxy' : 'Editorial evidence', redundancy.reason, [clip.startMs]);
  } else if (clip.duplicateKeep || (times.length && (clip.repeatedTake || clip.recipeEvidence))) {
    const repeated = clip.repeatedTake || clip.recipeEvidence?.footage === 'repeat';
    add('continuity', clip.duplicateKeep ? 100 : repeated ? 25 : clip.recipeEvidence?.footage === 'step' ? 85 : 50,
      clip.duplicateKeep ? 'Editorial evidence' : 'AI estimate',
      clip.duplicateKeep ? 'Explicitly kept in duplicate review.' : repeated ? 'Possible repeated take in the source evidence.' : 'Based on the observed recipe footage role.', times);
  }
  const totalWeight = details.reduce((sum, item) => sum + weights[item.dimension], 0);
  const total = totalWeight ? score100(details.reduce((sum, item) => sum + item.score * weights[item.dimension], 0) / totalWeight) : undefined;
  return { total, details, version: QUALITY_VERSION, weights };
}
