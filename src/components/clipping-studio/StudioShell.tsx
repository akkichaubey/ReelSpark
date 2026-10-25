'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardLayout } from '../dashboard/DashboardLayout';
import { MediaLibrary } from './MediaLibrary';
import { MediaPlayerPreview } from './MediaPlayerPreview';
import { InteractiveTimeline } from './InteractiveTimeline';
import { BulkTimestampEditor } from './BulkTimestampEditor';
import { ClipsLibrary } from './ClipsLibrary';
import { MergeStudio } from './MergeStudio';
import { ExportStudio } from './ExportStudio';
import { useClippingStore, StudioTab } from '@/lib/clipping-studio/use-clipping-store';
import { syncStorageReferenceInventory } from '@/lib/storage-reference-client';
import {
  Film,
  Scissors,
  Layers,
  Download,
  ScanSearch,
  Edit2,
  Undo2,
  Redo2,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface StudioShellProps {
  children?: React.ReactNode; // AI candidates explorer
}

export const StudioShell: React.FC<StudioShellProps> = ({ children }) => {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const {
    activeTab,
    setActiveTab,
    activeProject,
    projects,
    createProject,
    initializeStore,
    isLoading,
    mediaServiceStatus,
    checkServices,
    isCheckingHealth,
    renameProject,
    deleteProject,
    undo,
    redo,
    canUndo,
    canRedo,
    hasCrashRecovery,
    restoreCrashRecovery,
    dismissCrashRecovery,
  } = useClippingStore();

  const [viewMode, setViewMode] = useState<'studio' | 'ai_candidates'>('studio');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState(activeProject?.name || '');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  useEffect(() => {
    if (isLoading) return;
    const timer = window.setTimeout(() => {
      void syncStorageReferenceInventory('clipping-studio', projects);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isLoading, projects]);

  // Synchronize tab from URL query param if present
  useEffect(() => {
    if (tabParam && ['media', 'timeline', 'merge', 'export'].includes(tabParam)) {
      setActiveTab(tabParam as StudioTab);
    }
  }, [tabParam, setActiveTab]);

  useEffect(() => {
    if (activeProject) {
      setProjectTitle(activeProject.name);
    }
  }, [activeProject?.name]);

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

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    createProject(name, newProjectDescription.trim() || undefined);
    setNewProjectName('');
    setNewProjectDescription('');
    setShowCreateProject(false);
  };

  const ffmpegOk = mediaServiceStatus?.ffmpeg?.available;
  const ffprobeOk = mediaServiceStatus?.ffprobe?.available;
  const isLocalServiceOnline = ffmpegOk && ffprobeOk;

  const tabs: { id: StudioTab; label: string; icon: React.ReactNode; num: string }[] = [
    { id: 'media', label: 'Media Library', icon: <Film className="w-3.5 h-3.5" />, num: '1' },
    { id: 'timeline', label: 'Timeline & Clips', icon: <Scissors className="w-3.5 h-3.5" />, num: '2' },
    { id: 'merge', label: 'Merge Studio', icon: <Layers className="w-3.5 h-3.5" />, num: '3' },
    { id: 'export', label: 'Export Queue', icon: <Download className="w-3.5 h-3.5" />, num: '4' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-medium">Initializing ReelMaker Clipping Studio...</p>
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Video & Audio Studio"
      subtitle={activeProject ? activeProject.name : 'Desktop DAW Trimming, Merging & Multi-Clip Export'}
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Video & Audio Studio' },
        ...(activeProject ? [{ label: activeProject.name }] : []),
      ]}
      contentFullWidth
    >
      <div className="flex flex-col min-h-full">
        {/* Workspace Secondary Toolbar */}
        <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Left: Active Project Title & Undo/Redo */}
          <div className="flex items-center space-x-2">
            {activeProject ? (
              <div className="flex items-center space-x-2">
                {isEditingTitle ? (
                  <form onSubmit={handleTitleSubmit} className="flex items-center space-x-1">
                    <input
                      type="text"
                      value={projectTitle}
                      onChange={(e) => setProjectTitle(e.target.value)}
                      autoFocus
                      onBlur={handleTitleSubmit}
                      className="px-2 py-0.5 text-xs bg-zinc-950 border border-amber-400 rounded text-white focus:outline-none"
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
                    className="group flex items-center space-x-1 text-xs font-semibold text-zinc-200 hover:text-white max-w-[160px] truncate transition-colors text-left cursor-pointer"
                  >
                    <span className="truncate">{activeProject.name}</span>
                    <Edit2 className="w-3 h-3 text-zinc-500 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}

                {/* Undo / Redo / Delete */}
                <div className="flex items-center space-x-0.5 pl-1 border-l border-zinc-800">
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
            ) : (
              <span className="text-xs text-zinc-400 font-medium">ReelMaker Clipping Workspace</span>
            )}
          </div>

          {/* Center: Workflow Tabs */}
          <nav className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-amber-400 text-black font-extrabold shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                      isActive ? 'bg-black/20 text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                    }`}
                  >
                    {tab.num}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Right: Mode Switcher & Media Engine Status */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowCreateProject(true)}
              className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-200 text-zinc-950 transition-colors cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>New Project</span>
            </button>
            {children && (
              <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setViewMode('studio')}
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
                  onClick={() => setViewMode('ai_candidates')}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    viewMode === 'ai_candidates'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ScanSearch className="w-3 h-3 text-amber-400" />
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
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700/60 text-zinc-300 transition-colors cursor-pointer"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLocalServiceOnline
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-[11px] font-semibold">
                {isLocalServiceOnline ? 'Engine Ready' : 'Engine Offline'}
              </span>
              <RefreshCw
                className={`w-3 h-3 text-zinc-400 hover:text-zinc-200 ${isCheckingHealth ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Crash Recovery Notification Banner */}
        {hasCrashRecovery && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 sm:px-6 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg w-full">
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

        {/* Main Content Area */}
        <div className="flex-1">
          {viewMode === 'ai_candidates' ? (
            /* Render existing AI candidates UI */
            <div className="max-w-[1600px] mx-auto p-4">{children}</div>
          ) : !activeProject ? (
            /* Friendly No-Project Guidance State */
            <div className="max-w-md mx-auto my-20 p-8 rounded-2xl bg-zinc-900/40 border border-white/10 text-center space-y-4 shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Film className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">No Project Open</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Create a clipping project to import media, mark clips, and build export recipes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateProject(true)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Film className="w-4 h-4" />
                <span>Create Clipping Project</span>
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
        </div>

        {showCreateProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white">Create Clipping Project</h2>
                <p className="mt-1 text-xs text-zinc-400">Start a workspace for media, clips, and export recipes.</p>
              </div>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label htmlFor="clipping-project-name" className="mb-1 block text-xs font-semibold text-zinc-300">Project name</label>
                  <input
                    id="clipping-project-name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Podcast highlights"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-white/15 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="clipping-project-description" className="mb-1 block text-xs font-semibold text-zinc-300">Description (optional)</label>
                  <textarea
                    id="clipping-project-description"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    rows={2}
                    placeholder="Add editorial notes or a topic summary..."
                    className="w-full resize-none rounded-xl border border-white/15 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreateProject(false)} className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700">Cancel</button>
                  <button type="submit" className="rounded-xl bg-white px-5 py-2 text-xs font-bold text-zinc-950 hover:bg-zinc-200">Create &amp; Open</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};
