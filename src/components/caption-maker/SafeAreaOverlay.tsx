'use strict';
'use client';

import React, { useState } from 'react';
import { PlatformPreset } from '@/lib/caption-maker/types';
import {
  getSafeZoneConfig,
  SafeZoneOverrides,
  isVertical916Platform,
} from '@/lib/caption-maker/safe-zone';

export interface SafeAreaOverlayProps {
  aspectRatio: string;
  preset?: PlatformPreset;
  mode?: 'reel' | 'thumbnail';
  showGuides: boolean;
  activeNinePos?: string;
  customOverrides?: SafeZoneOverrides;
  onSelectPlatform?: (platform: PlatformPreset) => void;
}

export const SafeAreaOverlay: React.FC<SafeAreaOverlayProps> = ({
  aspectRatio,
  preset = 'instagram-reel',
  mode = 'reel',
  showGuides,
  activeNinePos,
  customOverrides,
  onSelectPlatform,
}) => {
  const [internalPlatform, setInternalPlatform] = useState<PlatformPreset | null>(null);

  if (!showGuides) return null;

  const activePresetKey: PlatformPreset =
    customOverrides?.platform ||
    internalPlatform ||
    preset ||
    'instagram-reel';

  const is916 = isVertical916Platform(activePresetKey, aspectRatio);
  const is45 = aspectRatio === '4:5' || activePresetKey === 'instagram-portrait';
  const is11 = aspectRatio === '1:1' || activePresetKey === 'instagram-square';
  const is169 = aspectRatio === '16:9' || activePresetKey === 'youtube-landscape';

  const config = getSafeZoneConfig(activePresetKey, customOverrides);

  const handleSwitchPlatform = (p: PlatformPreset) => {
    setInternalPlatform(p);
    onSelectPlatform?.(p);
  };

  const safeWidthPx = Math.round(
    config.baseWidth * (1 - (config.leftMarginPercent + config.rightMarginPercent) / 100)
  );
  const safeHeightPx = Math.round(
    config.baseHeight * (1 - (config.topDangerPercent + config.bottomDangerPercent) / 100)
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden select-none animate-in fade-in duration-200">
      {/* ========================================================= */}
      {/* 9:16 VERTICAL REELS / SHORTS / THREADS                    */}
      {/* ========================================================= */}
      {is916 && (
        <>
          {/* 1. Top Danger Zone */}
          <div
            style={{ height: `${config.topDangerPercent}%` }}
            className="absolute inset-x-0 top-0 bg-red-950/30 border-b border-red-500/40 flex flex-col justify-between px-2.5 py-1 transition-all duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[8.5px] font-mono font-bold tracking-wider text-red-300 bg-red-950/90 px-1.5 py-0.5 rounded border border-red-500/50">
                  TOP UI DANGER ZONE ({config.topDangerPercent}% / ~{Math.round((1920 * config.topDangerPercent) / 100)}px)
                </span>
                <span className="text-[7.5px] font-mono text-zinc-400 bg-black/70 px-1 py-0.5 rounded hidden sm:inline">
                  {config.shortName}
                </span>
              </div>
              <span className="text-[7px] font-mono px-1 py-0.5 rounded bg-zinc-900/90 text-amber-300/90 border border-zinc-700/60 hidden sm:inline">
                {config.sourceLabel}
              </span>
            </div>

            <div className="flex items-center justify-between text-[7.5px] font-mono text-red-400/80">
              <span className="truncate">{config.topDescription}</span>
              <span className="hidden sm:inline">Do not place titles, text or logos here</span>
            </div>
          </div>

          {/* 2. Interactive Platform Quick-Switcher Bar (Float beneath top danger zone) */}
          <div
            style={{ top: `calc(${config.topDangerPercent}% + 4px)` }}
            className="absolute left-2 flex items-center gap-1 z-30 pointer-events-auto"
          >
            <div className="flex items-center bg-black/85 backdrop-blur-md border border-zinc-700/80 rounded-lg p-0.5 shadow-lg">
              {(
                [
                  { id: 'instagram-reel', label: 'IG Reels' },
                  { id: 'facebook-reel', label: 'FB Reels' },
                  { id: 'youtube-short', label: 'YT Shorts' },
                  { id: 'threads-video', label: 'Threads' },
                ] as const
              ).map((p) => {
                const isSelected = activePresetKey === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwitchPlatform(p.id)}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-black font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                    title={`Preview with ${p.label} safe-zone overlay`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Bottom Danger Zone */}
          <div
            style={{ height: `${config.bottomDangerPercent}%` }}
            className="absolute inset-x-0 bottom-0 bg-red-950/30 border-t border-red-500/40 flex flex-col justify-between p-2.5 transition-all duration-150"
          >
            {/* Extended Caption High-Water Warning Line (35% on IG & FB) */}
            {config.bottomWarningPercent && (
              <div
                style={{ bottom: `${config.bottomWarningPercent}%` }}
                className="absolute inset-x-0 border-t border-dashed border-red-400/40 pointer-events-none flex items-center justify-end px-2"
              >
                <span className="text-[7px] font-mono text-red-300/80 bg-red-950/80 px-1 rounded -translate-y-1/2">
                  ▲ Expanded Caption Danger ({config.bottomWarningPercent}%)
                </span>
              </div>
            )}

            {/* Platform UI elements description */}
            <div className="flex items-center justify-between text-[7.5px] font-mono text-red-400/80">
              <span className="truncate">{config.bottomDescription}</span>
              <span className="hidden sm:inline">Keep subtitles above this line</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-mono font-bold tracking-wider text-red-300 bg-red-950/90 px-1.5 py-0.5 rounded border border-red-500/50">
                BOTTOM UI DANGER ZONE ({config.bottomDangerPercent}% / ~{Math.round((1920 * config.bottomDangerPercent) / 100)}px)
              </span>
              <span className="text-[7.5px] font-mono text-red-400/70 hidden sm:inline">
                {config.shortName} UI Overlay
              </span>
            </div>

            {/* YouTube Shorts Scrubber Bar Indicator */}
            {config.hasScrubberBar && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-red-600/90 shadow-sm flex items-center justify-center">
                <span className="text-[6.5px] font-mono text-white/90 bg-black/80 px-1 rounded -translate-y-2">
                  Timeline Scrubber
                </span>
              </div>
            )}
          </div>

          {/* 4. Right Action Bar Rail (Instagram, Facebook & YouTube Shorts) */}
          {config.hasRightActionBar && config.actionBarWidthPercent > 0 && (
            <div
              style={{
                width: `${config.actionBarWidthPercent}%`,
                top: `${config.actionBarTopPercent}%`,
                bottom: `${config.actionBarBottomPercent}%`,
              }}
              className="absolute right-0 bg-amber-950/30 border-l border-amber-500/40 flex flex-col items-center justify-between py-2 transition-all duration-150"
            >
              <span className="text-[7px] font-mono text-amber-300 font-bold -rotate-90 whitespace-nowrap bg-amber-950/90 px-1 py-0.5 rounded border border-amber-500/50 shadow-sm">
                ACTION BAR ({config.actionBarWidthPercent}%)
              </span>
              <div className="flex flex-col gap-1.5 items-center opacity-75">
                {config.actionBarIcons.slice(0, 5).map((ic, i) => (
                  <div
                    key={i}
                    className="w-3.5 h-3.5 rounded-full border border-amber-400/50 flex items-center justify-center text-[7.5px] text-amber-300 bg-amber-950/80"
                  >
                    {ic}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Left Margin Clearance Line */}
          <div
            style={{ left: `${config.leftMarginPercent}%` }}
            className="absolute inset-y-0 border-l border-dashed border-sky-400/20 pointer-events-none"
          />

          {/* 6. 4:5 In-Feed Home Preview Crop Guide (Y: 14.84% to 85.16%) */}
          <div
            style={{
              top: `${config.feedCrop45Percent}%`,
              bottom: `${config.feedCrop45Percent}%`,
            }}
            className="absolute inset-x-0 border-y border-dashed border-purple-400/35 pointer-events-none flex items-start justify-end px-2 pt-0.5"
          >
            <span className="text-[7.5px] font-mono text-purple-300/80 bg-purple-950/80 px-1 py-0.5 rounded border border-purple-500/30">
              4:5 IN-FEED (1080×1350)
            </span>
          </div>

          {/* 7. 1:1 Profile Grid Center Square Crop Guide (Y: 21.875% to 78.125%) */}
          <div
            style={{
              top: `${config.centerSquarePercent}%`,
              bottom: `${config.centerSquarePercent}%`,
            }}
            className="absolute inset-x-0 border-y-2 border-dashed border-emerald-400/60 bg-emerald-950/10 pointer-events-none flex flex-col justify-between p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono font-bold text-emerald-300 bg-emerald-950/90 border border-emerald-400/50 px-1.5 py-0.5 rounded shadow-sm">
                1:1 PROFILE GRID SAFE (1080×1080)
              </span>
              <span className="text-[7px] font-mono text-emerald-400/80 bg-zinc-950/80 px-1 py-0.5 rounded border border-emerald-500/30 hidden sm:inline">
                Center Square
              </span>
            </div>

            {mode === 'thumbnail' && (
              <div className="flex items-end justify-between">
                <span className="text-[7.5px] font-mono font-bold text-white/90 bg-black/70 px-1.5 py-0.5 rounded border border-white/20 flex items-center gap-1">
                  <span>▶</span> 1.2M
                </span>
                <span className="text-[7px] font-mono text-zinc-400 bg-black/60 px-1 py-0.5 rounded">
                  Grid Safe Center
                </span>
              </div>
            )}
          </div>

          {/* 8. Viral Hook & Headline Safe Box */}
          <div
            style={{
              top: `${config.headlineSafeTopPercent}%`,
              bottom: `${100 - config.headlineSafeBottomPercent}%`,
              left: `${config.leftMarginPercent}%`,
              right: `${config.rightMarginPercent}%`,
            }}
            className="absolute border border-dashed border-amber-400/40 rounded-lg pointer-events-none flex items-center justify-center p-1 bg-amber-500/5"
          >
            <span className="text-[7.5px] font-mono font-bold text-amber-300/90 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-500/40 shadow-sm">
              HOOK & HEADLINE SAFE (Y: {config.headlineSafeTopPercent}%-{config.headlineSafeBottomPercent}%)
            </span>
          </div>

          {/* 9. Face & Subject Eye-Line Guide (Rule of Thirds) */}
          <div
            style={{
              top: `${config.subjectEyeLinePercent}%`,
            }}
            className="absolute inset-x-0 border-t border-dotted border-cyan-400/35 pointer-events-none flex items-center justify-start px-2"
          >
            <span className="text-[7px] font-mono text-cyan-300/80 bg-cyan-950/80 px-1 rounded -translate-y-1/2 border border-cyan-500/30">
              Optimal Eye-Level (~{config.subjectEyeLinePercent}%)
            </span>
          </div>

          {/* 10. Central Safe Action Zone */}
          <div
            style={{
              left: `${config.leftMarginPercent}%`,
              right: `${config.rightMarginPercent}%`,
              top: `${config.topDangerPercent}%`,
              bottom: `${config.bottomDangerPercent}%`,
            }}
            className="absolute border-2 border-dashed border-sky-400/50 rounded-xl flex flex-col justify-between p-2 pointer-events-none"
          >
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono text-sky-300 font-bold bg-sky-950/85 border border-sky-400/40 px-1.5 py-0.5 rounded shadow-sm">
                SAFE ACTION ZONE ({safeWidthPx}×{safeHeightPx})
              </span>
              {activeNinePos && (
                <span className="text-[7.5px] font-mono text-amber-400 font-bold bg-zinc-950/90 border border-amber-500/50 px-1.5 py-0.5 rounded">
                  Anchor: {activeNinePos.toUpperCase()}
                </span>
              )}
            </div>

            {/* 9 Anchor Reference Points */}
            {activeNinePos && (
              <div className="absolute inset-2 grid grid-cols-3 grid-rows-3 pointer-events-none">
                {(
                  [
                    'top-left', 'top-center', 'top-right',
                    'center-left', 'center', 'center-right',
                    'bottom-left', 'bottom-center', 'bottom-right',
                  ] as const
                ).map((posKey) => {
                  const isActive = activeNinePos === posKey;
                  return (
                    <div
                      key={posKey}
                      className={`flex items-center justify-center ${
                        posKey.includes('left')
                          ? 'justify-start'
                          : posKey.includes('right')
                          ? 'justify-end'
                          : 'justify-center'
                      } ${
                        posKey.startsWith('top')
                          ? 'items-start'
                          : posKey.startsWith('bottom')
                          ? 'items-end'
                          : 'items-center'
                      }`}
                    >
                      <div
                        className={`transition-all ${
                          isActive
                            ? 'w-3.5 h-3.5 rounded-full bg-amber-400 ring-4 ring-amber-400/30 border border-black shadow-lg animate-pulse'
                            : 'w-1.5 h-1.5 rounded-full bg-white/20'
                        }`}
                        title={`Anchor: ${posKey}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[7px] font-mono text-zinc-400 bg-black/60 px-1 py-0.5 rounded">
                1080×1920 (9:16)
              </span>
              <span className="text-[7.5px] font-mono text-sky-400/80 bg-sky-950/70 px-1 py-0.5 rounded border border-sky-500/25">
                {mode === 'thumbnail' ? 'COVER PREVIEW' : 'REEL PREVIEW'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* 4:5 VERTICAL PORTRAIT (INSTAGRAM FEED POST / COVER)       */}
      {/* ========================================================= */}
      {is45 && (
        <>
          <div
            style={{ height: `${config.topDangerPercent}%` }}
            className="absolute inset-x-0 top-0 bg-red-950/20 border-b border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8.5px] font-mono font-bold tracking-wider text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              TOP HEADER ({config.topDangerPercent}%)
            </span>
            <span className="text-[8px] font-mono text-red-400/70 hidden sm:inline">
              Username & Options
            </span>
          </div>

          <div
            style={{ height: `${config.bottomDangerPercent}%` }}
            className="absolute inset-x-0 bottom-0 bg-red-950/20 border-t border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8.5px] font-mono font-bold tracking-wider text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              BOTTOM ACTION BAR ({config.bottomDangerPercent}%)
            </span>
            <span className="text-[8px] font-mono text-red-400/70 hidden sm:inline">
              Like / Comment / Bookmark
            </span>
          </div>

          <div
            style={{
              top: `${config.centerSquarePercent}%`,
              bottom: `${config.centerSquarePercent}%`,
            }}
            className="absolute inset-x-0 border-y-2 border-dashed border-emerald-400/50 bg-emerald-950/10 flex flex-col justify-between p-2 pointer-events-none"
          >
            <span className="text-[8px] font-mono font-bold text-emerald-300 bg-emerald-950/90 border border-emerald-400/50 px-1.5 py-0.5 rounded self-start">
              1:1 PROFILE GRID SAFE (1080×1080)
            </span>
          </div>

          <div
            style={{
              left: `${config.leftMarginPercent}%`,
              right: `${config.rightMarginPercent}%`,
              top: `${config.topDangerPercent}%`,
              bottom: `${config.bottomDangerPercent}%`,
            }}
            className="absolute border-2 border-dashed border-sky-400/50 rounded-xl flex items-end justify-between p-2 pointer-events-none"
          >
            <span className="text-[8px] font-mono text-sky-300 font-bold bg-sky-950/85 border border-sky-400/40 px-1.5 py-0.5 rounded">
              4:5 PORTRAIT SAFE ZONE ({safeWidthPx}×{safeHeightPx})
            </span>
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* 1:1 SQUARE (INSTAGRAM SQUARE / FEED POST / COVER)        */}
      {/* ========================================================= */}
      {is11 && (
        <>
          <div
            style={{ height: `${config.topDangerPercent}%` }}
            className="absolute inset-x-0 top-0 bg-red-950/20 border-b border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8px] font-mono font-bold text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              HEADER ({config.topDangerPercent}%)
            </span>
          </div>

          <div
            style={{ height: `${config.bottomDangerPercent}%` }}
            className="absolute inset-x-0 bottom-0 bg-red-950/20 border-t border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8px] font-mono font-bold text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              ACTION ROW ({config.bottomDangerPercent}%)
            </span>
          </div>

          <div
            style={{
              left: `${config.leftMarginPercent}%`,
              right: `${config.rightMarginPercent}%`,
              top: `${config.topDangerPercent}%`,
              bottom: `${config.bottomDangerPercent}%`,
            }}
            className="absolute border-2 border-dashed border-sky-400/50 rounded-xl flex items-end justify-between p-2 pointer-events-none"
          >
            <span className="text-[8px] font-mono text-sky-300 font-bold bg-sky-950/85 border border-sky-400/40 px-1.5 py-0.5 rounded">
              1:1 SQUARE FEED SAFE ZONE
            </span>
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* 16:9 WIDESCREEN / LANDSCAPE (YOUTUBE, TWITTER/X, DESKTOP) */}
      {/* ========================================================= */}
      {is169 && (
        <>
          <div
            style={{ height: `${config.topDangerPercent}%` }}
            className="absolute inset-x-0 top-0 bg-red-950/20 border-b border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8px] font-mono font-bold text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              TOP BAR ({config.topDangerPercent}%)
            </span>
            <span className="text-[8px] font-mono text-red-400/70 hidden sm:inline">
              Title, Channel & Share
            </span>
          </div>

          <div
            style={{ height: `${config.bottomDangerPercent}%` }}
            className="absolute inset-x-0 bottom-0 bg-red-950/20 border-t border-red-500/30 flex items-center justify-between px-3"
          >
            <span className="text-[8px] font-mono font-bold text-red-300/90 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
              SCRUBBER & CONTROLS ({config.bottomDangerPercent}%)
            </span>
            <span className="text-[8px] font-mono text-red-400/70 hidden sm:inline">
              Timeline & Fullscreen
            </span>
          </div>

          {mode === 'thumbnail' && (
            <div className="absolute right-[3%] bottom-[3%] w-[16%] h-[13%] bg-black/85 border border-red-500/50 rounded flex items-center justify-center">
              <span className="text-[8px] font-mono font-bold text-red-300">
                12:45 (YT)
              </span>
            </div>
          )}

          <div
            style={{
              left: `${config.leftMarginPercent}%`,
              right: `${config.rightMarginPercent}%`,
              top: `${config.topDangerPercent}%`,
              bottom: `${config.bottomDangerPercent}%`,
            }}
            className="absolute border-2 border-dashed border-sky-400/50 rounded-xl flex items-end justify-between p-2 pointer-events-none"
          >
            <span className="text-[8px] font-mono text-sky-300 font-bold bg-sky-950/85 border border-sky-400/40 px-1.5 py-0.5 rounded">
              16:9 WIDESCREEN SAFE ZONE
            </span>
          </div>
        </>
      )}
    </div>
  );
};
