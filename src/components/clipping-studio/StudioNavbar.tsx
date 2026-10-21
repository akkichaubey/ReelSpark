'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Film,
  Server,
  Database,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Layers,
  Scissors,
  Download,
  Plus,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Undo2,
  Redo2,
  RotateCcw,
  Edit2,
  Check,
  Trash2,
} from 'lucide-react';
import { useClippingStore, StudioTab } from '@/lib/clipping-studio/use-clipping-store';

interface StudioNavbarProps {
  viewMode?: 'studio' | 'ai_candidates';
  onToggleViewMode?: (mode: 'studio' | 'ai_candidates') => void;
}

export const StudioNavbar: React.FC<StudioNavbarProps> = ({
  viewMode = 'studio',
  onToggleViewMode,
}) => {
  const {
    activeTab,
    setActiveTab,
    activeProject,
    mediaServiceStatus,
    supabaseStatus,
    checkServices,
    isCheckingHealth,
    renameProject,
    createProject,
    deleteProject,
    undo,
    redo,
    canUndo,
    canRedo,
    hasCrashRecovery,
    restoreCrashRecovery,
    dismissCrashRecovery,
  } = useClippingStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState(activeProject?.name || '');

  // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeProject && projectTitle.trim()) {
      renameProject(activeProject.id, projectTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const ffmpegOk = mediaServiceStatus?.ffmpeg?.available;
  const ffprobeOk = mediaServiceStatus?.ffprobe?.available;
  const isLocalServiceOnline = ffmpegOk && ffprobeOk;

  const tabs: { id: StudioTab; label: string; icon: React.ReactNode; num: string }[] = [
    { id: 'dashboard', label: 'Projects', icon: <FolderOpen className="w-3.5 h-3.5" />, num: '1' },
    { id: 'media', label: 'Media Library', icon: <Film className="w-3.5 h-3.5" />, num: '2' },
    { id: 'timeline', label: 'Timeline & Clips', icon: <Scissors className="w-3.5 h-3.5" />, num: '3' },
    { id: 'merge', label: 'Merge Studio', icon: <Layers className="w-3.5 h-3.5" />, num: '4' },
    { id: 'export', label: 'Export Queue', icon: <Download className="w-3.5 h-3.5" />, num: '5' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-md border-b border-white/[0.08] px-4 sm:px-6 py-2">
      <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Left: Studio Branding & Active Project Indicator */}
        <div className="flex items-center space-x-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-amber-500/20">
              <Film className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm tracking-tight text-white">ReelSpark</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Studio
              </span>
            </div>
          </div>

          {/* Active Project Title & Quick Actions */}
          {activeProject ? (
            <div className="flex items-center space-x-2 pl-3 border-l border-white/10">
              {isEditingTitle ? (
                <form onSubmit={handleTitleSubmit} className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    autoFocus
                    onBlur={handleTitleSubmit}
                    className="px-2 py-0.5 text-xs bg-zinc-900 border border-amber-400 rounded text-white focus:outline-none"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProjectTitle(activeProject.name);
                    setIsEditingTitle(true);
                  }}
                  title="Click to rename project"
                  className="group flex items-center space-x-1 text-xs font-semibold text-zinc-200 hover:text-white max-w-[140px] sm:max-w-[200px] truncate transition-colors text-left"
                >
                  <span className="truncate">{activeProject.name}</span>
                  <Edit2 className="w-3 h-3 text-zinc-500 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}

              {/* Undo / Redo / Delete controls */}
              <div className="flex items-center space-x-0.5">
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={() => undo()}
                  title="Undo last action (Ctrl+Z)"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 transition-colors cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={() => redo()}
                  title="Redo action (Ctrl+Y or Ctrl+Shift+Z)"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 transition-colors cursor-pointer"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete project "${activeProject.name}"?`)) {
                      deleteProject(activeProject.id);
                    }
                  }}
                  title="Delete current project"
                  className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Center: Main Workflow Tabs (No scrollbar, high contrast, clean DAW feel) */}
        <nav className="flex items-center space-x-1 bg-zinc-900/90 p-1 rounded-xl border border-white/10 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-w-full">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-amber-300 text-zinc-950 font-extrabold shadow-md shadow-amber-500/20'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                    isActive ? 'bg-zinc-950/20 text-zinc-950' : 'bg-zinc-800 text-zinc-400 border border-white/5'
                  }`}
                >
                  {tab.num}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right: Workspace Switcher, Health & Studio Bridges */}
        <div className="flex items-center space-x-2 w-full lg:w-auto justify-between lg:justify-end">
          {/* Integrated Workspace Mode Switcher (Clean, saves 40px vertical space) */}
          {onToggleViewMode && (
            <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => onToggleViewMode('studio')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'studio'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Scissors className="w-3 h-3 text-amber-400" />
                <span>Studio</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleViewMode('ai_candidates')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'ai_candidates'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>AI Moments</span>
              </button>
            </div>
          )}

          {/* Local Media Engine Status Pill */}
          <button
            type="button"
            onClick={() => checkServices()}
            disabled={isCheckingHealth}
            title={`Local Media Engine: ${isLocalServiceOnline ? 'Connected' : 'Offline'} (127.0.0.1)\nFFmpeg: ${mediaServiceStatus?.ffmpeg?.version || 'N/A'}\nClick to refresh`}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-zinc-900/80 hover:bg-zinc-800/80 border-white/10 text-zinc-300 transition-colors cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLocalServiceOnline
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="hidden xl:inline text-[11px] font-semibold">
              {isLocalServiceOnline ? 'Engine Ready' : 'Engine Offline'}
            </span>
            <RefreshCw
              className={`w-3 h-3 text-zinc-400 hover:text-zinc-200 ${isCheckingHealth ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Quick Studio Apps Bridge */}
          <div className="flex items-center space-x-1 bg-zinc-900/80 p-0.5 rounded-lg border border-white/10">
            <Link
              href="/caption-maker"
              title="Open AI Reel Caption Maker"
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Captions</span>
            </Link>
            <Link
              href="/social-post"
              title="Open AI Social Post Generator"
              className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-sky-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Crash Recovery Notification Banner */}
      {hasCrashRecovery && (
        <div className="mt-2 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg w-full">
          <div className="flex items-center space-x-2 text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">Autosave Snapshot Available:</span>
            <span className="text-zinc-300">A newer recovery state was preserved from your previous session.</span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => restoreCrashRecovery()}
              className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              Restore Work
            </button>
            <button
              type="button"
              onClick={() => dismissCrashRecovery()}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
