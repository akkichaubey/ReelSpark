'use strict';
'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CaptionGroup, TranscriptWord } from '@/lib/caption-maker/types';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';

interface CaptionTimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  groups: CaptionGroup[];
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

// Deterministic static waveform bar heights (integers between 15 and 100) to prevent any SSR/client hydration floating-point mismatch
const STATIC_WAVEFORM_BARS: number[] = Array.from({ length: 120 }, (_, i) => {
  const progress = i / 120;
  const base = Math.sin(progress * Math.PI * 14) * 0.3 + 0.5;
  const noise = (Math.sin(i * 1.7) * 0.5 + 0.5) * 0.4;
  return Math.round(Math.min(100, Math.max(15, (base + noise) * 80)));
});

export const CaptionTimeline: React.FC<CaptionTimelineProps> = ({
  duration,
  currentTime,
  isPlaying,
  groups,
  onSeek,
  onTogglePlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = fit, 2 = 2x, 4 = 4x
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  const safeDuration = duration > 0 ? duration : 0;

  // Flatten all words for timeline visualization
  const allWords = useMemo(() => {
    const list: TranscriptWord[] = [];
    groups.forEach((g) => {
      g.words.forEach((w) => list.push(w));
    });
    return list;
  }, [groups]);

  const waveformBars = STATIC_WAVEFORM_BARS;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    setIsScrubbing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      seekFromEvent(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || safeDuration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.min(Math.max(0, clickX / rect.width), 1);
    const targetTime = percentage * safeDuration;
    onSeek(targetTime);
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  // Time ticks calculation (every 1s, 2s or 5s depending on duration)
  const tickInterval = safeDuration > 30 ? 5 : safeDuration > 15 ? 2 : 1;
  const tickCount = safeDuration > 0 ? Math.floor(safeDuration / tickInterval) : 0;
  const ticks = safeDuration > 0 ? Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval) : [0];

  const playheadPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 p-3 select-none flex flex-col gap-2 shadow-2xl">
      {/* Top Bar: Playback Controls, Timer, Zoom */}
      <div className="flex items-center justify-between px-2 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-amber-500/20"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title="Restart from beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="font-mono text-xs text-zinc-300 flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg">
            <span className="text-amber-400 font-semibold">{formatSec(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{formatSec(safeDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[11px] text-zinc-500 hidden sm:inline">Timeline Zoom:</span>
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
              className="p-1 hover:text-white transition-colors disabled:opacity-40"
              disabled={zoomLevel <= 1}
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1.5 text-zinc-300">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
              className="p-1 hover:text-white transition-colors disabled:opacity-40"
              disabled={zoomLevel >= 3}
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Timeline Track Scroll Area */}
      <div className="relative overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-2 custom-scrollbar">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ width: `${zoomLevel * 100}%` }}
          className="relative h-28 cursor-pointer select-none rounded-lg overflow-hidden bg-zinc-950/90"
        >
          {/* Time Ruler / Ticks */}
          <div className="absolute top-0 left-0 right-0 h-5 border-b border-zinc-800/80 flex items-center pointer-events-none">
            {ticks.map((t) => {
              const tickLeft = (t / safeDuration) * 100;
              return (
                <div
                  key={t}
                  style={{ left: `${tickLeft}%` }}
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                >
                  <div className="w-[1px] h-2 bg-zinc-700" />
                  <span className="text-[9px] font-mono text-zinc-500 transform -translate-x-1/2">
                    {t}s
                  </span>
                </div>
              );
            })}
          </div>

          {/* Audio Waveform Canvas / Mock Bars */}
          <div
            suppressHydrationWarning
            className="absolute top-5 left-0 right-0 bottom-11 flex items-center justify-between px-1 pointer-events-none opacity-40"
          >
            {waveformBars.map((h, i) => {
              const barPercent = Math.round((i / waveformBars.length) * 100);
              const isPast = barPercent <= playheadPercent;
              return (
                <div
                  key={i}
                  suppressHydrationWarning
                  style={{ height: `${h}%` }}
                  className={`w-[2px] rounded-full transition-colors ${
                    isPast ? 'bg-amber-400/80' : 'bg-zinc-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Word Blocks Track */}
          <div
            suppressHydrationWarning
            className="absolute bottom-1 left-0 right-0 h-9 flex items-center px-1 pointer-events-none"
          >
            {allWords.map((word) => {
              const left = safeDuration > 0 ? Number(((word.start / safeDuration) * 100).toFixed(2)) : 0;
              const width = safeDuration > 0
                ? Number(Math.max(0.8, ((word.end - word.start) / safeDuration) * 100).toFixed(2))
                : 0;
              const isActive = currentTime >= word.start && currentTime <= word.end;

              return (
                <div
                  key={word.id}
                  suppressHydrationWarning
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  title={`${word.text} (${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s)`}
                  className={`absolute h-7 rounded px-1.5 flex items-center overflow-hidden border text-[10px] font-medium tracking-tight whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-amber-400 text-black border-amber-300 font-bold z-10 shadow-sm'
                      : word.isImportant
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-zinc-800/90 text-zinc-300 border-zinc-700/60'
                  }`}
                >
                  <span className="truncate">{word.text}</span>
                </div>
              );
            })}
          </div>

          {/* Scrubber Playhead Line */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 pointer-events-none z-20 shadow-[0_0_10px_rgba(250,204,21,0.8)]"
          >
            {/* Playhead Handle */}
            <div className="absolute top-0 -left-1.5 w-3.5 h-3.5 bg-amber-400 rotate-45 rounded-sm shadow-md" />
          </div>
        </div>
      </div>
    </div>
  );
};
