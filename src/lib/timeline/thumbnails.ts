import type { TimelineClip } from './model';

export interface ThumbnailPreview { durationMs: number; thumbnails: string[]; thumbnailTimesMs?: number[] }
export function thumbnailSampleTimes(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 14_400_000) return [];
  const count = Math.max(4, Math.min(24, Math.ceil(durationMs / 5000)));
  return Array.from({ length: count }, (_, i) => Math.round(Math.max(0, durationMs - 50) * i / (count - 1)));
}
export function clipSourceTime(clip: TimelineClip, localMs: number, sourceDurationMs: number) {
  const source = clip.sourceStartMs + Math.max(0, Math.min(Math.max(0, clip.durationMs - 1), localMs));
  if (sourceDurationMs <= 0) return Math.max(0, source);
  return clip.loop ? source % sourceDurationMs : Math.max(0, Math.min(Math.max(0, sourceDurationMs - 1), source));
}
/** Only viewport tiles are created; zoom adds temporal samples without DOM growth. */
export function thumbnailTiles(clip: TimelineClip, pixelsPerMs: number, tileWidth: number, visibleStartMs: number, visibleEndMs: number, preview: ThumbnailPreview) {
  if (!preview.thumbnails.length || preview.durationMs <= 0 || pixelsPerMs <= 0 || tileWidth <= 0 || !Number.isFinite(pixelsPerMs) || !Number.isFinite(tileWidth)) return [];
  const count = Math.ceil(clip.durationMs * pixelsPerMs / tileWidth);
  const first = Math.max(0, Math.floor((visibleStartMs - clip.startMs) * pixelsPerMs / tileWidth) - 1);
  const last = Math.min(count - 1, Math.ceil((visibleEndMs - clip.startMs) * pixelsPerMs / tileWidth) + 1, first + 511);
  const times = preview.thumbnailTimesMs?.length === preview.thumbnails.length ? preview.thumbnailTimesMs : preview.thumbnails.map((_, i) => preview.durationMs * i / preview.thumbnails.length);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
    const index = first + offset, left = index * tileWidth;
    const sourceTimeMs = clipSourceTime(clip, left / pixelsPerMs, preview.durationMs);
    let sample = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - sourceTimeMs) < Math.abs(times[sample] - sourceTimeMs)) sample = i;
    return { index, left, width: Math.min(tileWidth, clip.durationMs * pixelsPerMs - left), sourceTimeMs, src: preview.thumbnails[sample] };
  });
}
