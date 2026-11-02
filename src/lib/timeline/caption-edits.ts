import type { CaptionGroup, CaptionProject, TranscriptWord } from '../caption-maker/types';
import { commitTimeline, type ReelTimeline, type TimelineClip } from './model';

export function captionClipGroups(project: CaptionProject, timeline: ReelTimeline, clip: TimelineClip): CaptionGroup[] {
  const source = clip.assetId === project.audio?.id ? project : timeline.captionSources[clip.assetId || ''];
  if (!source) return [];
  return source.captionGroups.length ? source.captionGroups : source.transcript.length ? [{ id: 'ungrouped', words: source.transcript,
    text: source.transcript.map(w => w.text).join(' '), start: Math.min(...source.transcript.map(w => w.start)), end: Math.max(...source.transcript.map(w => w.end)) }] : [];
}

/** Source-time edits keep sibling clips, transcript and render groups consistent. */
export function editCaptionWord(groups: CaptionGroup[], id: string, patch: Partial<Pick<TranscriptWord, 'text' | 'start' | 'end'>>, bounds: { start: number; end: number }, fps: number): CaptionGroup[] {
  const words = groups.flatMap(g => g.words).sort((a, b) => a.start - b.start), index = words.findIndex(w => w.id === id);
  if (index < 0) throw new Error('Caption word is no longer available.');
  const word = words[index], next = { ...word };
  if (patch.text !== undefined) {
    if (!patch.text.trim() || patch.text.length > 500) throw new Error('Enter caption text between 1 and 500 characters.');
    next.text = patch.text.trim();
  }
  const minimum = 1 / fps;
  if (patch.start !== undefined) {
    const lower = Math.max(bounds.start, words[index - 1]?.end ?? 0), upper = Math.min(word.end - minimum, bounds.end - minimum);
    if (!Number.isFinite(patch.start) || lower > upper) throw new Error('No space to move this word boundary.');
    next.start = Math.max(lower, Math.min(upper, Math.round(patch.start * fps) / fps));
  }
  if (patch.end !== undefined) {
    const lower = Math.max(next.start + minimum, bounds.start + minimum), upper = Math.min(bounds.end, words[index + 1]?.start ?? bounds.end);
    if (!Number.isFinite(patch.end) || lower > upper) throw new Error('No space to move this word boundary.');
    next.end = Math.max(lower, Math.min(upper, Math.round(patch.end * fps) / fps));
  }
  if (next.start !== word.start || next.end !== word.end) next.timingSource = 'phrase-estimated';
  return groups.map(g => {
    if (!g.words.some(w => w.id === id)) return g;
    const updated = g.words.map(w => w.id === id ? next : w);
    return { ...g, words: updated, text: updated.map(w => w.text).join(' '), start: Math.min(...updated.map(w => w.start)), end: Math.max(...updated.map(w => w.end)) };
  });
}

export function updateCaptionSource(project: CaptionProject, assetId: string, groups: CaptionGroup[]): CaptionProject {
  const timeline = project.timeline;
  if (timeline?.tracks.some(track => track.locked && timeline.clips.some(c => c.assetId === assetId && c.trackId === track.id && track.kind === 'captions')))
    throw new Error('Unlock caption tracks using this source before editing.');
  const transcript = groups.flatMap(g => g.words);
  if (!transcript.length || transcript.some(w => !w.text.trim() || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end <= w.start))
    throw new Error('Invalid caption words or timing.');
  if (assetId !== project.audio?.id && !timeline?.captionSources[assetId]) throw new Error('Caption source is no longer available.');
  const source = { ...(timeline?.captionSources[assetId] || {}), transcript, captionGroups: groups };
  return { ...project, ...(assetId === project.audio?.id ? { transcript, captionGroups: groups } : {}),
    timeline: timeline ? commitTimeline({ ...timeline, captionSources: { ...timeline.captionSources, [assetId]: source } }) : timeline,
    renderedVideoUrl: undefined, renderedVideoPath: undefined, renderedSrtUrl: undefined, renderedSrtPath: undefined,
    updatedAt: new Date().toISOString() };
}
