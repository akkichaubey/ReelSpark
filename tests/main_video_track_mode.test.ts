import assert from 'node:assert/strict';
import {
  commitTimeline,
  createTimelineTrack,
  createTimelineClip,
  timelineFromProject,
  projectTimelineAssets,
  synchronizeTimelineSources,
  type ReelTimeline,
  type TimelineAsset,
} from '../src/lib/timeline/model';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import type { CaptionProject, AudioAsset, ImageAsset } from '../src/lib/caption-maker/types';

function createFixtureProject(): CaptionProject {
  const project = createEmptyCaptionProject('test_main_video_mode');
  const sourceVideo: ImageAsset = {
    id: 'orig_video_asset',
    fileName: 'interview.mp4',
    fileUrl: '/api/files/test/interview.mp4',
    duration: 30,
    fileSize: 5_000_000,
    format: 'MP4',
    width: 1080,
    height: 1920,
    mediaType: 'video',
    fitMode: 'cover',
  };
  const audio: AudioAsset = {
    id: 'orig_voice_asset',
    fileName: 'interview.mp4 (Audio)',
    fileUrl: '/api/files/test/voice.mp3',
    duration: 30,
    fileSize: 500_000,
    format: 'MP3',
    sourceType: 'video',
    sourceVideo,
    originalVideoFileName: 'interview.mp4',
  };

  project.audio = audio;
  project.image = sourceVideo;
  project.mediaAssets = [sourceVideo];
  project.transcript = [
    { id: 'w1', text: 'Viral', start: 0.5, end: 1.0, timingSource: 'model-word-level' },
    { id: 'w2', text: 'Reels', start: 1.2, end: 2.0, timingSource: 'model-word-level' },
  ];
  project.captionGroups = [
    { id: 'g1', start: 0.5, end: 2.0, text: 'Viral Reels', words: project.transcript },
  ];

  return project;
}

async function testMainVideoTrackMode() {
  console.log('Testing Main Video Track: Video + Audio and Audio Only mode switches...');

  const project = createFixtureProject();
  project.timeline = commitTimeline(timelineFromProject(project));
  const timeline = project.timeline;

  // 1. Verify default track creation
  const videoTrack = timeline.tracks.find((t) => t.kind === 'video');
  const audioTrack = timeline.tracks.find((t) => t.kind === 'audio');
  assert.ok(videoTrack, 'Main video track must exist');
  assert.ok(audioTrack, 'Main audio / voice track must exist');
  assert.equal(videoTrack.mainVideoMode, 'video_and_audio', 'Default mode is video_and_audio');

  const assets = projectTimelineAssets(project);
  assert.ok(
    assets.some((a) => a.id === 'orig_video_asset'),
    'projectTimelineAssets must include original video',
  );
  assert.ok(
    assets.some((a) => a.id === 'orig_voice_asset'),
    'projectTimelineAssets must include voice audio',
  );

  // 2. Simulate switching to Audio Only
  const customBgImage: ImageAsset = {
    id: 'custom_bg_img',
    fileName: 'mountains.jpg',
    fileUrl: '/api/files/test/mountains.jpg',
    duration: 30,
    fileSize: 200_000,
    format: 'JPG',
    width: 1080,
    height: 1920,
    mediaType: 'image',
    fitMode: 'cover',
  };

  // Switch project to custom background while in Audio Only
  const audioOnlyProject: CaptionProject = {
    ...project,
    image: customBgImage,
    mediaAssets: [...(project.mediaAssets || []), customBgImage],
    timeline: {
      ...timeline,
      tracks: timeline.tracks.map((t) =>
        t.kind === 'video' ? { ...t, mainVideoMode: 'audio_only' } : t,
      ),
      clips: timeline.clips.map((c) =>
        c.trackId === videoTrack.id
          ? {
              ...c,
              assetId: customBgImage.id,
              name: customBgImage.fileName,
              loop: true,
            }
          : c,
      ),
    },
  };

  const syncedAudioOnly = synchronizeTimelineSources(project, audioOnlyProject);

  // Verify voice audio clip remains intact and synchronized
  const voiceClip = syncedAudioOnly.timeline?.clips.find(
    (c) => c.trackId === audioTrack.id && c.assetId === 'orig_voice_asset',
  );
  assert.ok(voiceClip, 'Original voice audio clip must remain in timeline and synchronized');
  assert.equal(voiceClip.startMs, 0, 'Original audio startMs must be unchanged');
  assert.equal(voiceClip.durationMs, 30000, 'Original audio duration must be unchanged');

  // Verify video track clip now displays custom background image
  const visualClip = syncedAudioOnly.timeline?.clips.find((c) => c.trackId === videoTrack.id);
  assert.ok(visualClip, 'Visual clip on video track must exist');
  assert.equal(visualClip.assetId, 'custom_bg_img', 'Visual clip now uses custom background image');
  assert.equal(visualClip.loop, true, 'Image background clip must loop');

  // Verify original video asset is still retained in timeline assets (for easy restoring)
  const allAssetsAfterAudioOnly = projectTimelineAssets(syncedAudioOnly);
  assert.ok(
    allAssetsAfterAudioOnly.some((a) => a.id === 'orig_video_asset'),
    'Original video asset must still be available in assets even during Audio Only',
  );

  // 3. Simulate uploading a different video as the background
  const customBgVideo: ImageAsset = {
    id: 'custom_bg_video',
    fileName: 'ambient_nature.mp4',
    fileUrl: '/api/files/test/ambient_nature.mp4',
    duration: 30,
    fileSize: 4_000_000,
    format: 'MP4',
    width: 1080,
    height: 1920,
    mediaType: 'video',
    fitMode: 'cover',
    muteSourceAudio: true,
  };

  const videoBgProject: CaptionProject = {
    ...syncedAudioOnly,
    image: customBgVideo,
    mediaAssets: [...(syncedAudioOnly.mediaAssets || []), customBgVideo],
  };

  const syncedVideoBg = synchronizeTimelineSources(syncedAudioOnly, videoBgProject);
  const videoBgVisualClip = syncedVideoBg.timeline?.clips.find((c) => c.trackId === videoTrack.id);
  assert.ok(videoBgVisualClip, 'Visual clip must exist for custom background video');
  assert.equal(videoBgVisualClip.assetId, 'custom_bg_video', 'Visual clip now uses custom video');
  assert.equal(videoBgVisualClip.muted, true, 'Custom background video must be muted so voice plays');

  // Original audio is still synchronized
  const voiceClipStillSynced = syncedVideoBg.timeline?.clips.find(
    (c) => c.trackId === audioTrack.id && c.assetId === 'orig_voice_asset',
  );
  assert.ok(voiceClipStillSynced, 'Voice audio is still preserved and synchronized');

  // 4. Simulate switching BACK to Video + Audio
  const restoredProject: CaptionProject = {
    ...syncedVideoBg,
    image: project.audio!.sourceVideo!,
    timeline: {
      ...syncedVideoBg.timeline!,
      tracks: syncedVideoBg.timeline!.tracks.map((t) =>
        t.kind === 'video' ? { ...t, mainVideoMode: 'video_and_audio' } : t,
      ),
      clips: syncedVideoBg.timeline!.clips.map((c) =>
        c.trackId === videoTrack.id
          ? {
              ...c,
              assetId: 'orig_video_asset',
              name: 'interview.mp4',
              loop: false,
              muted: false,
            }
          : c,
      ),
    },
  };

  const syncedRestored = synchronizeTimelineSources(syncedVideoBg, restoredProject);
  const restoredVisualClip = syncedRestored.timeline?.clips.find((c) => c.trackId === videoTrack.id);
  assert.ok(restoredVisualClip, 'Restored visual clip must exist');
  assert.equal(restoredVisualClip.assetId, 'orig_video_asset', 'Restored back to original video visuals');
  assert.equal(restoredVisualClip.muted, false, 'Restored video is unmuted');

  // Verify no audio or transcript edits were lost
  assert.equal(syncedRestored.transcript.length, 2, 'Transcript words preserved');
  assert.equal(syncedRestored.captionGroups.length, 1, 'Caption groups preserved');
  const restoredVoiceClip = syncedRestored.timeline?.clips.find(
    (c) => c.trackId === audioTrack.id && c.assetId === 'orig_voice_asset',
  );
  assert.ok(restoredVoiceClip, 'Voice audio clip is intact');
  assert.equal(restoredVoiceClip.durationMs, 30000, 'Original audio duration preserved');

  console.log('✓ Main Video Track Video + Audio & Audio Only modes test passed successfully');
}

testMainVideoTrackMode().catch((err) => {
  console.error(err);
  process.exit(1);
});
