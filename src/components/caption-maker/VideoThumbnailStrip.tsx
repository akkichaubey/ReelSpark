'use client';
import { useState } from 'react';
import type { TimelineClip } from '@/lib/timeline/model';
import { thumbnailTiles, type ThumbnailPreview } from '@/lib/timeline/thumbnails';

function FrameTile({ src, left, width }: { src: string; left: number; width: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return <div className="absolute inset-y-0 overflow-hidden bg-zinc-800" style={{ left, width }}>
    {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-zinc-700/50" />}
    {/* Small cached image, not a video decoder for every timeline tile. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className={`h-full w-full object-cover ${state === 'ready' ? 'opacity-70' : 'opacity-0'}`} onLoad={() => setState('ready')} onError={() => setState('error')} />
    {state === 'error' && <span className="text-[9px] text-zinc-500">Frame unavailable</span>}
  </div>;
}
export function VideoThumbnailStrip({ clip, preview, pixelsPerMs, height, visibleStartMs, visibleEndMs }: {
  clip: TimelineClip; preview: ThumbnailPreview; pixelsPerMs: number; height: number; visibleStartMs: number; visibleEndMs: number;
}) {
  const width = Math.max(48, Math.min(144, Math.round(Math.max(24, height - 8) * 16 / 9)));
  const tiles = thumbnailTiles(clip, pixelsPerMs, width, visibleStartMs, visibleEndMs, preview);
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {tiles.map(tile => <FrameTile key={`${tile.index}_${tile.src}`} {...tile} />)}
  </div>;
}
