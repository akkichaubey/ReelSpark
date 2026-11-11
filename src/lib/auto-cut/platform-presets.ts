import { z } from 'zod';
import type { OutputSettings } from '../caption-maker/types';
import type { AutoCutClipCandidate, AutoCutSettings } from './types';
import { planStory, STORY_FPS, type StoryOverride } from './story-ramp';

export const platforms = {
  'instagram-reel': { label: 'Instagram Reels', durations: [60], maximum: 60 },
  'youtube-short': { label: 'YouTube Shorts', durations: [60, 90, 120, 150], maximum: 150 },
  'facebook-reel': { label: 'Facebook Reels / Video', durations: [60, 120, 180, 240, 300], maximum: 300 },
} as const;
export const PlatformSchema = z.enum(['instagram-reel', 'youtube-short', 'facebook-reel']);
export type AutoCutPlatform = z.infer<typeof PlatformSchema>;

export function validPlatformDuration(platform: AutoCutPlatform, seconds: number) {
  return Number.isInteger(seconds) && seconds >= 60 && seconds <= platforms[platform].maximum;
}
export const PlatformVersionSchema = z.object({
  platform: PlatformSchema, targetSeconds: z.number().int(), reelId: z.string().min(1),
  outputFrames: z.number().int().positive(), clipCount: z.number().int().positive(),
}).refine(value => validPlatformDuration(value.platform, value.targetSeconds));
export const PlatformDraftSchema = z.object({
  platform: PlatformSchema.nullable(),
  durations: z.partialRecord(PlatformSchema, z.number().int()),
  versions: PlatformVersionSchema.array(),
});

export function platformOutput(platform: AutoCutPlatform): OutputSettings {
  return { preset: platform, width: 1080, height: 1920, aspectRatio: '9:16', fps: STORY_FPS,
    quality: 'standard', resolution: '1080p', codec: 'h264', audioBitrate: '192k' };
}

export function sourceAnalysisSettings(settings: AutoCutSettings) {
  const { analysisMethod, mode, intensity, pacing, sceneSelection, silenceRemoval, preserveStory, storyGenre } = settings;
  return { analysisMethod, mode, intensity, pacing, sceneSelection, silenceRemoval, preserveStory, storyGenre };
}

export const PLATFORM_BLEND_FRAMES = 6;

export function planPlatformStory(clips: AutoCutClipCandidate[], seconds: number, hasAudio: boolean,
  overrides: Record<string, StoryOverride>, duplicates: Set<string>, cinematic: boolean) {
  const plan = (duration: number) => planStory(clips, duration, hasAudio, overrides, duplicates);
  const base = plan(seconds);
  const none = { ...base, blends: new Set<string>() };
  if (!cinematic || hasAudio || base.outputFrames !== base.targetFrames || base.overlaps) return none;
  const findBlends = (draft: typeof base) => {
    const rows = draft.rows.filter(row => row.included);
    return new Set(rows.slice(1).flatMap((incoming, index) => {
      const outgoing = rows[index];
      const safe = [incoming, outgoing].every(row => row.outputFrames >= 4 * PLATFORM_BLEND_FRAMES &&
        !row.clip.locked && !row.clip.transitionBlack?.length && (row.clip.visualActionScore < 45));
      return safe && (incoming.clip.transitionShot === 'fade' || incoming.clip.transitionShot === 'dissolve' ||
        (incoming.clip.category !== outgoing.clip.category &&
          incoming.clip.analysisMethod === 'semantic' && outgoing.clip.analysisMethod === 'semantic')) ? [incoming.key] : [];
    }).slice(0, 8));
  };
  const first = findBlends(base);
  if (!first.size) return none;
  const extended = plan((base.targetFrames + first.size * PLATFORM_BLEND_FRAMES) / STORY_FPS);
  const blends = findBlends(extended);
  if (extended.overlaps || extended.outputFrames - blends.size * PLATFORM_BLEND_FRAMES !== base.targetFrames) return none;
  return { ...extended, targetFrames: base.targetFrames, outputFrames: base.targetFrames, blends };
}

