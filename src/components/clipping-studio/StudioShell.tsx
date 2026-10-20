'use client';

import React, { useEffect, useState } from 'react';
import { StudioNavbar } from './StudioNavbar';
import { ProjectDashboard } from './ProjectDashboard';
import { MediaLibrary } from './MediaLibrary';
import { MediaPlayerPreview } from './MediaPlayerPreview';
import { InteractiveTimeline } from './InteractiveTimeline';
import { BulkTimestampEditor } from './BulkTimestampEditor';
import { ClipsLibrary } from './ClipsLibrary';
import { MergeStudio } from './MergeStudio';
import { ExportStudio } from './ExportStudio';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import {
  Film,
  Scissors,
  Layers,
  Download,
  FolderOpen,
  Sparkles,
  FolderPlus,
} from 'lucide-react';

interface StudioShellProps {
  children?: React.ReactNode; // AI candidates explorer
}

export const StudioShell: React.FC<StudioShellProps> = ({ children }) => {
  const {
    activeTab,
    setActiveTab,
    activeProject,
    initializeStore,
    isLoading,
  } = useClippingStore();

  const [viewMode, setViewMode] = useState<'studio' | 'ai_candidates'>('studio');

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-medium">Initializing ReelSpark Clipping Studio...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col selection:bg-amber-500/30">
      {/* Studio Header & Navigation with Integrated Mode Switcher */}
      <StudioNavbar viewMode={viewMode} onToggleViewMode={setViewMode} />

      {/* Main Content Area */}
      <main className="flex-1">
        {viewMode === 'ai_candidates' ? (
          /* Render existing AI candidates UI */
          <div className="max-w-[1600px] mx-auto p-4">{children}</div>
        ) : activeTab === 'dashboard' ? (
          <ProjectDashboard />
        ) : !activeProject ? (
          /* Friendly No-Project Guidance State */
          <div className="max-w-md mx-auto my-20 p-8 rounded-2xl bg-zinc-900/40 border border-white/10 text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">No Project Open</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Select an existing project from the Projects tab or create a new one to access media, clipping tools, and export recipes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Go to Projects Dashboard</span>
            </button>
          </div>
        ) : (
          /* Editor Workspaces (Phases 2 - 4) */
          <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  {activeProject.name}
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight capitalize mt-0.5">
                  {activeTab === 'media' && 'Media Library & Inspector'}
                  {activeTab === 'timeline' && 'Timeline & Bulk Timestamp Clipping'}
                  {activeTab === 'merge' && 'Merge Studio (Sequence Builder)'}
                  {activeTab === 'export' && 'Export Queue & Job Manager'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>All Projects</span>
              </button>
            </div>

            {/* Media Library View (Phase 2) */}
            {activeTab === 'media' && <MediaLibrary />}

            {/* Timeline, Player & Bulk Clips Workspace (Phase 2) */}
            {activeTab === 'timeline' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* Player Preview */}
                  <div className="xl:col-span-6">
                    <MediaPlayerPreview />
                  </div>

                  {/* Interactive Timeline & Range Markers */}
                  <div className="xl:col-span-6">
                    <InteractiveTimeline />
                  </div>
                </div>

                {/* Bulk Timestamp Range Editor */}
                <BulkTimestampEditor />

                {/* Clips Library List */}
                <ClipsLibrary />
              </div>
            )}

            {/* Merge Studio (Phase 3) */}
            {activeTab === 'merge' && <MergeStudio />}

            {/* Export Studio (Phase 4) */}
            {activeTab === 'export' && <ExportStudio />}
          </div>
        )}
      </main>
    </div>
  );
};
