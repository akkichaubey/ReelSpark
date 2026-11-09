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

export const CookingActivitySchema = z.enum([
  'prep', 'washing', 'peeling', 'chopping', 'mixing', 'marinating', 'heating', 'heating_oil',
  'frying', 'boiling', 'simmering', 'baking', 'seasoning', 'spices', 'garnishing', 'plating', 'presentation', 'other',
]);
export type CookingActivity = z.infer<typeof CookingActivitySchema>;
export const RecipeStyleSchema = z.enum(['recipe', 'cinematic', 'quick_tip', 'step_by_step']);
export type RecipeStyle = z.infer<typeof RecipeStyleSchema>;
export const RecipeEvidenceSchema = z.object({
  ingredients: z.array(z.string().min(1).max(80)).max(12),
  utensils: z.array(z.string().min(1).max(80)).max(12),
  techniques: z.array(z.string().min(1).max(80)).max(12),
  footage: z.enum(['step', 'repeat', 'failed_take', 'waiting', 'aesthetic']),
  essential: z.boolean(),
});

export const CookingActivityOrder: Record<CookingActivity, number> = {
  prep: 1,
  washing: 1,
  peeling: 2,
  chopping: 2,
  mixing: 3,
  marinating: 4,
  spices: 4,
  seasoning: 7,
  heating: 5,
  heating_oil: 5,
  frying: 6,
  boiling: 6,
  baking: 6,
  simmering: 7,
  plating: 8,
  garnishing: 8,
  presentation: 9,
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
  cookingActivity: CookingActivitySchema.optional(),
  sourceVideoId: z.string().optional(),
  recipeImportance: z.enum(['required', 'optional', 'excluded']).optional(),
  recipeOrder: z.number().int().nonnegative().optional(),
  recipeLabelEdited: z.boolean().optional(),
  recipeEvidence: RecipeEvidenceSchema.optional(),
  visualActionScore: z.number().min(0).max(100),
  audioScore: z.number().min(0).max(100),
  selected: z.boolean().default(true),
  thumbnailBase64: z.string().optional(),
  analysisMethod: z.enum(['scene_audio', 'semantic']).optional(),
  evidenceFrames: z.array(z.number().int().nonnegative()).optional(),
  actionTags: z.array(z.string().min(1).max(80)).max(12).optional(),
  objects: z.array(z.string().min(1).max(80)).max(12).optional(),
  visionProvider: z.string().optional(),
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
  recipeStyle: RecipeStyleSchema.optional(),
});

export type AutoCutSettings = z.infer<typeof AutoCutSettingsSchema>;

export interface SceneCut {
  timestampSec: number;
  score: number;
  kind?: 'hard_cut' | 'fade' | 'dissolve' | 'black';
}

export const AutoCutSceneSchema = z.object({
  sourceVideoId: z.string().min(1),
  sceneId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  shotType: z.enum(['continuous', 'hard_cut', 'fade', 'dissolve', 'black', 'manual']),
  actionTags: z.array(z.string()),
  objects: z.array(z.string()).default([]),
  motionDetected: z.boolean().default(false),
  semanticActions: z.array(z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    label: z.string().min(1),
    confidence: z.number().min(0).max(100),
  })).default([]),
  description: z.string(),
  evidenceFrames: z.array(z.number().int().nonnegative()),
  confidence: z.number().min(0).max(100),
  provenance: z.enum(['ffmpeg', 'hybrid', 'manual']),
  visionProviders: z.array(z.string()).default([]),
  excluded: z.boolean().default(false),
  locked: z.boolean().default(false),
  thumbnail: z.string().optional(),
});
export type AutoCutScene = z.infer<typeof AutoCutSceneSchema>;

export function validateAutoCutScenes(input: unknown, sourceVideoId: string, durationMs: number) {
  const scenes = AutoCutSceneSchema.array().parse(input);
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const scene of scenes) {
    if (scene.sourceVideoId !== sourceVideoId || ids.has(scene.sceneId) || scene.startMs < previousEnd ||
      scene.startMs >= scene.endMs || scene.endMs > durationMs ||
      scene.evidenceFrames.some(frame => frame < scene.startMs || frame >= scene.endMs) ||
      scene.semanticActions.some((action, index) => action.startMs < scene.startMs || action.endMs > scene.endMs ||
        action.startMs >= action.endMs || (index > 0 && action.startMs < scene.semanticActions[index - 1].endMs))) {
      throw new Error('Invalid scene IDs or source boundaries.');
    }
    ids.add(scene.sceneId);
    previousEnd = scene.endMs;
  }
  return scenes;
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
