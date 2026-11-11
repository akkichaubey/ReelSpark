import type { MediaAsset } from '../clipping-studio/contracts';
import { validateTimeline } from '../timeline/model';
import { createAutoCutReel } from './reel-bridge';
import { peakForRatio, STORY_FPS, type planStory } from './story-ramp';
import { PLATFORM_BLEND_FRAMES, platformOutput, type AutoCutPlatform } from './platform-presets';

export type PreparedRamp = { id: string; url: string; durationMs: number };

export function createStoryReel(asset: MediaAsset, plan: ReturnType<typeof planStory>, ramps: PreparedRamp[], title: string, showCaptions: boolean,
  platform?: { platform: AutoCutPlatform; targetSeconds: number; blends: Set<string> }) {
  if (plan.overlaps) throw new Error('Resolve overlapping story ranges before previewing.');
  const selected = plan.rows.filter(row => row.included);
  const project = createAutoCutReel(asset, selected.map(row => ({ ...row.clip, selected: true,
    sourceVideoId: asset.id, speedMultiplier: 1, transitionToNext: 'cut' })), title, undefined, undefined, undefined, showCaptions);
  const timeline = project.timeline!;
  timeline.fps = STORY_FPS;
  project.outputSettings.fps = STORY_FPS;
  if (platform) {
    project.outputSettings = platformOutput(platform.platform);
    timeline.autoCutPlatform = { platform: platform.platform, targetSeconds: platform.targetSeconds };
  }
  const video = timeline.clips.filter(clip => clip.trackId === 'video');
  const byId = new Map(ramps.map(ramp => [ramp.id, ramp]));
  const removed = new Set<string>();
  let frame = 0;
  for (const [index, row] of selected.entries()) {
    const clip = video[index];
    if (!clip) throw new Error('The story draft requires a video track.');
    const blend = platform?.blends.has(row.key);
    const previousEndMs = Math.round(frame * 1000 / STORY_FPS);
    if (blend) frame -= PLATFORM_BLEND_FRAMES;
    const startMs = Math.round(frame * 1000 / STORY_FPS);
    frame += row.outputFrames;
    const durationMs = Math.round(frame * 1000 / STORY_FPS) - startMs;
    for (const linked of timeline.clips.filter(item => item.linkId === clip.linkId)) {
      linked.startMs = startMs;
      linked.durationMs = durationMs;
    }
    if (blend) {
      clip.transitionIn = 'crossfade';
      clip.fadeInMs = previousEndMs - startMs;
      clip.naturalTransition = { kind: 'crossfade', reason: 'Silent, low-motion shots fit a dissolve inside the platform frame budget.' };
    }
    if (row.outputFrames === row.frames) continue;
    const prepared = byId.get(row.clip.id);
    if (!prepared || !prepared.url.startsWith('/api/files/caption-maker/trimmed/')) throw new Error('A prepared speed ramp is missing.');
    const sourceAssetId = clip.assetId!;
    const id = 'story_ramp_' + index;
    timeline.assets.push({ id, fileUrl: prepared.url, fileName: 'Speed ramp · ' + asset.filename, mediaType: 'video',
      durationMs: prepared.durationMs, width: asset.metadata.width, height: asset.metadata.height, hasAudio: false });
    for (const linked of timeline.clips) if (linked.linkId === clip.linkId && linked.id !== clip.id) removed.add(linked.id);
    clip.assetId = id;
    clip.sourceStartMs = 0;
    clip.autoCutRamp = { sourceAssetId, sourceStartMs: row.clip.startMs, sourceEndMs: row.clip.endMs,
      cap: row.cap,
      peak: peakForRatio(row.outputFrames / STORY_FPS / ((row.clip.endMs - row.clip.startMs) / 1000), row.cap), outputFrames: row.outputFrames };
  }
  timeline.clips = timeline.clips.filter(clip => !removed.has(clip.id));
  const errors = validateTimeline(timeline);
  if (errors.length) throw new Error(errors[0]);
  return project;
}
