'use strict';
'use client';

import React, { useRef, useState, useMemo } from 'react';
import { CaptionGroup, TranscriptWord } from '@/lib/caption-maker/types';
import {
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Scissors,
  GripVertical,
  Clock,
  Wand2,
  Star,
  Target,
  X,
  Trash2,
} from 'lucide-react';
import {
  nudgeWordTiming,
  shiftWordTiming,
  snapWordToTime,
  autoDistributeGroupWords,
} from '@/lib/caption-maker/timing-adjuster';
import {
  updateWordInGroups,
  deleteWordFromGroups,
} from '@/lib/caption-maker/caption-grouping';

interface CaptionTimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  groups: CaptionGroup[];
  trimRange?: { start: number; end: number };
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onTrimChange?: (trimStart: number, trimEnd: number) => void;
  onUpdateGroups?: (updatedGroups: CaptionGroup[]) => void;
  onSelectWord?: (wordId: string | null) => void;
  onOpenSmartEditor?: () => void;
  showCaptionWords?: boolean;
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
  trimRange,
  onSeek,
  onTogglePlay,
  onTrimChange,
  onUpdateGroups,
  onSelectWord,
  onOpenSmartEditor,
  showCaptionWords = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = fit, 2 = 2x, 3 = 3x
  const [activeDrag, setActiveDrag] = useState<'scrub' | 'start' | 'end' | 'word-start' | 'word-end' | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [activeWordDragId, setActiveWordDragId] = useState<string | null>(null);

  const safeDuration = duration > 0 ? duration : 0;

  // Active trim bounds
  const activeStart = Math.max(0, trimRange?.start ?? 0);
  const activeEnd =
    trimRange?.end && trimRange.end > 0
      ? Math.min(safeDuration, trimRange.end)
      : safeDuration;
  const isTrimmed = safeDuration > 0 && (activeStart > 0.05 || activeEnd < safeDuration - 0.05);
  const trimmedDuration = Math.max(0, activeEnd - activeStart);

  // Flatten all words for timeline visualization and magnetic snapping
  const allWords = useMemo(() => {
    const list: TranscriptWord[] = [];
    groups.forEach((g) => {
      g.words.forEach((w) => list.push(w));
    });
    return list;
  }, [groups]);

  const selectedWord = useMemo(() => {
    if (!selectedWordId) return null;
    return allWords.find((w) => w.id === selectedWordId) || null;
  }, [allWords, selectedWordId]);

  const selectedGroup = useMemo(() => {
    if (!selectedWordId) return null;
    return groups.find((g) => g.words.some((w) => w.id === selectedWordId)) || null;
  }, [groups, selectedWordId]);

  const waveformBars = STATIC_WAVEFORM_BARS;

  const getTimeFromEvent = (e: React.PointerEvent<HTMLDivElement>): number => {
    if (!containerRef.current || safeDuration <= 0) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.min(Math.max(0, clickX / rect.width), 1);
    return percentage * safeDuration;
  };

  // Magnetic snapping to word boundaries within 0.25 seconds
  const snapToWordBoundary = (time: number): number => {
    const snapThreshold = 0.25;
    let closestTime = time;
    let minDiff = snapThreshold;

    for (const w of allWords) {
      const diffStart = Math.abs(w.start - time);
      if (diffStart < minDiff) {
        minDiff = diffStart;
        closestTime = w.start;
      }
      const diffEnd = Math.abs(w.end - time);
      if (diffEnd < minDiff) {
        minDiff = diffEnd;
        closestTime = w.end;
      }
    }

    return closestTime;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeDrag) return;
    if (!containerRef.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setActiveDrag('scrub');
    const targetTime = getTimeFromEvent(e);
    onSeek(targetTime);
  };

  const handleStartHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setActiveDrag('start');
  };

  const handleEndHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setActiveDrag('end');
  };

  const handleWordEdgePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    wordId: string,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setActiveDrag(edge === 'start' ? 'word-start' : 'word-end');
    setActiveWordDragId(wordId);
    setSelectedWordId(wordId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDrag || safeDuration <= 0) return;

    const rawTime = getTimeFromEvent(e);

    if (activeDrag === 'scrub') {
      onSeek(rawTime);
    } else if (activeDrag === 'start') {
      const snapped = snapToWordBoundary(rawTime);
      const clampedStart = Math.max(0, Math.min(snapped, activeEnd - 0.5));
      const rounded = Number(clampedStart.toFixed(2));
      onTrimChange?.(rounded, activeEnd);
      onSeek(rounded);
    } else if (activeDrag === 'end') {
      const snapped = snapToWordBoundary(rawTime);
      const clampedEnd = Math.min(safeDuration, Math.max(snapped, activeStart + 0.5));
      const rounded = Number(clampedEnd.toFixed(2));
      onTrimChange?.(activeStart, rounded);
      onSeek(rounded);
    } else if (activeDrag === 'word-start' && activeWordDragId && onUpdateGroups) {
      const targetWord = allWords.find((w) => w.id === activeWordDragId);
      if (targetWord) {
        const clampedStart = Math.max(0, Math.min(rawTime, targetWord.end - 0.05));
        const roundedStart = Number(clampedStart.toFixed(2));
        const updated = updateWordInGroups(groups, activeWordDragId, { start: roundedStart });
        onUpdateGroups(updated);
        onSeek(roundedStart);
      }
    } else if (activeDrag === 'word-end' && activeWordDragId && onUpdateGroups) {
      const targetWord = allWords.find((w) => w.id === activeWordDragId);
      if (targetWord) {
        const clampedEnd = Math.min(safeDuration, Math.max(rawTime, targetWord.start + 0.05));
        const roundedEnd = Number(clampedEnd.toFixed(2));
        const updated = updateWordInGroups(groups, activeWordDragId, { end: roundedEnd });
        onUpdateGroups(updated);
        onSeek(roundedEnd);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeDrag) {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      setActiveDrag(null);
      setActiveWordDragId(null);
    }
  };

  const handleResetTrim = () => {
    onTrimChange?.(0, safeDuration);
    onSeek(0);
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
  const startPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (activeStart / safeDuration) * 100)) : 0;
  const endPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (activeEnd / safeDuration) * 100)) : 100;

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 p-3 select-none flex flex-col gap-2 shadow-2xl">
      {/* Top Bar: Playback Controls, Timer, Trim Info, Zoom */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={() => onSeek(activeStart)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Restart from active clip start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Current / Duration Timer */}
          <div className="font-mono text-xs text-zinc-300 flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg">
            <span className="text-amber-400 font-semibold">{formatSec(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{formatSec(safeDuration)}</span>
          </div>

          {/* Trimming info indicator & 1-click Reset */}
          <div className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] border transition-colors ${
                isTrimmed
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800'
              }`}
            >
              <Scissors className="w-3 h-3 text-amber-400" />
              <span>
                Clip: {trimmedDuration.toFixed(1)}s ({formatSec(activeStart)} - {formatSec(activeEnd)})
              </span>
            </div>

            {isTrimmed && (
              <button
                type="button"
                onClick={handleResetTrim}
                className="text-[10px] text-zinc-400 hover:text-amber-300 underline cursor-pointer"
                title="Reset clip trimming to full length"
              >
                Reset Trim
              </button>
            )}
          </div>
        </div>

        {/* Actions: AI Smart Edit & Zoom Controls */}
        <div className="flex items-center gap-2.5">
          {onOpenSmartEditor && (
            <button
              type="button"
              onClick={onOpenSmartEditor}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 text-amber-300 border border-amber-500/40 text-[11px] font-semibold transition-all cursor-pointer shadow-sm"
              title="Open AI Smart Silence Trimmer & Viral Hook Studio"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Smart Edit</span>
            </button>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-[11px] text-zinc-500 hidden sm:inline">Zoom:</span>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                className="p-1 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
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
                className="p-1 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
                disabled={zoomLevel >= 3}
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Word Timing Studio Inspector Toolbar */}
      {showCaptionWords && selectedWord && onUpdateGroups && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-gradient-to-r from-amber-500/15 via-zinc-900 to-zinc-950 border border-amber-500/40 rounded-xl animate-in fade-in duration-150">
          {/* Word info and edit */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono font-bold bg-amber-400 text-black px-1.5 py-0.5 rounded shrink-0">
              WORD TIMING
            </span>
            <input
              type="text"
              value={selectedWord.text}
              onChange={(e) => {
                const updated = updateWordInGroups(groups, selectedWord.id, { text: e.target.value });
                onUpdateGroups(updated);
              }}
              className="bg-black/70 border border-zinc-700 focus:border-amber-400 text-amber-300 font-bold text-xs px-2 py-1 rounded max-w-[130px] focus:outline-none"
              title="Edit word text"
            />
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800 shrink-0">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-zinc-200">{selectedWord.start.toFixed(2)}s</span>
              <span>→</span>
              <span className="text-zinc-200">{selectedWord.end.toFixed(2)}s</span>
              <span className="text-amber-400 font-semibold">({(selectedWord.end - selectedWord.start).toFixed(2)}s)</span>
            </div>
          </div>

          {/* Timing Nudge Controls */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {/* Start Nudge */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <span className="text-zinc-500 px-1 font-mono text-[9px]">Start</span>
              <button
                type="button"
                onClick={() => onUpdateGroups(nudgeWordTiming(groups, selectedWord.id, -0.05, 0))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Nudge word start earlier by 0.05s"
              >
                -0.05s
              </button>
              <button
                type="button"
                onClick={() => onUpdateGroups(nudgeWordTiming(groups, selectedWord.id, 0.05, 0))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Nudge word start later by 0.05s"
              >
                +0.05s
              </button>
            </div>

            {/* End Nudge */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <span className="text-zinc-500 px-1 font-mono text-[9px]">End</span>
              <button
                type="button"
                onClick={() => onUpdateGroups(nudgeWordTiming(groups, selectedWord.id, 0, -0.05))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Nudge word end earlier by 0.05s"
              >
                -0.05s
              </button>
              <button
                type="button"
                onClick={() => onUpdateGroups(nudgeWordTiming(groups, selectedWord.id, 0, 0.05))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Nudge word end later by 0.05s"
              >
                +0.05s
              </button>
            </div>

            {/* Whole Word Shift */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <span className="text-zinc-500 px-1 font-mono text-[9px]">Shift</span>
              <button
                type="button"
                onClick={() => onUpdateGroups(shiftWordTiming(groups, selectedWord.id, -0.05))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Shift entire word 0.05s earlier"
              >
                ◀ 0.05s
              </button>
              <button
                type="button"
                onClick={() => onUpdateGroups(shiftWordTiming(groups, selectedWord.id, 0.05))}
                className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded cursor-pointer"
                title="Shift entire word 0.05s later"
              >
                0.05s ▶
              </button>
            </div>

            {/* Snap to Playhead */}
            <button
              type="button"
              onClick={() => onUpdateGroups(snapWordToTime(groups, selectedWord.id, currentTime))}
              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 hover:border-amber-400 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Align word start to current playhead position"
            >
              <Target className="w-3 h-3 text-amber-400" />
              <span>Snap to Playhead</span>
            </button>

            {/* Auto Distribute Group Words */}
            {selectedGroup && selectedGroup.words.length > 1 && (
              <button
                type="button"
                onClick={() => onUpdateGroups(autoDistributeGroupWords(groups, selectedGroup.id))}
                className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                title="Evenly distribute word timestamps across this phrase group"
              >
                <Wand2 className="w-3 h-3 text-amber-400" />
                <span>Auto-Distribute Phrase</span>
              </button>
            )}

            {/* Important Word Toggle */}
            <button
              type="button"
              onClick={() => {
                const updated = updateWordInGroups(groups, selectedWord.id, {
                  isImportant: !selectedWord.isImportant,
                });
                onUpdateGroups(updated);
              }}
              className={`p-1 rounded-lg border cursor-pointer transition-colors ${
                selectedWord.isImportant
                  ? 'bg-amber-400 text-black border-amber-300'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
              title="Toggle highlight punch on this word"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
            </button>

            {/* Delete Word */}
            <button
              type="button"
              onClick={() => {
                const updated = deleteWordFromGroups(groups, selectedWord.id);
                onUpdateGroups(updated);
                setSelectedWordId(null);
              }}
              className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/30 cursor-pointer transition-colors"
              title="Delete word from captions"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Deselect / Close button */}
            <button
              type="button"
              onClick={() => setSelectedWordId(null)}
              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white cursor-pointer transition-colors"
              title="Close word timing inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Interactive Timeline Track Scroll Area */}
      <div className="relative overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-2 custom-scrollbar">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ width: `${zoomLevel * 100}%` }}
          className={`relative ${showCaptionWords ? 'h-28' : 'h-20'} cursor-pointer select-none rounded-lg overflow-hidden bg-zinc-950/90`}
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
            className={`absolute top-5 left-0 right-0 ${showCaptionWords ? 'bottom-11' : 'bottom-1'} flex items-center justify-between px-1 pointer-events-none opacity-40`}
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
          {showCaptionWords && <div
            suppressHydrationWarning
            className="absolute bottom-1 left-0 right-0 h-9 flex items-center px-1"
          >
            {allWords.map((word) => {
              const left = safeDuration > 0 ? Number(((word.start / safeDuration) * 100).toFixed(2)) : 0;
              const width = safeDuration > 0
                ? Number(Math.max(1.2, ((word.end - word.start) / safeDuration) * 100).toFixed(2))
                : 0;
              const isCurrent = currentTime >= word.start && currentTime <= word.end;
              const isSelected = selectedWordId === word.id;

              return (
                <div
                  key={word.id}
                  suppressHydrationWarning
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWordId(word.id);
                    onSeek(word.start);
                    onSelectWord?.(word.id);
                  }}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  title={`${word.text} (${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s) — Click to inspect & drag edges`}
                  className={`absolute h-7 rounded px-1.5 flex items-center justify-between overflow-hidden border text-[10px] font-medium tracking-tight whitespace-nowrap transition-all cursor-pointer select-none group/word ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300 font-bold z-25 shadow-lg shadow-amber-400/30 ring-2 ring-amber-400'
                      : isCurrent
                      ? 'bg-amber-400/90 text-black border-amber-300 font-bold z-10 shadow-sm'
                      : word.isImportant
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                      : 'bg-zinc-800/90 text-zinc-300 border-zinc-700/60 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  {/* Left edge drag handle for start time */}
                  {isSelected && onUpdateGroups && (
                    <div
                      onPointerDown={(e) => handleWordEdgePointerDown(e, word.id, 'start')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 bg-black/80 hover:bg-black rounded-l cursor-ew-resize z-30 flex items-center justify-center border-r border-amber-300 transition-colors"
                      title="Drag left edge to adjust word start time"
                    >
                      <div className="w-[1px] h-3 bg-amber-400" />
                    </div>
                  )}

                  <span className={`truncate px-0.5 ${isSelected ? 'mx-2' : ''}`}>
                    {word.text}
                  </span>

                  {/* Right edge drag handle for end time */}
                  {isSelected && onUpdateGroups && (
                    <div
                      onPointerDown={(e) => handleWordEdgePointerDown(e, word.id, 'end')}
                      className="absolute top-0 bottom-0 right-0 w-2.5 bg-black/80 hover:bg-black rounded-r cursor-ew-resize z-30 flex items-center justify-center border-l border-amber-300 transition-colors"
                      title="Drag right edge to adjust word end time"
                    >
                      <div className="w-[1px] h-3 bg-amber-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>}

          {/* ========================================================================= */}
          {/* TRIM OVERLAYS & INTERACTIVE DRAG HANDLES (VN / Instagram / CapCut Studio)  */}
          {/* ========================================================================= */}

          {/* Left Dimmed Region (0 to start) */}
          {startPercent > 0 && (
            <div
              style={{ left: 0, width: `${startPercent}%` }}
              className="absolute top-0 bottom-0 bg-black/65 backdrop-blur-[1px] pointer-events-none border-r border-amber-500/40 z-10 flex items-center justify-center overflow-hidden"
            >
              {startPercent > 10 && (
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">
                  Trimmed
                </span>
              )}
            </div>
          )}

          {/* Right Dimmed Region (end to 100%) */}
          {endPercent < 100 && (
            <div
              style={{ left: `${endPercent}%`, right: 0 }}
              className="absolute top-0 bottom-0 bg-black/65 backdrop-blur-[1px] pointer-events-none border-l border-amber-500/40 z-10 flex items-center justify-center overflow-hidden"
            >
              {(100 - endPercent) > 10 && (
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">
                  Trimmed
                </span>
              )}
            </div>
          )}

          {/* Active Trim Window Top & Bottom Amber Frame */}
          <div
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
            className="absolute top-0 bottom-0 border-t-2 border-b-2 border-amber-400/80 pointer-events-none z-10"
          />

          {/* Interactive Start Trim Handle (Left Drag Handle) */}
          <div
            onPointerDown={handleStartHandlePointerDown}
            style={{ left: `${startPercent}%` }}
            title={`Drag to adjust clip start (${formatSec(activeStart)})`}
            className="absolute top-0 bottom-0 w-4 bg-amber-400 hover:bg-amber-300 text-black rounded-l-md cursor-ew-resize z-30 flex flex-col items-center justify-center shadow-lg transition-colors group"
          >
            <GripVertical className="w-3.5 h-3.5 stroke-[2.5] text-black/80" />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-400 text-black px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              From: {formatSec(activeStart)}
            </div>
          </div>

          {/* Interactive End Trim Handle (Right Drag Handle) */}
          <div
            onPointerDown={handleEndHandlePointerDown}
            style={{ left: `calc(${endPercent}% - 16px)` }}
            title={`Drag to adjust clip end (${formatSec(activeEnd)})`}
            className="absolute top-0 bottom-0 w-4 bg-amber-400 hover:bg-amber-300 text-black rounded-r-md cursor-ew-resize z-30 flex flex-col items-center justify-center shadow-lg transition-colors group"
          >
            <GripVertical className="w-3.5 h-3.5 stroke-[2.5] text-black/80" />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-400 text-black px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              To: {formatSec(activeEnd)}
            </div>
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
