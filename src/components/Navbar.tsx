'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, Sparkles, CheckCircle2, AlertTriangle, RefreshCw, PlusCircle, ChevronDown } from 'lucide-react';

interface NavbarProps {
  systemStatus: {
    ffmpeg: { available: boolean; version?: string };
    gemini: { configured: boolean; model: string };
  } | null;
  onNewProject: () => void;
  onRefreshSystem: () => void;
  onOpenGeminiModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  systemStatus,
  onNewProject,
  onRefreshSystem,
  onOpenGeminiModal,
}) => {
  const pathname = usePathname();
  const isCaptionMaker = pathname === '/caption-maker';
  const isClipFinder = !isCaptionMaker;

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      {/* Brand & Studio Navigation */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-white/10">
            <Film className="w-5 h-5 text-zinc-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">ReelSpark</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-zinc-200 border border-white/20">
                PRO
              </span>
            </div>
            <p className="text-xs text-zinc-400">Local-First Video & Animated Caption Studio</p>
          </div>
        </div>

        {/* Studio Switcher */}
        <div className="hidden sm:flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 text-xs">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              isClipFinder
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Clip Finder</span>
          </Link>
          <Link
            href="/caption-maker"
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              isCaptionMaker
                ? 'bg-amber-400 text-zinc-950 shadow-sm'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isCaptionMaker ? 'text-zinc-950' : 'text-amber-400'}`} />
            <span>AI Caption Maker</span>
          </Link>
        </div>
      </div>

      {/* System Status Indicators & Actions */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* FFmpeg Indicator */}
        <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-white/10 text-xs">
          <span className="text-zinc-400 font-medium">FFmpeg:</span>
          {systemStatus?.ffmpeg.available ? (
            <span className="flex items-center space-x-1 text-emerald-400 font-semibold" title={systemStatus.ffmpeg.version}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready (v9.0)</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-amber-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Checking...</span>
            </span>
          )}
        </div>

        {/* Gemini Model Selector Indicator */}
        <button
          onClick={onOpenGeminiModal}
          title="Click to Choose Gemini AI Model & Configure Engine"
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 hover:border-sky-400/40 text-xs transition-all group shadow-sm cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform flex-shrink-0" />
          <span className="text-zinc-400 font-medium hidden sm:inline">AI Model:</span>
          {systemStatus?.gemini.configured ? (
            <span className="text-white font-semibold flex items-center gap-1">
              <span>{systemStatus.gemini.model}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
            </span>
          ) : (
            <span className="text-amber-400 font-semibold flex items-center gap-1" title="Running in intelligent local speech mode. Click to configure API key or choose model.">
              <span>{systemStatus?.gemini.model || 'gemini-3.8-flash'}</span>
              <span className="text-[10px] text-amber-500 font-normal hidden xl:inline">(Demo)</span>
              <ChevronDown className="w-3 h-3 text-amber-400/70" />
            </span>
          )}
        </button>

        {/* Refresh System button */}
        <button
          onClick={onRefreshSystem}
          title="Refresh System Status"
          className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* New Project Button */}
        <button
          onClick={onNewProject}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs sm:text-sm shadow-lg shadow-white/5 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>
    </header>
  );
};
