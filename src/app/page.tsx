'use client';
import { accountCache } from '@/lib/account-cache';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Info,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Trash2,
  ArrowRight,
  ArrowLeft,
  PlusCircle,
  Clock,
  Film,
  Scissors,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';
import { Navbar } from '@/components/Navbar';
import { SiteLoader } from '@/components/SiteLoader';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DashboardView } from '@/components/DashboardView';
import { ProjectCreator } from '@/components/ProjectCreator';
import { LandingHero } from '@/components/LandingHero';
import { ProjectHeader } from '@/components/ProjectHeader';
import { TimelineCoverageBar } from '@/components/TimelineCoverageBar';
import { SemanticSearchBox } from '@/components/SemanticSearchBox';
import { TopicFilterBar } from '@/components/TopicFilterBar';
import { ClipCard } from '@/components/ClipCard';
import { AnalysisProgressCard } from '@/components/AnalysisProgressCard';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
import { ClipEditorModal } from '@/components/ClipEditorModal';
import { SubtitlePreviewModal } from '@/components/SubtitlePreviewModal';
import { OllamaModelModal } from '@/components/OllamaModelModal';
import { filterCandidatesByTopic, sortCandidates, SortField } from '@/lib/ranking';
import { ClipCandidate, Project, SubtitleStyle, TopicCategory } from '@/lib/types';
import { downloadSrtDirectly, triggerBrowserDownload } from '@/lib/download-client';
import { createCaptionProjectFromClip } from '@/lib/caption-maker/clip-to-reel';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';

async function fetchJsonWithTimeout(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The server returned ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The request took too long. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');

  const { user, isLoading: authLoading, checkAuth, openAuthModal } = useAuthStore();
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [workspaceRetry, setWorkspaceRetry] = useState(0);

  // Modals & Active Selections
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [showOllamaModal, setShowOllamaModal] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('llama3.2');
  const [previewCandidate, setPreviewCandidate] = useState<ClipCandidate | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<ClipCandidate | null>(null);
  const [subtitlesCandidate, setSubtitlesCandidate] = useState<ClipCandidate | null>(null);

  // Filters & Sorting
  const [selectedTopic, setSelectedTopic] = useState<TopicCategory | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortField>('score');
  const [globalLang, setGlobalLang] = useState<'en' | 'hi'>('en');

  // Async States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [localUploadProgress, setLocalUploadProgress] = useState<number | null>(null);
  const localUploadAbortController = useRef<AbortController | null>(null);
  const [renderingClipIds, setRenderingClipIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch System Status
  const fetchSystemStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      if (data.status === 'ok') {
        setSystemStatus(data);
        const currentModel = data.ollama?.model || data.gemini?.model;
        if (currentModel) {
          setSelectedOllamaModel(currentModel);
        }
      }
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    }
  }, []);

  // Fetch Projects List
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, []);

  // Refresh active project state
  const refreshActiveProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (data.success && data.project) {
        setActiveProject(data.project);
        setProjects((prev) =>
          prev.map((p) => (p.id === data.project.id ? data.project : p))
        );
        if (
          data.project.status === 'COMPLETED' ||
          data.project.status === 'ERROR'
        ) {
          setIsAnalyzing(false);
        }
      }
    } catch (err) {
      console.error('Failed to refresh project:', err);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        setLoading(true);
        setWorkspaceLoadError(null);

        // Resolve auth first, then let system status load without blocking the workspace.
        await checkAuth();
        if (!active) return;

        // Projects are private. A 401 is normal for signed-out visitors, so do not
        // request them while the public landing page is being bootstrapped.
        if (!useAuthStore.getState().user) {
          setProjects([]);
          return;
        }

        void fetchJsonWithTimeout('/api/system')
          .then((sysData) => {
            if (!active || sysData.status !== 'ok') return;
            setSystemStatus(sysData);
            const currentModel = sysData.ollama?.model || sysData.gemini?.model;
            if (currentModel) {
              setSelectedOllamaModel(currentModel);
            }
          })
          .catch((err) => console.warn('System status is currently unavailable:', err));

        const projData = await fetchJsonWithTimeout('/api/projects');
        if (!projData.success) {
          throw new Error(projData.error || 'Could not load your projects.');
        }
        if (active) {
          setProjects(projData.projects || []);
        }
      } catch (err) {
        if (active) {
          setWorkspaceLoadError(
            err instanceof Error ? err.message : 'Could not load your workspace.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, [checkAuth, workspaceRetry]);

  // The legacy My Projects screen has been removed; keep old bookmarks usable.
  useEffect(() => {
    if (view === 'projects') {
      router.replace('/');
    }
  }, [router, view]);

  // Sync active project if URL requests clip-finder and none is active
  useEffect(() => {
    if (view === 'clip-finder' && !activeProject && projects.length > 0) {
      setActiveProject(projects[0]);
    }
  }, [view, activeProject, projects]);

  // Auto-poll when processing or analyzing
  useEffect(() => {
    if (!activeProject) return;
    const isBusy =
      isAnalyzing ||
      activeProject.status === 'TRANSCRIBING' ||
      activeProject.status === 'ANALYZING' ||
      activeProject.status === 'RANKING' ||
      activeProject.status === 'VERIFYING' ||
      activeProject.status === 'RENDERING';

    if (!isBusy) return;

    const interval = setInterval(() => {
      refreshActiveProject(activeProject.id);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeProject?.id, activeProject?.status, isAnalyzing, refreshActiveProject]);

  // Handler: Run Full AI Analysis
  const handleRunAnalysis = async () => {
    if (!activeProject) return;
    try {
      setIsAnalyzing(true);
      showToast('Starting AI audio extraction & video analysis...', 'info');

      const res = await fetch(`/api/projects/${activeProject.id}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Analysis failed to start');
      }

      showToast('Analysis is in progress. Polling for real-time updates...', 'info');
      refreshActiveProject(activeProject.id);
    } catch (err: any) {
      setIsAnalyzing(false);
      showToast(err.message, 'error');
    }
  };

  // Handler: Render Clip
  const handleRenderClip = async (candidateId: string, openPreview = false) => {
    if (!activeProject) return;
    try {
      setRenderingClipIds((prev) => [...prev, candidateId]);
      showToast('Rendering clip with FFmpeg...', 'info');

      const res = await fetch(`/api/projects/${activeProject.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();

      if (data.success && data.project) {
        setActiveProject(data.project);
        showToast('Clip render complete!', 'success');
        if (openPreview) {
          const updatedCandidate = data.project.candidates.find(
            (c: ClipCandidate) => c.id === candidateId
          );
          if (updatedCandidate) {
            setPreviewCandidate(updatedCandidate);
          }
        }
      } else {
        throw new Error(data.error || 'Render failed');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRenderingClipIds((prev) => prev.filter((id) => id !== candidateId));
      refreshActiveProject(activeProject.id);
    }
  };

  // Handler: Upload local file for YouTube project
  const handleUploadLocalFileForYouTube = async (file: File) => {
    if (!activeProject) return;
    setLocalUploadProgress(0);
    const controller = new AbortController();
    localUploadAbortController.current = controller;
    try {
      showToast(`Uploading source video (${file.name})...`, 'info');
      const data = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        project?: Project;
      }>(`/api/projects/${activeProject.id}/upload`, file, setLocalUploadProgress, undefined, controller.signal);
      if (data.success && data.project) {
        setLocalUploadProgress(100);
        setActiveProject(data.project);
        refreshActiveProject(activeProject.id);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err: any) {
      if (err instanceof UploadCancelledError) {
        try {
          await fetch(`/api/projects/${activeProject.id}/upload`, { method: 'DELETE' });
        } catch {
          // The incomplete stream is removed by the upload route; the next refresh can reconcile status.
        }
        showToast('Source video upload cancelled.', 'info');
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      localUploadAbortController.current = null;
      setLocalUploadProgress(null);
    }
  };

  // Handler: Download SRT Subtitle
  const handleDownloadSrt = async (candidate: ClipCandidate) => {
    let segmentsForSrt = activeProject?.transcript || [];

    if (activeProject?.id) {
      try {
        const res = await fetch(`/api/projects/${activeProject.id}/clip-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clipId: candidate.id,
            start: candidate.start,
            end: candidate.end,
          }),
        });
        const data = await res.json();
        if (data?.success && Array.isArray(data.syncedSegments) && data.syncedSegments.length > 0) {
          segmentsForSrt = data.syncedSegments.map((s: any, idx: number) => ({
            id: `sync_${idx + 1}`,
            start: candidate.start + s.start,
            end: candidate.start + s.end,
            text: s.textHindi || s.textEnglish || '',
          }));
        }
      } catch {}
    }

    downloadSrtDirectly(
      segmentsForSrt,
      candidate.start,
      candidate.end,
      candidate.title
    );
    showToast('SRT subtitle file downloaded!', 'success');
  };

  // Handler: Render All Selected Clips
  const handleRenderAllSelected = async () => {
    if (!activeProject) return;
    try {
      setIsRendering(true);
      showToast('Batch rendering selected clips with FFmpeg...', 'info');

      const res = await fetch(`/api/projects/${activeProject.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderAllSelected: true }),
      });
      const data = await res.json();

      if (data.success && data.project) {
        setActiveProject(data.project);
        showToast('Batch rendering completed!', 'success');
      } else {
        throw new Error(data.error || 'Batch render failed');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsRendering(false);
      refreshActiveProject(activeProject.id);
    }
  };

  // Handler: Export ZIP
  const handleExportZip = () => {
    if (!activeProject) return;
    const a = document.createElement('a');
    a.href = `/api/projects/${activeProject.id}/export-zip`;
    a.download = `${activeProject.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_clips.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Handler: Open in AI Reel Maker
  const handleCreateReel = async (candidate: ClipCandidate, lang: 'en' | 'hi' = 'en') => {
    const projIdParam = activeProject?.id ? `projectId=${encodeURIComponent(activeProject.id)}&` : '';
    try {
      showToast('Extracting audio for selected clip...', 'info');

      let audioOverride;
      if (activeProject?.id) {
        try {
          const res = await fetch(`/api/projects/${activeProject.id}/clip-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clipId: candidate.id,
              start: candidate.start,
              end: candidate.end,
            }),
          });
          const data = await res.json();
          if (data?.success && data.audioUrl) {
            audioOverride = {
              audioUrl: data.audioUrl,
              storagePath: data.audioPath,
              duration: data.duration,
              fileSize: data.fileSize,
              syncedSegments: data.syncedSegments,
              rawTranscriptHindi: data.rawTranscriptHindi,
              rawTranscriptEnglish: data.rawTranscriptEnglish,
              titleHindi: data.titleHindi,
              titleEnglish: data.titleEnglish,
              isAudioSynced: data.isAudioSynced,
            };
          }
        } catch (e) {
          console.warn('Clip audio sync endpoint returned error, using fallback', e);
        }
      }

      const captionProject = createCaptionProjectFromClip(
        candidate,
        activeProject,
        lang,
        audioOverride
      );
      accountCache.setItem('reel_caption_project_v2', JSON.stringify(captionProject));
      router.push(`/reel-maker?${projIdParam}clipId=${encodeURIComponent(candidate.id)}&lang=${lang}`);
    } catch (err: any) {
      console.error('Failed to create caption project:', err);
      router.push(`/reel-maker?${projIdParam}clipId=${encodeURIComponent(candidate.id)}&lang=${lang}`);
    }
  };

  // Handler: Open in AI Social Post Generator
  const handleOpenSocialPost = (candidate: ClipCandidate, lang: 'en' | 'hi' = 'en') => {
    const projIdParam = activeProject?.id ? `projectId=${encodeURIComponent(activeProject.id)}&` : '';
    router.push(`/social-post?${projIdParam}clipId=${encodeURIComponent(candidate.id)}&lang=${lang}`);
  };

  // Handler: Toggle Select
  const handleToggleSelect = (candidateId: string) => {
    if (!activeProject) return;
    const updatedCandidates = activeProject.candidates.map((c) =>
      c.id === candidateId ? { ...c, selected: !c.selected } : c
    );
    const updated = { ...activeProject, candidates: updatedCandidates };
    setActiveProject(updated);

    fetch(`/api/projects/${activeProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: updatedCandidates }),
    });
  };

  // Handler: Select / Deselect All
  const handleSelectAll = (select: boolean) => {
    if (!activeProject) return;
    const updatedCandidates = activeProject.candidates.map((c) => ({
      ...c,
      selected: select,
    }));
    const updated = { ...activeProject, candidates: updatedCandidates };
    setActiveProject(updated);

    fetch(`/api/projects/${activeProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: updatedCandidates }),
    });
  };

  // Handler: Delete Project
  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project and all its rendered files?')) {
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Project deleted', 'info');
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (activeProject?.id === projectId) {
          const remaining = projects.filter((p) => p.id !== projectId);
          setActiveProject(remaining.length > 0 ? remaining[0] : null);
        }
        try {
          const cached = accountCache.getItem('reel_caption_project_v2');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.sourceProjectId === projectId || parsed?.id === projectId) {
              accountCache.removeItem('reel_caption_project_v2');
              accountCache.removeItem('reel_caption_project_v1');
              window.dispatchEvent(new CustomEvent('reel_project_updated'));
            }
          }
        } catch {}
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Save candidate boundary edits
  const handleSaveCandidateEdit = (updated: ClipCandidate) => {
    if (!activeProject) return;
    const updatedCandidates = activeProject.candidates.map((c) =>
      c.id === updated.id ? updated : c
    );
    const updatedProj = { ...activeProject, candidates: updatedCandidates };
    setActiveProject(updatedProj);
    setPreviewCandidate(updated);
    showToast('Clip boundaries updated!', 'success');

    fetch(`/api/projects/${activeProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: updatedCandidates }),
    });
  };

  // Handler: Update Subtitle Style
  const handleUpdateSubtitleStyle = (style: SubtitleStyle) => {
    if (!activeProject) return;
    setActiveProject({
      ...activeProject,
      settings: { ...activeProject.settings, subtitleStyle: style },
    });
    showToast('Subtitle styling saved!', 'success');

    fetch(`/api/projects/${activeProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { subtitleStyle: style } }),
    });
  };

  // Calculate topic counts
  const topicCounts: Record<string, number> = {};
  if (activeProject) {
    for (const c of activeProject.candidates) {
      topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
    }
  }

  // Filter & Sort Candidates
  const filteredCandidates = activeProject
    ? filterCandidatesByTopic(activeProject.candidates, selectedTopic)
    : [];
  const displayCandidates = sortCandidates(filteredCandidates, sortBy);
  const allSelected =
    displayCandidates.length > 0 && displayCandidates.every((c) => c.selected);

  // 1. Unauthenticated Visitor Flow -> Public Website Landing Page
  if (authLoading) {
    return <SiteLoader label="Checking your session…" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-white selection:text-zinc-950">
        <Navbar
          systemStatus={systemStatus}
          onNewProject={() => setShowCreatorModal(true)}
          onRefreshSystem={fetchSystemStatus}
          onOpenOllamaModal={() => setShowOllamaModal(true)}
        />
        <LandingHero />
        {showCreatorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <ProjectCreator
              onProjectCreated={(id) => {
                setShowCreatorModal(false);
                refreshActiveProject(id);
                fetchProjects();
              }}
              onClose={() => setShowCreatorModal(false)}
            />
          </div>
        )}
      </div>
    );
  }

  // 2. Authenticated Dashboard Flow -> Left Sidebar DashboardLayout
  const isClipFinder = view === 'clip-finder';

  return (
    <DashboardLayout
      title={
        isClipFinder
          ? 'Clip Finder'
          : 'Dashboard'
      }
      subtitle={
        isClipFinder && activeProject
          ? activeProject.title
          : isClipFinder
          ? 'Select a project to find viral clips'
          : `Welcome back, ${user.name}`
      }
      breadcrumbs={
        isClipFinder
          ? activeProject
            ? [
                { label: 'Dashboard', href: '/' },
                { label: 'Clip Finder' },
                { label: activeProject.title },
              ]
            : [{ label: 'Dashboard', href: '/' }, { label: 'Clip Finder' }]
          : undefined
      }
      onNewProject={() => setShowCreatorModal(true)}
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium flex items-center space-x-2.5 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-red-950/90 border-red-500/40 text-red-200'
                : 'bg-zinc-900/90 border-white/20 text-white'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
            {toastMessage.type === 'info' && <Info className="w-4 h-4 text-white" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {loading ? (
        <SiteLoader
          label="Loading your workspace…"
          fullScreen={false}
          showBrand={false}
          className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40"
        />
      ) : workspaceLoadError ? (
        <div
          role="alert"
          className="mx-auto flex min-h-56 max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/25 bg-zinc-900/70 p-6 text-center"
        >
          <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-zinc-100">Workspace didn’t load</h2>
          <p className="max-w-md text-sm text-zinc-400">{workspaceLoadError}</p>
          <button
            type="button"
            onClick={() => setWorkspaceRetry((attempt) => attempt + 1)}
            className="mt-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Try again
          </button>
        </div>
      ) : isClipFinder && activeProject ? (
        /* ─── Active Project Studio (Clip Finder View) ──────────────────────── */
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
          {/* Top Bar with Project Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <button
              onClick={() => {
                setActiveProject(null);
                router.push('/');
              }}
              className="flex items-center space-x-2 text-xs font-semibold text-zinc-300 hover:text-white px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Back to Dashboard</span>
            </button>

            {projects.length > 1 && (
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs max-w-full [scrollbar-width:none]">
                <span className="text-zinc-500 font-semibold uppercase flex items-center space-x-1 shrink-0">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Projects:</span>
                </span>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
                      p.id === activeProject.id
                        ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm font-semibold'
                        : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => setActiveProject(p)}
                      className="truncate max-w-[160px] cursor-pointer"
                    >
                      {p.title}
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      className="text-zinc-500 hover:text-rose-400 p-0.5 rounded cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 1. Project Header & Control Bar */}
          <ProjectHeader
            project={activeProject}
            onRunAnalysis={handleRunAnalysis}
            onRenderAllSelected={handleRenderAllSelected}
            onExportZip={handleExportZip}
            onUploadLocalFileForYouTube={handleUploadLocalFileForYouTube}
            onCancelLocalFileUpload={() => localUploadAbortController.current?.abort()}
            isUploadingLocalFile={localUploadProgress !== null}
            localUploadProgress={localUploadProgress ?? 0}
            isAnalyzing={isAnalyzing}
            isRendering={isRendering}
            onOpenGeminiModal={() => setShowOllamaModal(true)}
          />

          {/* 2. Timeline Coverage Bar */}
          {activeProject.timelineCoverage && activeProject.timelineCoverage.totalSeconds > 0 && (
            <TimelineCoverageBar
              coverage={activeProject.timelineCoverage}
              candidates={activeProject.candidates}
              onSelectCandidate={(c) => setPreviewCandidate(c)}
              status={activeProject.status}
              progress={activeProject.progress}
              statusMessage={activeProject.statusMessage}
            />
          )}

          {/* 3. Semantic Transcript Search */}
          {activeProject.transcript.length > 0 && (
            <SemanticSearchBox
              projectId={activeProject.id}
              onJumpToTimestamp={(start, end) => {
                setPreviewCandidate({
                  id: `search_preview_${Date.now()}`,
                  title: 'Search Match Preview',
                  start,
                  end,
                  duration: end - start,
                  topic: 'Other',
                  explanation: 'Semantic match preview',
                  transcript: '',
                  firstWords: '',
                  lastWords: '',
                  scores: {
                    meaningAndDepth: 20,
                    standaloneCompleteness: 15,
                    openingStrength: 10,
                    emotionalIntellectualImpact: 10,
                    clarity: 8,
                    conciseness: 8,
                    audioQuality: 5,
                    total: 76,
                  },
                  contextVerification: {
                    isCompleteThought: true,
                    hasConclusion: true,
                    hasDanglingPronouns: false,
                    contextConfidence: 85,
                    notes: 'Custom preview from search',
                    flaggedForReview: false,
                  },
                  selected: false,
                });
              }}
              onCreateClipFromSearch={(start, end, snippet) => {
                const newCandidate: ClipCandidate = {
                  id: `custom_clip_${Date.now()}`,
                  title: `Discovered Moment (${Math.round(start)}s)`,
                  start: Math.round(start * 10) / 10,
                  end: Math.round(end * 10) / 10,
                  duration: Math.round((end - start) * 10) / 10,
                  topic: 'Motivation',
                  explanation: 'Found via semantic search',
                  transcript: snippet,
                  firstWords: snippet.split(' ').slice(0, 5).join(' '),
                  lastWords: snippet.split(' ').slice(-5).join(' '),
                  scores: {
                    meaningAndDepth: 22,
                    standaloneCompleteness: 18,
                    openingStrength: 13,
                    emotionalIntellectualImpact: 14,
                    clarity: 9,
                    conciseness: 9,
                    audioQuality: 5,
                    total: 90,
                  },
                  contextVerification: {
                    isCompleteThought: true,
                    hasConclusion: true,
                    hasDanglingPronouns: false,
                    contextConfidence: 92,
                    notes: 'Created from semantic transcript search query.',
                    flaggedForReview: false,
                  },
                  selected: true,
                  renderStatus: 'idle',
                };

                const updatedCandidates = [newCandidate, ...activeProject.candidates];
                setActiveProject({ ...activeProject, candidates: updatedCandidates });
                fetch(`/api/projects/${activeProject.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ candidates: updatedCandidates }),
                });
                showToast('Candidate clip added!', 'success');
              }}
            />
          )}

          {/* 4. Filter & Sort Toolbar */}
          <TopicFilterBar
            selectedTopic={selectedTopic}
            onSelectTopic={setSelectedTopic}
            topicCounts={topicCounts}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onSelectAll={() => handleSelectAll(true)}
            onDeselectAll={() => handleSelectAll(false)}
            allSelected={allSelected}
            totalCandidates={activeProject.candidates.length}
            language={globalLang}
            onLanguageChange={setGlobalLang}
          />

          {/* 5. Analysis Progress Card */}
          {activeProject.status !== 'COMPLETED' && (
            <AnalysisProgressCard project={activeProject} />
          )}

          {/* 6. Candidate Cards Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium px-1">
              <span>
                Showing {displayCandidates.length} of {activeProject.candidates.length} Clips
              </span>
              <span>
                Selected:{' '}
                {activeProject.candidates.filter((c) => c.selected).length}
              </span>
            </div>

            {displayCandidates.length === 0 ? (
              <div className="text-center py-16 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <p className="text-zinc-400 text-xs">
                  No clips match the selected filter. Try choosing "All" or running an AI analysis.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayCandidates.map((candidate, idx) => (
                  <ClipCard
                    key={candidate.id}
                    candidate={candidate}
                    rank={idx + 1}
                    onToggleSelect={handleToggleSelect}
                    onPlayPreview={(c) => setPreviewCandidate(c)}
                    onEditBoundaries={(c) => setEditingCandidate(c)}
                    onPreviewSubtitles={(c) => setSubtitlesCandidate(c)}
                    onRenderClip={(id) => handleRenderClip(id, true)}
                    onDownloadSrt={handleDownloadSrt}
                    onCreateReel={handleCreateReel}
                    isRenderingThis={renderingClipIds.includes(candidate.id)}
                    globalLang={globalLang}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : isClipFinder ? (
        /* ─── Clip Finder Hub (When no active project is selected) ────────── */
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-400" />
                <span>AI Clip Finder</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Viral Moments Detector
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Select an analyzed video project to inspect viral moments, or analyze a new video.
              </p>
            </div>
            <button
              onClick={() => setShowCreatorModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Analyze New Video</span>
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-20 bg-zinc-900/30 border border-zinc-800 rounded-3xl p-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/20">
                <Scissors className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">No Videos Analyzed Yet</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Paste a YouTube URL or upload a long video/audio file to automatically detect 60-second viral clips with synchronized subtitles.
                </p>
              </div>
              <button
                onClick={() => setShowCreatorModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-black font-bold text-xs rounded-xl hover:bg-amber-300 transition-all cursor-pointer shadow-md"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Analyze Your First Video</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">
                Select a Project to Open in Clip Finder:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="group bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-400/40 rounded-2xl p-5 transition-all shadow-md flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-400 flex items-center justify-center border border-amber-400/20">
                          <Film className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {p.status}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-2">
                          {p.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>{p.candidates?.length || 0} viral clips identified</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveProject(p)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      <span>Open in Clip Finder</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── Default Workspace Dashboard: Our Work & Studios ─────────────── */
        <div className="max-w-7xl mx-auto space-y-8">
          <DashboardView
            userName={user.name}
            projects={projects}
            onOpenProject={(p) => {
              setActiveProject(p);
              router.push('/?view=clip-finder');
            }}
            onDeleteProject={handleDeleteProject}
            onNewProject={() => setShowCreatorModal(true)}
            ollamaModel={systemStatus?.ollama?.model || selectedOllamaModel}
          />
        </div>
      )}

      {/* Modal: Project Creator */}
      {showCreatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <ProjectCreator
            onProjectCreated={(id) => {
              setShowCreatorModal(false);
              refreshActiveProject(id);
              fetchProjects();
            }}
            onClose={() => setShowCreatorModal(false)}
          />
        </div>
      )}

      {/* Modal: Video Player & Subtitles Overlay Preview */}
      {previewCandidate && activeProject && (
        <VideoPlayerModal
          project={activeProject}
          candidate={previewCandidate}
          onClose={() => setPreviewCandidate(null)}
          onEdit={(c) => {
            setPreviewCandidate(null);
            setEditingCandidate(c);
          }}
          onRenderClip={(id) => handleRenderClip(id, true)}
          onDownloadSrt={handleDownloadSrt}
          isRendering={renderingClipIds.includes(previewCandidate.id)}
        />
      )}

      {/* Modal: Boundary Trim Editor */}
      {editingCandidate && activeProject && (
        <ClipEditorModal
          key={editingCandidate.id}
          project={activeProject}
          candidate={editingCandidate}
          onSave={handleSaveCandidateEdit}
          onClose={() => setEditingCandidate(null)}
        />
      )}

      {/* Modal: Subtitle Preview & Styling */}
      {subtitlesCandidate && activeProject && (
        <SubtitlePreviewModal
          project={activeProject}
          candidate={subtitlesCandidate}
          onUpdateStyle={handleUpdateSubtitleStyle}
          onClose={() => setSubtitlesCandidate(null)}
        />
      )}

      {/* Modal: Ollama AI Model Selector */}
      <OllamaModelModal
        isOpen={showOllamaModal}
        onClose={() => setShowOllamaModal(false)}
        currentModel={activeProject?.settings?.aiModel || selectedOllamaModel || systemStatus?.ollama?.model || 'llama3.2'}
        onModelSaved={(newModel) => {
          setSelectedOllamaModel(newModel);
          if (activeProject) {
            setActiveProject((prev) =>
              prev
                ? {
                    ...prev,
                    settings: {
                      ...prev.settings,
                      aiModel: newModel,
                    },
                  }
                : null
            );
          }
          fetchSystemStatus();
          showToast(`Ollama model set to ${newModel}`, 'success');
        }}
      />
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={<SiteLoader label="Opening your workspace…" />}
    >
      <DashboardPageContent />
    </Suspense>
  );
}
