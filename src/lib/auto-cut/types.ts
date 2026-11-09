import { z } from 'zod';

export type AutoCutMode =
  | 'auto_highlight'
  | 'cooking_recipe'
  | 'fast_paced'
  | 'tutorial'
  | 'podcast'
  | 'cinematic'
  | 'custom';

export type DurationPreset = 15 | 30 | 40 | 45 | 60 | 90 | 'custom';

export type EditingIntensity = 'minimal' | 'balanced' | 'aggressive';

export type VideoPacing = 'slow' | 'normal' | 'fast' | 'dynamic';

export type SilenceRemoval = 'disabled' | 'light' | 'moderate' | 'aggressive';

export type SceneSelection = 'visual' | 'speech' | 'balanced' | 'custom';

export type TransitionStyle = 'none' | 'cut' | 'smooth' | 'dynamic';

export type CookingActivity =
  | 'prep'
  | 'chopping'
  | 'mixing'
  | 'spices'
  | 'heating_oil'
  | 'frying'
  | 'simmering'
  | 'plating'
  | 'other';

export const CookingActivityOrder: Record<CookingActivity, number> = {
  prep: 1,
  chopping: 2,
  mixing: 3,
  spices: 4,
  heating_oil: 5,
  frying: 6,
  simmering: 7,
  plating: 8,
  other: 9,
};

export const AutoCutClipCandidateSchema = z.object({
  id: z.string(),
  startMs: z.number().min(0),
  endMs: z.number().min(1),
  durationMs: z.number().min(1),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
  category: z.string(),
  cookingActivity: z.enum([
    'prep',
    'chopping',
    'mixing',
    'spices',
    'heating_oil',
    'frying',
    'simmering',
    'plating',
    'other',
  ]).optional(),
  visualActionScore: z.number().min(0).max(100),
  audioScore: z.number().min(0).max(100),
  selected: z.boolean().default(true),
  thumbnailBase64: z.string().optional(),
  analysisMethod: z.enum(['scene_audio', 'semantic']).optional(),
  transcriptWords: z.array(z.object({ text: z.string().min(1), startMs: z.number().int().min(0), endMs: z.number().int().min(1) })).optional(),
  speedMultiplier: z.number().optional(),
  transitionToNext: z.enum(['none', 'cut', 'smooth', 'dynamic']).optional(),
});

export type AutoCutClipCandidate = z.infer<typeof AutoCutClipCandidateSchema>;

export const AutoCutSettingsSchema = z.object({
  analysisMethod: z.enum(['scene_audio', 'semantic']).default('scene_audio'),
  mode: z.enum([
    'auto_highlight',
    'cooking_recipe',
    'fast_paced',
    'tutorial',
    'podcast',
    'cinematic',
    'custom',
  ]).default('auto_highlight'),
  targetDurationSeconds: z.number().min(5).max(300).default(30),
  intensity: z.enum(['minimal', 'balanced', 'aggressive']).default('balanced'),
  pacing: z.enum(['slow', 'normal', 'fast', 'dynamic']).default('normal'),
  silenceRemoval: z.enum(['disabled', 'light', 'moderate', 'aggressive']).default('moderate'),
  sceneSelection: z.enum(['visual', 'speech', 'balanced', 'custom']).default('balanced'),
  transition: z.enum(['none', 'cut', 'smooth', 'dynamic']).default('cut'),
});

export type AutoCutSettings = z.infer<typeof AutoCutSettingsSchema>;

export interface SceneCut {
  timestampSec: number;
  score: number;
}

export interface AutoCutAnalysisResult {
  mode: AutoCutMode;
  totalSourceDurationMs: number;
  targetDurationMs: number;
  assembledDurationMs: number;
  candidates: AutoCutClipCandidate[];
  cookingDetected: boolean;
  detectedActivities: CookingActivity[];
  speechDetected: boolean;
  sceneCutCount: number;
  silenceCount: number;
}
