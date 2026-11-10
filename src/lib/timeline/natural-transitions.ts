import { commitTimeline, frameTime, linkedSelection, type ReelTimeline, type TimelineClip } from './model';
import type { NaturalTransitionKind } from '../auto-cut/natural-transitions';

const intersects = (a: number, b: number, c: number, d: number) => a < d && c < b;

export function setNaturalTimelineBoundary(timeline: ReelTimeline, incomingId: string, kind: NaturalTransitionKind,
  durationMs: number, reason = 'Manually selected transition.') {
  const incoming = timeline.clips.find(clip => clip.id === incomingId);
  const track = timeline.tracks.find(item => item.id === incoming?.trackId);
  if (!incoming || !track || !['video', 'intro'].includes(track.kind) || track.locked) throw new Error('Choose an unlocked video boundary.');
  const ordered = timeline.clips.filter(clip => clip.trackId === incoming.trackId).sort((a, b) => a.startMs - b.startMs);
  const outgoing = ordered[ordered.indexOf(incoming) - 1];
  if (!outgoing) throw new Error('This shot has no preceding shot on its track.');
  const outEnd = outgoing.startMs + outgoing.durationMs;
  if (incoming.startMs > outEnd + 1) throw new Error('Close the gap before applying a transition.');
  const currentOverlap = Math.max(0, outEnd - incoming.startMs);
  const blend = kind === 'fade' || kind === 'crossfade';
  const fps = timeline.fps;
  let overlap = 0;
  if (blend) {
    const cap = Math.min(600, durationMs, outgoing.durationMs / 4, incoming.durationMs / 4);
    const start = frameTime(Math.ceil((outEnd - cap) * fps / 1000) * 1000 / fps, fps);
    overlap = outEnd - start;
    if (overlap > Math.min(outgoing.durationMs, incoming.durationMs) / 4) overlap = outEnd - frameTime(start + 1000 / fps, fps);
    if (Math.round(outEnd * fps / 1000) - Math.round((outEnd - overlap) * fps / 1000) < 2) {
      throw new Error('A blend needs two frames and can use at most a quarter of either shot.');
    }
  }

  const left = linkedSelection(timeline, [outgoing.id]);
  const right = linkedSelection(timeline, [incoming.id]);
  const delta = currentOverlap - overlap;
  if ((overlap || currentOverlap) && timeline.clips.some(clip => (left.has(clip.id) || right.has(clip.id)) &&
    timeline.tracks.some(item => item.id === clip.trackId && item.locked))) throw new Error('A linked track is locked.');
  if (overlap > 0) {
    for (const [video, linked, head] of [[outgoing, left, false], [incoming, right, true]] as const) {
      const videoStart = video.sourceStartMs + (head ? 0 : video.durationMs - overlap);
      if (video.transitionEvidence?.black.some(range => intersects(videoStart, videoStart + overlap, range.startMs, range.endMs))) {
        throw new Error('A blend would show known black frames.');
      }
      const audible = timeline.clips.filter(clip => linked.has(clip.id) && !clip.muted && clip.volume > 0 &&
        timeline.assets.some(asset => asset.id === clip.assetId && asset.hasAudio !== false) &&
        timeline.tracks.some(track => track.id === clip.trackId && !track.hidden && !track.muted && ['audio', 'video', 'intro', 'overlay'].includes(track.kind)));
      for (const clip of audible) {
        if (clip.startMs !== video.startMs || clip.durationMs !== video.durationMs) {
          throw new Error('Linked audio timing differs from its video. Use a clean cut.');
        }
        const sourceStart = clip.sourceStartMs + (head ? 0 : clip.durationMs - overlap);
        const words = clip.assetId ? timeline.captionSources[clip.assetId]?.transcript ?? [] : [];
        const silence = video.transitionEvidence?.silence;
        const timed = words.some(word => intersects(clip.sourceStartMs, clip.sourceStartMs + clip.durationMs, word.start * 1000, word.end * 1000));
        if (!timed && !(silence && clip.assetId === video.assetId && silence.startMs <= sourceStart && silence.endMs >= sourceStart + overlap)) {
          throw new Error('Speech timing is unavailable at this audible boundary. Use a clean cut.');
        }
        if (words.some(word => intersects(sourceStart - 40, sourceStart + overlap + 40, word.start * 1000, word.end * 1000))) {
          throw new Error('A blend would overlap timed speech. Use a clean cut.');
        }
      }
    }
  }
  if (delta && timeline.clips.some(clip => {
    if (left.has(clip.id)) return false;
    const locked = timeline.tracks.some(item => item.id === clip.trackId && item.locked);
    return (clip.startMs >= incoming.startMs && locked) ||
      (clip.startMs < incoming.startMs && clip.startMs + clip.durationMs > Math.min(incoming.startMs, incoming.startMs + delta));
  })) throw new Error('A locked or independently placed clip crosses this boundary.');

  const update = (clip: TimelineClip): TimelineClip => {
    const shifted = clip.startMs >= incoming.startMs && !left.has(clip.id) ? { ...clip, startMs: clip.startMs + delta } : { ...clip };
    const kindOfTrack = timeline.tracks.find(item => item.id === clip.trackId)?.kind;
    if (left.has(clip.id) && (kindOfTrack === 'audio' || clip.id === outgoing.id) && (overlap || currentOverlap)) {
      shifted.audioFadeOutMs = overlap;
    }
    if (right.has(clip.id) && (kindOfTrack === 'audio' || clip.id === incoming.id) && (overlap || currentOverlap)) {
      shifted.audioFadeInMs = overlap;
    }
    return clip.id === incoming.id ? { ...shifted, transitionIn: blend ? 'crossfade' : 'cut',
      fadeInMs: overlap, naturalTransition: { kind, reason } } : shifted;
  };
  return commitTimeline({
    ...timeline, clips: timeline.clips.map(update),
    markers: timeline.markers.map(marker => marker.timeMs >= incoming.startMs ? { ...marker, timeMs: marker.timeMs + delta } : marker),
  });
}
