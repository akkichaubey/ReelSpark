import { commitTimeline, deleteTimelineClips, frameTime, linkedSelection, pasteTimelineClips, type ReelTimeline, type TimelineClip } from './model';

export type TimelineEditMode = 'move' | 'ripple' | 'roll' | 'slip' | 'slide';
const end = (clip: TimelineClip) => clip.startMs + clip.durationMs;
function editable(t: ReelTimeline, ids: Set<string>) {
  if (t.clips.some(c => ids.has(c.id) && t.tracks.find(track => track.id === c.trackId)?.locked))
    throw new Error('Unlock all affected tracks before editing.');
}
function clipAt(t: ReelTimeline, id: string) {
  const clip = t.clips.find(c => c.id === id);
  if (!clip) throw new Error('Select a clip to edit.');
  return clip;
}
function finish(t: ReelTimeline, clips: TimelineClip[], shiftMarker?: (time: number) => number) {
  // Shortening a clip keeps fades inside the new interval.
  return commitTimeline({ ...t, clips: clips.map(c => {
    const fadeInMs = Math.min(c.fadeInMs, Math.max(0, c.durationMs));
    const audioFadeInMs = c.audioFadeInMs === undefined ? undefined : Math.min(c.audioFadeInMs, Math.max(0, c.durationMs));
    const audioFadeOutMs = c.audioFadeOutMs === undefined ? undefined : Math.min(c.audioFadeOutMs, Math.max(0, c.durationMs - (audioFadeInMs || 0)));
    return { ...c, fadeInMs, fadeOutMs: Math.min(c.fadeOutMs, Math.max(0, c.durationMs - fadeInMs)), audioFadeInMs, audioFadeOutMs };
  }), markers: shiftMarker ? t.markers.map(m => ({ ...m, timeMs: shiftMarker(m.timeMs) })) : t.markers });
}

/** Ripple trim changes duration and shifts everything beyond the original cut. */
export function rippleTrim(t: ReelTimeline, id: string, edge: 'left' | 'right', deltaMs: number) {
  const clip = clipAt(t, id), ids = linkedSelection(t, [id]);
  const delta = frameTime(deltaMs, t.fps), boundary = end(clip);
  if (t.clips.some(c => ids.has(c.id) && (c.startMs !== clip.startMs || end(c) !== boundary)))
    throw new Error('Ripple trim requires aligned linked clips.');
  if (t.clips.some(c => !ids.has(c.id) && c.startMs < boundary && end(c) > boundary))
    throw new Error('Another clip crosses the ripple cut. Split it first.');
  const shift = edge === 'right' ? delta : -delta;
  editable(t, new Set(t.clips.filter(c => ids.has(c.id) || c.startMs >= boundary).map(c => c.id)));
  return finish(t, t.clips.map(c => ids.has(c.id)
    ? edge === 'left' ? { ...c, sourceStartMs: c.sourceStartMs + delta, durationMs: c.durationMs - delta, motion: c.motion ? { ...c.motion, offsetMs: (c.motion.offsetMs || 0) + delta } : undefined }
      : { ...c, durationMs: c.durationMs + delta }
    : c.startMs >= boundary ? { ...c, startMs: c.startMs + shift } : c),
    time => time >= boundary ? time + shift : time);
}

/** Roll changes a shared cut while preserving the pair's outer boundaries. */
export function rollEdit(t: ReelTimeline, id: string, edge: 'left' | 'right', deltaMs: number) {
  const clip = clipAt(t, id);
  const neighbor = t.clips.find(c => c.id !== id && c.trackId === clip.trackId &&
    (edge === 'right' ? c.startMs === end(clip) : end(c) === clip.startMs));
  if (!neighbor) throw new Error('Roll requires two adjacent clips on the same track.');
  const left = edge === 'right' ? clip : neighbor, right = edge === 'right' ? neighbor : clip;
  const leftIds = linkedSelection(t, [left.id]), rightIds = linkedSelection(t, [right.id]);
  if ([...leftIds].some(id => rightIds.has(id))) throw new Error('Ungroup clips across the cut before rolling.');
  if (t.clips.some(c => leftIds.has(c.id) && end(c) !== end(left) || rightIds.has(c.id) && c.startMs !== right.startMs))
    throw new Error('Linked clips must align at the roll cut.');
  editable(t, new Set([...leftIds, ...rightIds]));
  const delta = frameTime(deltaMs, t.fps);
  return finish(t, t.clips.map(c => leftIds.has(c.id) ? { ...c, durationMs: c.durationMs + delta }
    : rightIds.has(c.id) ? { ...c, startMs: c.startMs + delta, sourceStartMs: c.sourceStartMs + delta, durationMs: c.durationMs - delta, motion: c.motion ? { ...c.motion, offsetMs: (c.motion.offsetMs || 0) + delta } : undefined } : c));
}

/** Slip changes source in/out without moving the clip in the timeline. */
export function slipEdit(t: ReelTimeline, ids: string[], deltaMs: number) {
  const selected = linkedSelection(t, ids); editable(t, selected);
  const delta = frameTime(deltaMs, t.fps);
  if (t.clips.some(c => selected.has(c.id) && (!c.assetId || t.assets.find(a => a.id === c.assetId)?.mediaType === 'image')))
    throw new Error('Slip requires time-based video, audio or caption media.');
  return finish(t, t.clips.map(c => selected.has(c.id) ? { ...c, sourceStartMs: c.sourceStartMs + delta } : c));
}

/** Slide preserves the selected source range and trims both adjacent clips. */
export function slideEdit(t: ReelTimeline, id: string, deltaMs: number) {
  const clip = clipAt(t, id), selected = linkedSelection(t, [id]);
  const leftIds = new Set<string>(), rightIds = new Set<string>();
  for (const c of t.clips.filter(c => selected.has(c.id))) {
    const left = t.clips.find(n => !selected.has(n.id) && n.trackId === c.trackId && end(n) === c.startMs);
    const right = t.clips.find(n => !selected.has(n.id) && n.trackId === c.trackId && n.startMs === end(c));
    if (!left || !right) throw new Error('Slide requires adjacent clips on both sides of every linked track.');
    linkedSelection(t, [left.id]).forEach(id => leftIds.add(id));
    linkedSelection(t, [right.id]).forEach(id => rightIds.add(id));
  }
  if ([...leftIds].some(id => rightIds.has(id) || selected.has(id)) || [...rightIds].some(id => selected.has(id)))
    throw new Error('Ungroup clips across the slide boundaries first.');
  if (t.clips.some(c => selected.has(c.id) && (c.startMs !== clip.startMs || end(c) !== end(clip)) ||
    leftIds.has(c.id) && end(c) !== clip.startMs || rightIds.has(c.id) && c.startMs !== end(clip)))
    throw new Error('Linked clips must align at the slide boundaries.');
  editable(t, new Set([...selected, ...leftIds, ...rightIds]));
  const delta = frameTime(deltaMs, t.fps);
  return finish(t, t.clips.map(c => selected.has(c.id) ? { ...c, startMs: c.startMs + delta }
    : leftIds.has(c.id) ? { ...c, durationMs: c.durationMs + delta }
    : rightIds.has(c.id) ? { ...c, startMs: c.startMs + delta, sourceStartMs: c.sourceStartMs + delta, durationMs: c.durationMs - delta, motion: c.motion ? { ...c.motion, offsetMs: (c.motion.offsetMs || 0) + delta } : undefined } : c));
}

/** Only globally empty intervals are removed, keeping tracks and links in sync. */
export function removeTimelineGaps(t: ReelTimeline) {
  return compactGaps(t);
}
function compactGaps(t: ReelTimeline, ranges?: { start: number; end: number }[]) {
  const sorted = [...t.clips].sort((a, b) => a.startMs - b.startMs);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const c of sorted) { if (c.startMs > cursor) gaps.push({ start: cursor, end: c.startMs }); cursor = Math.max(cursor, end(c)); }
  const intervals = ranges ? gaps.flatMap(gap => ranges.map(range => ({ start: Math.max(gap.start, range.start), end: Math.min(gap.end, range.end) })).filter(gap => gap.end > gap.start)) : gaps;
  const merged: { start: number; end: number }[] = [];
  for (const gap of intervals.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && gap.start <= last.end) last.end = Math.max(last.end, gap.end);
    else merged.push({ ...gap });
  }
  const shift = (time: number) => time - merged.reduce((sum, gap) => sum + Math.max(0, Math.min(time, gap.end) - gap.start), 0);
  editable(t, new Set(t.clips.filter(c => shift(c.startMs) !== c.startMs).map(c => c.id)));
  return finish(t, t.clips.map(c => ({ ...c, startMs: shift(c.startMs) })), shift);
}
export function rippleDelete(t: ReelTimeline, ids: string[]) {
  const selected = linkedSelection(t, ids);
  const ranges = t.clips.filter(c => selected.has(c.id)).map(c => ({ start: c.startMs, end: end(c) }));
  return compactGaps(deleteTimelineClips(t, ids), ranges);
}
export function duplicateTimelineClips(t: ReelTimeline, ids: string[]) {
  const selected = linkedSelection(t, ids), clips = t.clips.filter(c => selected.has(c.id));
  return clips.length ? pasteTimelineClips(t, clips, Math.max(...t.clips.map(end))) : t;
}
