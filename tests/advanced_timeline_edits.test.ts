import assert from 'node:assert/strict';
import { commitTimeline, createTimelineTrack, createTimelineClip, type ReelTimeline, type TimelineAsset } from '../src/lib/timeline/model';
import { rippleTrim, rollEdit, slipEdit, slideEdit, rippleDelete, removeTimelineGaps, duplicateTimelineClips } from '../src/lib/timeline/advanced-edits';

const track = createTimelineTrack('video');
const asset: TimelineAsset = { id: 'asset_a', fileUrl: '/api/media/test.mp4', fileName: 'test.mp4', mediaType: 'video', durationMs: 20000 };
function fixture(): ReelTimeline {
  return commitTimeline({ version: 1, enabled: true, fps: 25, tracks: [track], assets: [asset], captionSources: {}, markers: [{ id: 'mark_a', timeMs: 6000, name: 'End' }],
    clips: [0, 2000, 4000].map((start, i) => ({ ...createTimelineClip(track, asset, start, 2000), id: `clip_${i}`, sourceStartMs: 2000 })) });
}
const original = fixture(), snapshot = JSON.stringify(original);
const clip = (t: ReelTimeline, i: number) => t.clips.find(c => c.id === `clip_${i}`)!;
let next = rippleTrim(original, 'clip_1', 'right', 400);
assert.equal(clip(next, 1).durationMs, 2400); assert.equal(clip(next, 2).startMs, 4400); assert.equal(next.markers[0].timeMs, 6400);
next = rippleTrim(original, 'clip_1', 'left', 400);
assert.equal(clip(next, 1).startMs, 2000); assert.equal(clip(next, 1).sourceStartMs, 2400); assert.equal(clip(next, 2).startMs, 3600);
next = rollEdit(original, 'clip_1', 'right', 400);
assert.equal(clip(next, 1).durationMs, 2400); assert.equal(clip(next, 2).durationMs, 1600); assert.equal(clip(next, 2).sourceStartMs, 2400); assert.equal(next.markers[0].timeMs, 6000);
next = slipEdit(original, ['clip_1'], -400);
assert.equal(clip(next, 1).sourceStartMs, 1600); assert.equal(clip(next, 1).startMs, 2000); assert.equal(clip(next, 1).durationMs, 2000);
next = slideEdit(original, 'clip_1', 400);
assert.equal(clip(next, 0).durationMs, 2400); assert.equal(clip(next, 1).startMs, 2400); assert.equal(clip(next, 1).sourceStartMs, 2000); assert.equal(clip(next, 2).startMs, 4400); assert.equal(clip(next, 2).durationMs, 1600);
next = rippleDelete(original, ['clip_1']);
assert.equal(next.clips.length, 2); assert.equal(clip(next, 2).startMs, 2000);
const gaps = fixture(); gaps.clips[1].startMs += 1000; gaps.clips[2].startMs += 1000;
assert.equal(clip(removeTimelineGaps(gaps), 1).startMs, 2000);
// Ripple delete closes only removed time, preserving an unrelated old gap.
assert.equal(clip(rippleDelete(gaps, ['clip_1']), 2).startMs, 3000);
const linked = fixture(), audioTrack = createTimelineTrack('audio'); linked.tracks.push(audioTrack);
linked.clips[1].linkId = 'link_a'; linked.clips.push({ ...linked.clips[1], id: 'audio_a', trackId: audioTrack.id });
next = slipEdit(linked, ['clip_1'], 400); assert.equal(next.clips.find(c => c.id === 'audio_a')!.sourceStartMs, 2400);
next = duplicateTimelineClips(linked, ['clip_1']); assert.equal(next.clips.length, 6);
const copies = next.clips.slice(-2); assert.equal(copies[0].startMs, 6000); assert.equal(copies[0].linkId, copies[1].linkId); assert.notEqual(copies[0].linkId, 'link_a');
// Existing clips are not overwritten by duplication.
assert.equal(JSON.stringify(original), snapshot);
assert.throws(() => slipEdit(original, ['clip_1'], -4000), /time range/);
assert.throws(() => slipEdit(original, ['clip_1'], 20000), /source/);
assert.throws(() => rollEdit(original, 'clip_0', 'left', 400), /adjacent/);
assert.throws(() => slideEdit(original, 'clip_0', 400), /adjacent/);
assert.throws(() => rollEdit(original, 'clip_1', 'right', 2400), /time range/);
const locked = fixture(); locked.tracks = [{ ...track, locked: true }];
for (const edit of [() => rippleTrim(locked, 'clip_1', 'right', 400), () => rollEdit(locked, 'clip_1', 'right', 400), () => slipEdit(locked, ['clip_1'], 400), () => slideEdit(locked, 'clip_1', 400), () => rippleDelete(locked, ['clip_1'])]) assert.throws(edit, /Unlock/);
const covered = fixture(); covered.tracks.push(audioTrack);
covered.clips.push({ ...createTimelineClip(audioTrack, asset, 0, 6000), id: 'bed' });
next = rippleDelete(covered, ['clip_1']); assert.equal(clip(next, 2).startMs, 4000, 'Continuous media on another track prevents a gap from being closed');
assert.throws(() => rippleTrim(covered, 'clip_1', 'right', 400), /crosses/);
const lockedDownstream = fixture(); lockedDownstream.tracks.push({ ...audioTrack, locked: true });
lockedDownstream.clips.push({ ...createTimelineClip(audioTrack, asset, 6000, 2000), id: 'locked_tail' });
assert.throws(() => rippleTrim(lockedDownstream, 'clip_1', 'right', 400), /Unlock/);
const lockedGap = fixture(); lockedGap.tracks = [{ ...track, locked: true }]; lockedGap.clips.forEach(c => c.startMs += 1000);
assert.throws(() => removeTimelineGaps(lockedGap), /Unlock/);
assert.equal(removeTimelineGaps(original).clips[1].startMs, 2000);
next = rollEdit(original, 'clip_2', 'left', -400); assert.equal(clip(next, 2).startMs, 3600); assert.equal(clip(next, 1).durationMs, 1600);
assert.throws(() => slideEdit(original, 'clip_1', -2400), /time range/);
assert.equal(JSON.stringify(original), snapshot, 'Failed edits must leave the input document intact');
console.log('PASS: ripple, roll, slip, slide, gap removal, linked source timing, bounds, locks and immutable edits');
