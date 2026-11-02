'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HoverFrame { fileUrl: string; name: string; sourceMs: number; timelineMs: number; x: number; y: number; durationMs: number }
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(2).padStart(5, '0')}`;
export function HoverFramePreview({ frame }: { frame: HoverFrame }) {
  const video = useRef<HTMLVideoElement>(null);
  const pendingTime = useRef(frame.sourceMs);
  const seekTimer = useRef<number | null>(null);
  const [displayedTime, setDisplayedTime] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const seek = (element: HTMLVideoElement, milliseconds: number) => {
    if (!Number.isFinite(element.duration)) return;
    element.currentTime = Math.max(0, Math.min(element.duration - 0.001, milliseconds / 1000));
  };
  useEffect(() => {
    pendingTime.current = frame.sourceMs;
    if (seekTimer.current !== null) return;
    seekTimer.current = window.setTimeout(() => { seekTimer.current = null; if (video.current) seek(video.current, pendingTime.current); }, 60);
  }, [frame.sourceMs]);
  useEffect(() => () => {
    if (seekTimer.current !== null) window.clearTimeout(seekTimer.current);
    seekTimer.current = null;
  }, []);
  if (typeof document === 'undefined') return null;
  const loading = displayedTime === null || Math.abs(displayedTime * 1000 - frame.sourceMs) > 80;
  const width = Math.min(240, window.innerWidth - 16);
  return createPortal(<div data-hover-frame-preview="true" data-theme-media="true" className="pointer-events-none fixed z-[90] overflow-hidden rounded-lg border border-zinc-600 bg-zinc-950 text-zinc-100 shadow-2xl"
    style={{ width, left: Math.max(8, Math.min(window.innerWidth - width - 8, frame.x - width / 2)), top: Math.max(8, Math.min(window.innerHeight - 205, frame.y - 190)) }}>
    <div className="relative h-32 bg-black">
      <video ref={video} src={frame.fileUrl} muted playsInline preload="metadata" className="h-full w-full object-contain"
        onLoadedMetadata={e => seek(e.currentTarget, frame.sourceMs)}
        onLoadedData={e => setDisplayedTime(e.currentTarget.currentTime)}
        onSeeked={e => setDisplayedTime(e.currentTarget.currentTime)} onError={() => setFailed(true)} />
      {(loading || failed) && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs" role="status">{failed ? 'Frame preview unavailable' : 'Loading frame…'}</div>}
    </div>
    <div className="space-y-1 p-2 text-[10px]"><div className="truncate font-medium">{frame.name}</div>
      <div>Source {clock(frame.sourceMs)} · Timeline {clock(frame.timelineMs)}</div><div className="text-zinc-400">Clip duration {clock(frame.durationMs)}</div>
    </div>
  </div>, document.body);
}
