import { commitTimeline, createTimelineTrack, frameTime, linkedSelection, makeTimelineId, type ReelTimeline, type TimelineClip, type TimelineTrack, type TimelinePlan } from './model';

export const audioTrack = (track: TimelineTrack) => !['text', 'captions'].includes(track.kind);
export function trackAudible(timeline: ReelTimeline, track: TimelineTrack) {
  const solo = timeline.tracks.some(t => t.solo && !t.hidden && audioTrack(t));
  return audioTrack(track) && !track.hidden && !track.muted && (!solo || track.solo === true);
}
export function hasAudibleSpeech(plan: TimelinePlan, absoluteMs: number) {
  if (!plan.transcript.some(word => absoluteMs / 1000 >= word.start - 0.1 && absoluteMs / 1000 < word.end + 0.15)) return false;
  return plan.timeline.clips.some(clip => {
    const track = plan.timeline.tracks.find(t => t.id === clip.trackId);
    const asset = plan.timeline.assets.find(a => a.id === clip.assetId);
    return track && track.kind !== 'music' && trackAudible(plan.timeline, track) && asset?.mediaType !== 'image' && asset?.hasAudio !== false &&
      absoluteMs >= clip.startMs && absoluteMs < clip.startMs + clip.durationMs && audioGain(clip, absoluteMs, asset?.durationMs) > 0;
  });
}
export function audioGain(clip: TimelineClip, absoluteMs: number, assetDurationMs = 0) {
  const local = absoluteMs - clip.startMs;
  if (local < 0 || local >= clip.durationMs || clip.muted) return 0;
  const fadeIn = clip.audioFadeInMs ?? clip.fadeInMs, fadeOut = clip.audioFadeOutMs ?? clip.fadeOutMs;
  const envelope = Math.max(0, Math.min(1, fadeIn ? local / fadeIn : 1, fadeOut ? (clip.durationMs - local) / fadeOut : 1));
  const keys = clip.audioKeyframes || [];
  let source = clip.sourceStartMs + local;
  if (clip.loop && assetDurationMs > 0) source %= assetDurationMs;
  let gain = 1;
  if (keys.length) {
    gain = keys[0].gain;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], next = keys[i + 1];
      if (source >= key.timeMs) gain = next && source < next.timeMs
        ? key.gain + (next.gain - key.gain) * (source - key.timeMs) / (next.timeMs - key.timeMs) : key.gain;
    }
  }
  return Math.min(2, clip.volume * gain) * envelope;
}
export function setAudioKeyframe(clip: TimelineClip, sourceMs: number, gain: number, fps: number): TimelineClip {
  const timeMs = frameTime(sourceMs, fps);
  return { ...clip, audioKeyframes: [...(clip.audioKeyframes || []).filter(k => k.timeMs !== timeMs), { timeMs, gain }].sort((a, b) => a.timeMs - b.timeMs) };
}
/** Reuses the source stream; no transcoding, extra upload or timing drift. */
export function detachTimelineAudio(t: ReelTimeline, id: string) {
  const clip = t.clips.find(c => c.id === id), track = t.tracks.find(track => track.id === clip?.trackId);
  const asset = t.assets.find(a => a.id === clip?.assetId);
  if (!clip || !track || !asset || asset.mediaType !== 'video' || !['video', 'intro', 'overlay'].includes(track.kind) || asset.hasAudio !== true)
    throw new Error('Choose a video with a confirmed audio stream. Wait for media analysis if needed.');
  if (t.clips.some(c => c.detachedFromId === id)) throw new Error('Audio is already detached from this clip.');
  const ids = linkedSelection(t, [id]);
  if (t.tracks.some(track => track.locked && t.clips.some(c => ids.has(c.id) && c.trackId === track.id))) throw new Error('Unlock linked tracks before detaching audio.');
  const audio = createTimelineTrack('audio', `${clip.name} — Audio`), linkId = clip.linkId || makeTimelineId('link');
  audio.hidden = track.hidden; audio.solo = track.solo;
  return commitTimeline({ ...t, tracks: [...t.tracks, audio], clips: [
    ...t.clips.map(c => c.id === id ? { ...c, muted: true, linkId } : c),
    { ...structuredClone(clip), id: makeTimelineId('clip'), trackId: audio.id, name: `${clip.name} (Audio)`, muted: clip.muted || track.muted, linkId, detachedFromId: id },
  ] });
}

export function resyncDetachedAudio(t: ReelTimeline, id: string) {
  const audio = t.clips.find(c => c.id === id), video = t.clips.find(c => c.id === audio?.detachedFromId);
  if (!audio || !video || audio.assetId !== video.assetId) throw new Error('The original video clip is missing or its source was replaced.');
  const ids = linkedSelection(t, [audio.id, video.id]);
  if (t.tracks.some(track => track.locked && t.clips.some(c => ids.has(c.id) && c.trackId === track.id))) throw new Error('Unlock affected tracks before resynchronizing.');
  const linkId = video.linkId || audio.linkId || makeTimelineId('link');
  return commitTimeline({ ...t, clips: t.clips.map(c => c.id === audio.id ? { ...c, startMs: video.startMs, sourceStartMs: video.sourceStartMs, durationMs: video.durationMs, loop: video.loop, linkId,
    fadeInMs: Math.min(c.fadeInMs, video.durationMs), fadeOutMs: Math.min(c.fadeOutMs, Math.max(0, video.durationMs - c.fadeInMs)),
    audioFadeInMs: c.audioFadeInMs === undefined ? undefined : Math.min(c.audioFadeInMs, video.durationMs),
    audioFadeOutMs: c.audioFadeOutMs === undefined ? undefined : Math.min(c.audioFadeOutMs, Math.max(0, video.durationMs - (c.audioFadeInMs || 0))),
  } : ids.has(c.id) ? { ...c, linkId } : c) });
}
