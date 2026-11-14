import assert from 'node:assert/strict';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { timelineFromProject, createTimelineTrack } from '../src/lib/timeline/model';

function testCleanTimelineReset() {
  console.log('Testing clean timeline initialization and reset...');

  // 1. A fresh empty project has exactly 1 track (Main video)
  const emptyProject = createEmptyCaptionProject();
  const emptyTimeline = timelineFromProject(emptyProject);
  assert.equal(emptyTimeline.tracks.length, 1, 'Empty timeline must only have 1 track (Main video)');
  assert.equal(emptyTimeline.tracks[0].kind, 'video');
  assert.equal(emptyTimeline.tracks[0].name, 'Main video');
  assert.equal(emptyTimeline.clips.length, 0, 'Empty timeline must have 0 clips');
  assert.equal(emptyTimeline.assets.length, 0, 'Empty timeline must have 0 assets');

  // 2. Adding audio adds voice track
  const audioProject = {
    ...emptyProject,
    audio: {
      id: 'voice_1',
      fileUrl: '/api/files/voice.wav',
      fileName: 'voice.wav',
      duration: 10,
      fileSize: 1024,
      format: 'wav',
    },
  };
  const audioTimeline = timelineFromProject(audioProject);
  assert.equal(audioTimeline.tracks.length, 2, 'Project with audio must have video and audio tracks');
  assert.equal(audioTimeline.tracks[0].kind, 'video');
  assert.equal(audioTimeline.tracks[1].kind, 'audio');

  // 3. Adding transcript/captions adds captions track
  const captionProject = {
    ...audioProject,
    transcript: [{ id: 'w1', text: 'Hello', start: 0, end: 1 }],
    captionGroups: [{ id: 'g1', text: 'Hello', start: 0, end: 1, words: [] }],
  };
  const captionTimeline = timelineFromProject(captionProject);
  assert.equal(captionTimeline.tracks.length, 3, 'Project with audio and captions must have 3 tracks');
  assert.equal(captionTimeline.tracks[2].kind, 'captions');

  // 4. Adding background music adds music track
  const musicProject = {
    ...captionProject,
    bgMusic: {
      id: 'bgm_1',
      title: 'Lofi Beat',
      fileUrl: '/bgm/lofi.mp3',
      volume: 0.5,
    },
  };
  const musicTimeline = timelineFromProject(musicProject);
  assert.equal(musicTimeline.tracks.length, 4, 'Project with audio, captions, and music must have 4 tracks');
  assert.equal(musicTimeline.tracks[3].kind, 'music');

  // 5. Explicit reset structure has clean single track and zero clips
  const resetProject = createEmptyCaptionProject();
  resetProject.timeline = {
    version: 1,
    enabled: false,
    fps: 30,
    tracks: [{ ...createTimelineTrack('video', 'Main video'), id: 'track_video' }],
    clips: [],
    assets: [],
    markers: [],
    captionSources: {},
  };
  const resetTimeline = timelineFromProject(resetProject);
  assert.equal(resetTimeline.tracks.length, 1, 'Reset timeline must have exactly 1 track');
  assert.equal(resetTimeline.tracks[0].name, 'Main video');
  assert.equal(resetTimeline.clips.length, 0, 'Reset timeline must have 0 clips');
  assert.equal(resetTimeline.assets.length, 0, 'Reset timeline must have 0 assets');

  console.log('✓ Clean timeline reset test passed successfully');
}

testCleanTimelineReset();
