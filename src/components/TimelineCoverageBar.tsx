'use client';

import React, { useState, useRef } from 'react';
import { CheckCircle2, Award, Clock } from 'lucide-react';
import { ClipCandidate, TimelineCoverage } from '@/lib/types';

interface TimelineCoverageBarProps {
  coverage: TimelineCoverage;
  candidates: ClipCandidate[];
  onSelectCandidate?: (candidate: ClipCandidate) => void;
  status?: string;
  progress?: number;
  statusMessage?: string;
}

export const TimelineCoverageBar: React.FC<TimelineCoverageBarProps> = ({
  coverage,
  candidates,
  onSelectCandidate,
  status = 'COMPLETED',
  progress = 100,
  statusMessage,
}) => {
  const totalSec = Math.max(1, coverage.totalSeconds || 7200);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const discoveryMessage =
    statusMessage || `Successfully discovered ${candidates.length} high-impact clips across the full speech.`;

  // Deterministic realistic speech waveform envelope
  const totalBars = 110;
  const waveformBars = Array.from({ length: totalBars }).map((_, i) => {
    const wave =
      Math.sin(i * 0.35) * 0.25 +
      Math.sin(i * 0.85) * 0.2 +
      Math.cos(i * 1.7) * 0.15 +
      0.5;
    const heightPct = Math.max(22, Math.min(92, Math.round(wave * 100)));

    const tickPosPct = (i / totalBars) * 100;
    const isCovered = coverage.ranges.some(([s, e]) => {
      const sPct = (s / totalSec) * 100;
      const ePct = (e / totalSec) * 100;
      return tickPosPct >= sPct && tickPosPct <= ePct;
    });

    return { heightPct, isCovered };
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    setHoverX(x);
    setHoverTime(pct * totalSec);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  return (
    <div className="w-full rounded-2xl bg-zinc-900/90 border border-white/10 p-5 sm:p-6 space-y-4 shadow-2xl">
      {/* Top Header: Completed Badge, Percentage, & Discovery Message */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-3.5">
          <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-inner">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 shadow-sm">
                {status}
              </span>
              <span className="text-sm font-bold text-white tracking-tight">
                {progress}%
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-normal">
              {discoveryMessage}
            </p>
          </div>
        </div>

        {/* Legend Pills */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-zinc-400 sm:justify-end">
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-950/80 border border-white/5">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
            <span>Analyzed Audio</span>
          </span>
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-950/80 border border-white/5">
            <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
            <span className="text-amber-300 font-semibold">Top Score (≥90)</span>
          </span>
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-950/80 border border-white/5">
            <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />
            <span className="text-emerald-300">Highlight Clips</span>
          </span>
        </div>
      </div>

      {/* Subtle Gradient Glow Divider */}
      <div className="w-full h-1 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 opacity-60" />

      {/* Timeline Section */}
      <div className="rounded-xl bg-zinc-950/90 border border-white/10 p-4 space-y-3 shadow-inner">
        {/* Title & Total Duration Header */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-semibold text-zinc-200 tracking-tight">
              Source Timeline Coverage ({coverage.coveragePercent}% Analyzed)
            </span>
            <span className="hidden sm:inline-block text-[11px] px-2 py-0.2 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {candidates.length} Clips
            </span>
          </div>

          <div className="flex items-center space-x-1.5 text-zinc-400 font-mono text-xs">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Total: {formatTime(totalSec)}</span>
          </div>
        </div>

        {/* Studio Timeline Track */}
        <div
          ref={trackRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative w-full h-11 sm:h-12 bg-black/80 rounded-xl border border-white/10 px-2 flex items-center overflow-visible select-none cursor-crosshair group shadow-inner"
        >
          {/* Subtle Analyzed Region Underlay */}
          {coverage.ranges.map(([s, e], idx) => {
            const leftPct = (s / totalSec) * 100;
            const widthPct = Math.max(0.5, ((e - s) / totalSec) * 100);
            return (
              <div
                key={idx}
                className="absolute inset-y-0 bg-teal-500/10 pointer-events-none"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            );
          })}

          {/* Realistic Multi-Frequency Waveform Bars */}
          <div className="absolute inset-x-2 inset-y-1.5 flex items-center justify-between gap-[2px] pointer-events-none">
            {waveformBars.map((bar, i) => (
              <div
                key={i}
                style={{ height: `${bar.heightPct}%` }}
                className={`w-[2px] sm:w-[2.5px] rounded-full transition-all duration-300 ${
                  bar.isCovered
                    ? 'bg-gradient-to-t from-emerald-500/60 to-teal-400/80 shadow-[0_0_2px_rgba(45,212,191,0.4)]'
                    : 'bg-zinc-800/60'
                }`}
              />
            ))}
          </div>

          {/* Candidate Clip Markers Overlay */}
          {candidates.map((c, idx) => {
            const leftPct = (c.start / totalSec) * 100;
            const rawWidth = ((c.end - c.start) / totalSec) * 100;
            const widthPct = Math.max(1.4, rawWidth);
            const isTopScore = c.scores.total >= 90;
            const isGoodScore = c.scores.total >= 80;

            return (
              <div
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectCandidate) {
                    onSelectCandidate(c);
                  }
                }}
                className={`group/clip absolute top-1 bottom-1 rounded-md transition-all cursor-pointer z-10 flex items-center justify-center overflow-visible ${
                  isTopScore
                    ? 'bg-amber-400/30 hover:bg-amber-400/45 border-t-2 border-amber-400 border-x border-b border-amber-400/40 hover:shadow-lg hover:shadow-amber-500/30 hover:scale-y-110'
                    : isGoodScore
                    ? 'bg-emerald-400/25 hover:bg-emerald-400/40 border-t-2 border-emerald-400 border-x border-b border-emerald-400/30 hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-y-110'
                    : 'bg-sky-400/20 hover:bg-sky-400/35 border-t-2 border-sky-400 border-x border-b border-sky-400/30 hover:scale-y-110'
                }`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                {/* Micro Score Badge if clip width allows */}
                {widthPct >= 2.8 && (
                  <span className="text-[9px] font-mono font-bold text-white/95 pointer-events-none drop-shadow">
                    {c.scores.total}
                  </span>
                )}

                {/* Rich Hover Popover */}
                <div className="hidden group-hover/clip:flex flex-col space-y-1.5 absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-40 pointer-events-none w-56 sm:w-64 p-3 rounded-xl bg-zinc-950/95 text-white text-xs border border-white/20 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      #{idx + 1} • {c.topic}
                    </span>
                    <span className="flex items-center space-x-1 text-[11px] font-bold text-amber-400">
                      <Award className="w-3 h-3 text-amber-400" />
                      <span>{c.scores.total}/100</span>
                    </span>
                  </div>

                  <p className="font-bold text-zinc-100 text-xs line-clamp-1 leading-snug">
                    {c.title}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1 border-t border-white/10">
                    <span>
                      {formatTime(c.start)} → {formatTime(c.end)}
                    </span>
                    <span className="text-emerald-400 font-semibold font-mono">
                      {c.duration.toFixed(0)}s
                    </span>
                  </div>

                  <div className="text-[9px] text-zinc-500 italic text-center pt-0.5">
                    Click to play clip preview
                  </div>
                </div>
              </div>
            );
          })}

          {/* Interactive Live Hover Playhead Cursor */}
          {hoverTime !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-30"
              style={{ left: `${hoverX}px` }}
            >
              <div className="w-[1.5px] h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-white text-zinc-950 text-[10px] font-mono font-bold shadow-lg pointer-events-none whitespace-nowrap">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}
        </div>

        {/* Timestamp Ruler & Micro Ticks */}
        <div className="relative pt-1 px-1 text-[10px] font-mono text-zinc-500">
          <div className="flex items-center justify-between">
            <span className="hover:text-zinc-300 transition-colors">00:00</span>
            <span className="hidden sm:inline hover:text-zinc-300 transition-colors">
              {formatTime(totalSec * 0.25)}
            </span>
            <span className="hover:text-zinc-300 transition-colors">
              {formatTime(totalSec * 0.5)}
            </span>
            <span className="hidden sm:inline hover:text-zinc-300 transition-colors">
              {formatTime(totalSec * 0.75)}
            </span>
            <span className="hover:text-zinc-300 transition-colors">
              {formatTime(totalSec)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
