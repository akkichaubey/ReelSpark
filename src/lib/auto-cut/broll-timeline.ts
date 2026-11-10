import type { ReelTimeline, TimelineClip } from '../timeline/model';
import type { BRollEdit } from './broll';
import type { AutoCutClipCandidate } from './types';

export function applyBRollEdits(timeline: ReelTimeline, targets: AutoCutClipCandidate[], base: TimelineClip[], edits: BRollEdit[]) {
  const track = (id: string, kind: 'video' | 'overlay', name: string) => ({
    id, kind, name, height: 60, locked: false, hidden: false, muted: false,
  });
  const placements = edits.map(edit => {
    const index = targets.findIndex(clip => clip.id === edit.targetId && clip.startMs === edit.targetStartMs &&
      clip.sourceVideoId === edit.targetSourceId);
    const target = targets[index];
    if (!target) throw new Error('A B-roll target changed. Remove or reapply its placement.');
    if (edit.mode !== 'insert' && (target.locked || edit.offsetMs + edit.durationMs > target.durationMs)) {
      throw new Error('Choose an unlocked target and keep B-roll within its current range.');
    }
    return { edit, baseClip: base[index], startMs: base[index].startMs + (edit.mode === 'insert' ? 0 : edit.offsetMs) };
  });
  for (const { edit, baseClip, startMs } of placements.sort((a, b) => b.startMs - a.startMs)) {
    const asset = timeline.assets.find(item => item.id === 'source_' + edit.sourceId);
    if (!asset || asset.mediaType !== 'video' || edit.startMs + edit.durationMs > asset.durationMs) {
      throw new Error('B-roll source is unavailable or its trim exceeds the video.');
    }
    const endMs = startMs + edit.durationMs;
    const broll: TimelineClip = {
      id: `broll_${crypto.randomUUID()}`, trackId: 'video', assetId: asset.id,
      name: 'B-roll · ' + asset.fileName, startMs, sourceStartMs: edit.startMs, durationMs: edit.durationMs,
      muted: true, volume: 0, loop: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: 'cut',
    };
    if (edit.mode === 'overlay') {
      broll.trackId = 'broll-overlay';
      broll.motion = { channels: {
        scale: [{ timeMs: 0, value: 44, easing: 'linear' }],
        x: [{ timeMs: 0, value: 23, easing: 'linear' }],
        y: [{ timeMs: 0, value: -23, easing: 'linear' }],
      } };
      if (!timeline.tracks.some(item => item.id === broll.trackId)) {
        const videoIndex = timeline.tracks.findIndex(item => item.kind === 'video');
        timeline.tracks.splice(videoIndex >= 0 ? videoIndex : timeline.tracks.length, 0, track(broll.trackId, 'overlay', 'B-roll overlay'));
      }
    } else {
      if (!timeline.tracks.some(item => item.id === 'video')) timeline.tracks.push(track('video', 'video', 'Auto Cut video'));
      if (edit.mode === 'insert') {
        if (timeline.clips.some(clip => clip.startMs < startMs && clip.startMs + clip.durationMs > startMs)) {
          throw new Error('This cutaway crosses another edit. Choose another boundary.');
        }
        for (const clip of timeline.clips) if (clip.startMs >= startMs) clip.startMs += edit.durationMs;
        for (const marker of timeline.markers) if (marker.timeMs >= startMs) marker.timeMs += edit.durationMs;
      } else {
        timeline.clips = timeline.clips.flatMap(clip => {
          if (clip.id !== baseClip.id) return [clip];
          const leading = startMs - clip.startMs;
          const trailing = clip.startMs + clip.durationMs - endMs;
          return [
            ...(leading ? [{ ...clip, durationMs: leading, linkId: undefined }] : []),
            ...(trailing ? [{ ...clip, id: clip.id + '_tail', startMs: endMs, durationMs: trailing,
              sourceStartMs: clip.sourceStartMs + (endMs - clip.startMs), linkId: undefined }] : []),
          ];
        });
      }
    }
    timeline.clips.push(broll);
  }
}
