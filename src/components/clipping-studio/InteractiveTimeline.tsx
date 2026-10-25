'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Scissors,
  Check,
  Clock,
  Play,
  Pause,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import { formatMsToTimestamp } from '@/lib/clipping-studio/contracts';

export const InteractiveTimeline: React.FC = () => {
  const {
    activeProject,
    selectedAssetId,
    currentTimeMs,
    setCurrentTimeMs,
    inPointMs,
    outPointMs,
    setInPoint,
    setOutPoint,
    createClipFromRange,
    zoomLevel,
    setZoomLevel,
    auditionRangeAction,
    auditionRange,
    isPlaying,
  } = useClippingStore();

  const [clipTitle, setClipTitle] = useState('');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [createdToast, setCreatedToast] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const selectedAsset = activeProject?.mediaAssets.find((a) => a.id === selectedAssetId);
  const durationMs = selectedAsset?.metadata?.durationMs || 60000;

  // Calculate pixel percentage position for a timestamp (0 - 100%)
  const msToPercent = (ms: number) => {
    return Math.max(0, Math.min((ms / durationMs) * 100, 100));
  };

  // Convert client X click on timeline to milliseconds
  const handleSeekFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
    const targetMs = Math.round(ratio * durationMs);
    const mediaEl = typeof document !== 'undefined'
      ? document.querySelector<HTMLMediaElement>('#clipping-studio-player-media')
      : null;
    if (mediaEl) {
      mediaEl.currentTime = targetMs / 1000;
    }
    setCurrentTimeMs(targetMs);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleSeekFromEvent(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        handleSeekFromEvent(e);
      }
    };
    const handleMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
      }
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, durationMs]);

  // Quick preset from playhead
  const setRangePreset = (seconds: number) => {
    const start = currentTimeMs;
    const end = Math.min(start + seconds * 1000, durationMs);
    setInPoint(start);
    setOutPoint(end);
  };

  const handleCreateClip = (e: React.FormEvent) => {
    e.preventDefault();
    const clip = createClipFromRange(clipTitle.trim() || undefined);
    if (clip) {
      setClipTitle('');
      setCreatedToast(true);
      setTimeout(() => setCreatedToast(false), 3000);
    }
  };

  const inPercent = msToPercent(inPointMs);
  const outPercent = msToPercent(outPointMs);
  const currentPercent = msToPercent(currentTimeMs);
  const selectionWidth = Math.max(0.5, outPercent - inPercent);
  const selectionDuration = Math.max(0, outPointMs - inPointMs);

  // Time ruler notches
  const numberOfNotches = 10 * zoomLevel;
  const notches = Array.from({ length: numberOfNotches + 1 }).map((_, i) => {
    const ms = (durationMs / numberOfNotches) * i;
    return { ms, percent: (i / numberOfNotches) * 100 };
  });

  return (
    <div className="rounded-2xl bg-zinc-950 border border-white/10 p-5 space-y-4 shadow-xl">
      {/* 1. Primary Action Row: Clip Name Input + Presets + Create Clip Button */}
      <form onSubmit={handleCreateClip} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pb-3 border-b border-white/10">
        {/* Name input */}
        <div className="relative flex-1">
          <Scissors className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={clipTitle}
            onChange={(e) => setClipTitle(e.target.value)}
            placeholder="Name your clip (optional, e.g. Opening Hook)..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900/90 border border-white/15 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
          />
        </div>

        {/* Duration Quick Presets */}
        <div className="flex items-center space-x-1 bg-zinc-900/90 border border-white/10 p-1 rounded-xl shrink-0">
          <span className="text-[10px] text-zinc-500 uppercase font-bold px-1.5 hidden md:inline">Presets:</span>
          <button
            type="button"
            onClick={() => setRangePreset(15)}
            title="Set 15s duration from playhead"
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-[11px] font-bold transition-colors cursor-pointer"
          >
            +15s
          </button>
          <button
            type="button"
            onClick={() => setRangePreset(30)}
            title="Set 30s duration from playhead"
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-[11px] font-bold transition-colors cursor-pointer"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={() => setRangePreset(60)}
            title="Set 60s duration from playhead"
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-[11px] font-bold transition-colors cursor-pointer"
          >
            +60s
          </button>
        </div>

        {/* Create Clip Button */}
        <button
          type="submit"
          disabled={inPointMs >= outPointMs}
          className="flex items-center justify-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 disabled:opacity-40 text-zinc-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all whitespace-nowrap cursor-pointer shrink-0"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Create Clip</span>
          <span className="text-[10px] bg-zinc-950/20 px-1 py-0.2 rounded font-mono">C</span>
        </button>
      </form>

      {/* 2. Precision Timing & Zoom HUD Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
        {/* Selection Range Badges */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Range:</span>

          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-zinc-950 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
            <span className="text-[9px] text-zinc-500 font-normal">IN</span>
            <span>{formatMsToTimestamp(inPointMs, false)}</span>
          </div>

          <span className="text-zinc-600 font-bold">→</span>

          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-zinc-950 border border-rose-500/30 text-rose-400 font-mono text-xs font-bold">
            <span className="text-[9px] text-zinc-500 font-normal">OUT</span>
            <span>{formatMsToTimestamp(outPointMs, false)}</span>
          </div>

          <span className="text-zinc-600 font-bold">•</span>

          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-black">
            <span className="text-[9px] text-amber-400/80 font-normal uppercase">Length</span>
            <span>{formatMsToTimestamp(selectionDuration, false)}</span>
          </div>

          {/* Quick Audition Button */}
          {(() => {
            const isAuditioning =
              isPlaying &&
              auditionRange !== null &&
              auditionRange.startMs === inPointMs &&
              auditionRange.endMs === outPointMs;
            return (
              <button
                type="button"
                onClick={() => {
                  const mediaEl = typeof document !== 'undefined'
                    ? document.querySelector<HTMLMediaElement>('#clipping-studio-player-media')
                    : null;
                  if (isAuditioning) {
                    if (mediaEl && !mediaEl.paused) mediaEl.pause();
                  } else if (mediaEl) {
                    mediaEl.currentTime = inPointMs / 1000;
                    const p = mediaEl.play();
                    if (p !== undefined) p.catch(console.warn);
                  }
                  auditionRangeAction(inPointMs, outPointMs);
                }}
                title={isAuditioning ? 'Pause playback' : 'Audition selection in player'}
                className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                  isAuditioning
                    ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-md shadow-amber-400/20'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-white/10'
                }`}
              >
                {isAuditioning ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 ml-0.5" />
                    <span>Audition</span>
                  </>
                )}
              </button>
            );
          })()}

          {createdToast && (
            <span className="flex items-center space-x-1 text-emerald-400 text-xs font-bold ml-2 animate-in fade-in duration-200">
              <Check className="w-3.5 h-3.5" />
              <span>Added!</span>
            </span>
          )}
        </div>

        {/* Playhead Timecode & Zoom Controls */}
        <div className="flex items-center space-x-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center space-x-1.5 font-mono text-xs">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Playhead:</span>
            <span className="text-amber-400 font-bold bg-zinc-950 px-2 py-0.5 rounded-lg border border-white/10 text-xs">
              {formatMsToTimestamp(currentTimeMs)}
            </span>
          </div>

          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setZoomLevel(zoomLevel - 1)}
              disabled={zoomLevel <= 1}
              title="Zoom Out (-)"
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-300 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1.5 text-zinc-400 font-bold">{zoomLevel}x</span>
            <button
              type="button"
              onClick={() => setZoomLevel(zoomLevel + 1)}
              disabled={zoomLevel >= 5}
              title="Zoom In (+)"
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-300 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Interactive Track Area */}
      <div className="relative pt-6 pb-2 select-none overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div
          ref={timelineRef}
          onMouseDown={handleMouseDown}
          className="relative h-16 w-full bg-zinc-900/90 rounded-xl border border-white/10 cursor-pointer overflow-hidden shadow-inner"
        >
          {/* Time Ruler Notches & Timecodes */}
          <div className="absolute top-0 inset-x-0 h-4 border-b border-white/5 pointer-events-none flex">
            {notches.map((notch, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 border-l border-white/10 text-[9px] font-mono text-zinc-500 pl-1"
                style={{ left: `${notch.percent}%` }}
              >
                {idx % 2 === 0 ? formatMsToTimestamp(notch.ms, false).slice(0, 5) : ''}
              </div>
            ))}
          </div>

          {/* Synthetic Audio Waveform visualization */}
          <div className="absolute inset-x-0 bottom-1 top-5 flex items-end justify-between px-1 space-x-0.5 opacity-30 pointer-events-none">
            {Array.from({ length: 64 }).map((_, i) => {
              // Deterministic pseudo-random heights
              const height = 15 + Math.abs(Math.sin(i * 1.8 + (i % 5)) * 70);
              return (
                <div
                  key={i}
                  className="flex-1 bg-amber-400 rounded-t-sm"
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          {/* Active In-Out Range Highlight Area */}
          <div
            className="absolute top-0 bottom-0 bg-amber-400/20 border-l-2 border-r-2 border-amber-400 pointer-events-none shadow-lg transition-all"
            style={{
              left: `${inPercent}%`,
              width: `${selectionWidth}%`,
            }}
          >
            {/* Range Label */}
            <div className="absolute top-1 left-2 text-[10px] font-mono text-amber-300 font-bold bg-black/60 px-1 rounded">
              {formatMsToTimestamp(selectionDuration, false)}
            </div>
          </div>

          {/* In-Point Marker Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-emerald-500 text-zinc-950 flex items-center justify-center cursor-ew-resize rounded-l pointer-events-auto shadow-md"
            style={{ left: `${inPercent}%` }}
            title={`In Point: ${formatMsToTimestamp(inPointMs)} (Drag or press 'I')`}
          >
            <span className="text-[8px] font-black leading-none">I</span>
          </div>

          {/* Out-Point Marker Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-rose-500 text-zinc-950 flex items-center justify-center cursor-ew-resize rounded-r pointer-events-auto shadow-md"
            style={{ left: `${outPercent}%` }}
            title={`Out Point: ${formatMsToTimestamp(outPointMs)} (Drag or press 'O')`}
          >
            <span className="text-[8px] font-black leading-none">O</span>
          </div>

          {/* Playhead Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] pointer-events-none z-10"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="w-3 h-3 bg-white -ml-1.25 -mt-1 rounded-full shadow border border-black" />
          </div>
        </div>
      </div>

      {/* 4. Keyboard Shortcuts Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-1 border-t border-white/5">
        <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">Space</kbd> Play/Pause</span>
        <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">I</kbd> Set In</span>
        <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">O</kbd> Set Out</span>
        <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">←</kbd> / <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">→</kbd> Step 1 Frame</span>
        <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">C</kbd> Create Clip</span>
      </div>
    </div>
  );
};
