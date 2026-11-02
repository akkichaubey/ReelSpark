import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { timelineFromProject, compileTimeline } from '../src/lib/timeline/model';
import { captionClipGroups, editCaptionWord, updateCaptionSource } from '../src/lib/timeline/caption-edits';
import { TimelineCaptionWords } from '../src/components/caption-maker/TimelineCaptionWords';
import { importProjectFromJson, exportProjectAsJson } from '../src/lib/caption-maker/project-storage';

const project = createEmptyCaptionProject();
project.audio = { id: 'voice', fileUrl: '/api/files/voice.wav', fileName: 'voice.wav', duration: 4, fileSize: 1, format: 'wav' };
project.transcript = [{ id: 'w1', text: 'नमस्ते', start: 0.5, end: 1, isImportant: true }, { id: 'w2', text: 'world', start: 2, end: 2.6 }];
project.transcript[0].timingSource = 'model-word-level';
project.captionGroups = [{ id: 'g1', start: 0.5, end: 2.6, text: 'नमस्ते world', words: project.transcript }];
project.timeline = { ...timelineFromProject(project), enabled: true };
const snapshot = JSON.stringify(project), bounds = { start: 0, end: 4 };
const track = project.timeline.tracks.find(t => t.kind === 'captions')!;
const clip = project.timeline.clips.find(c => c.trackId === track.id)!;
let groups = editCaptionWord(project.captionGroups, 'w1', { text: 'Hello' }, bounds, 25);
assert.equal(groups[0].words[0].start, 0.5); assert.equal(groups[0].words[0].isImportant, true);
assert.equal(groups[0].words[0].timingSource, 'model-word-level');
assert.equal(groups[0].text, 'Hello world');
let updated = updateCaptionSource(project, 'voice', groups);
assert.equal(updated.transcript[0].text, 'Hello');
assert.equal(compileTimeline(updated).transcript[0].text, 'Hello', 'Renderer uses the edited source');
groups = editCaptionWord(groups, 'w1', { end: 2.8 }, bounds, 25);
assert.equal(groups[0].words[0].end, 2, 'End clamps to the next word');
assert.equal(groups[0].words[0].timingSource, 'phrase-estimated', 'Manual boundaries must not claim unchanged recognizer timing');
groups = editCaptionWord(groups, 'w2', { start: -5 }, bounds, 25);
assert.equal(groups[0].words[1].start, 2, 'Start clamps to previous word end');
groups = editCaptionWord(project.captionGroups, 'w1', { start: -1 }, { start: 0.6, end: 4 }, 25);
assert.equal(groups[0].words[0].start, 0.6); assert.equal(groups[0].start, 0.6);
assert.throws(() => editCaptionWord(groups, 'w1', { text: ' ' }, bounds, 25), /Enter caption/);
assert.throws(() => editCaptionWord(groups, 'w1', { end: NaN }, bounds, 25), /boundary/);
assert.throws(() => editCaptionWord(groups, 'missing', { text: 'Hello' }, bounds, 25), /no longer/);
const locked = { ...project, timeline: { ...project.timeline, tracks: project.timeline.tracks.map(t => t.id === track.id ? { ...t, locked: true } : t) } };
assert.throws(() => updateCaptionSource(locked, 'voice', groups), /Unlock/);
const archive = { ...project, timeline: { ...project.timeline, assets: [...project.timeline.assets, { ...project.timeline.assets.find(a => a.id === 'voice')!, id: 'old_voice' }],
  clips: project.timeline.clips.map(c => c.id === clip.id ? { ...c, assetId: 'old_voice', startMs: 5000 } : c),
  captionSources: { ...project.timeline.captionSources, old_voice: { transcript: project.transcript, captionGroups: project.captionGroups } } } };
updated = updateCaptionSource(archive, 'old_voice', editCaptionWord(project.captionGroups, 'w2', { text: 'earth' }, bounds, 25));
assert.equal(updated.transcript[1].text, 'world', 'Archived source edits do not overwrite the current source');
assert.equal(compileTimeline(updated).transcript[1].text, 'earth');
assert.equal(compileTimeline(updated).transcript[0].start, 5.5, 'Source times map correctly after moving clips');
const imported = importProjectFromJson(exportProjectAsJson(updated));
assert.equal(imported.success, true); assert.equal(compileTimeline(imported.project!).transcript[1].text, 'earth');
assert.deepEqual(captionClipGroups(project, project.timeline, clip), project.captionGroups);
assert.equal(JSON.stringify(project), snapshot, 'Source data stays immutable');
function markup(time: number) {
  return renderToStaticMarkup(React.createElement(TimelineCaptionWords, { clip, groups: project.captionGroups, pixelsPerMs: 0.04, currentMs: time, fps: 25, disabled: false, onChange() {}, onSeek() {}, onError() {} }));
}
assert.equal((markup(750).match(/aria-current="true"/g) || []).length, 1);
assert.equal((markup(1500).match(/aria-current="true"/g) || []).length, 0, 'No spoken-word highlight during silence');
assert.equal((markup(1000).match(/aria-current="true"/g) || []).length, 0, 'End boundary is exclusive');
assert.equal((markup(750).match(/role="slider"/g) || []).length, 4);
const virtual = renderToStaticMarkup(React.createElement(TimelineCaptionWords, { clip, groups: project.captionGroups, pixelsPerMs: 0.04, currentMs: 750, fps: 25, disabled: false, visibleStartMs: 0, visibleEndMs: 1100, onChange() {}, onSeek() {}, onError() {} }));
assert.equal((virtual.match(/role="slider"/g) || []).length, 2, 'Offscreen words do not add controls to the DOM');
console.log('PASS: inline caption source edits, frame/neighbor bounds, locks, archived sources, renderer time mapping, import roundtrip, active-word silence and accessible handles');
