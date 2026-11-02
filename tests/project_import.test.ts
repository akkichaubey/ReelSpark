import assert from 'node:assert/strict';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { exportProjectAsJson, importProjectFromJson } from '../src/lib/caption-maker/project-storage';
import { timelineFromProject } from '../src/lib/timeline/model';

const project = createEmptyCaptionProject('roundtrip');
project.transcript = [{ id: 'w1', text: 'नमस्ते', start: .27, end: .68 }, { id: 'w2', text: 'world', start: 1.2, end: 1.9 }];
project.captionGroups = [{ id: 'g', start: .27, end: 1.9, text: 'नमस्ते world', words: project.transcript }];
project.image = { id: 'image', fileUrl: '/api/files/retained/portrait.png', fileName: 'portrait.png', width: 320, height: 480, fileSize: 10, format: 'png', fitMode: 'contain', duration: 3 };
project.captionStyle.fontSize = 73;
project.timeline = { ...timelineFromProject(project), enabled: true };
const before = JSON.stringify(project);
for (const json of [JSON.stringify(project), exportProjectAsJson(project)]) {
  const result = importProjectFromJson(json);
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.project?.transcript, project.transcript);
  assert.deepEqual(result.project?.captionGroups, project.captionGroups);
  assert.deepEqual(JSON.parse(JSON.stringify(result.project?.timeline)), JSON.parse(JSON.stringify(project.timeline)));
  assert.deepEqual(result.project?.image, project.image);
  assert.deepEqual(result.project?.captionStyle, project.captionStyle);
  assert.notEqual(result.project?.id, project.id);
}
assert.equal(JSON.stringify(project), before, 'Import must never mutate the original');
const legacy = importProjectFromJson(JSON.stringify({ id: 'legacy', outputSettings: {}, transcript: project.transcript }));
assert.equal(legacy.success, true);
assert.ok(legacy.project?.captionStyle && legacy.project.outputSettings.width > 0);
assert.deepEqual(legacy.project?.captionGroups.flatMap(group => group.words), project.transcript);
for (const input of [null, [], { ...project, outputSettings: { width: -1 } },
  { ...project, transcript: [{ text: 'bad', start: '0', end: 1 }] },
  { ...project, captionGroups: [{ words: null }] }, { ...project, captionStyle: [] },
  { ...project, audio: 'broken' }, { ...project, timeline: { tracks: [] } }]) {
  const result = importProjectFromJson(JSON.stringify(input));
  assert.equal(result.success, false);
  assert.ok(result.error);
}
assert.equal(importProjectFromJson('{').success, false);
console.log('PASS: portable project roundtrip retains multilingual timing, styles, timeline and media; legacy defaults and malformed input recovery');
