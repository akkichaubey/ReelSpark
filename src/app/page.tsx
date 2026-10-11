'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ProjectCreator } from '@/components/ProjectCreator';
import { ProjectHeader } from '@/components/ProjectHeader';
import { TimelineCoverageBar } from '@/components/TimelineCoverageBar';
import { SemanticSearchBox } from '@/components/SemanticSearchBox';
import { TopicFilterBar } from '@/components/TopicFilterBar';
import { ClipCard } from '@/components/ClipCard';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
import { ClipEditorModal } from '@/components/ClipEditorModal';
import { SubtitlePreviewModal } from '@/components/SubtitlePreviewModal';
import { filterCandidatesByTopic, sortCandidates, SortField } from '@/lib/ranking';
import { ClipCandidate, Project, SubtitleStyle, TopicCategory } from '@/lib/types';
import { downloadSrtDirectly, triggerBrowserDownload } from '@/lib/download-client';
import { createCaptionProjectFromClip } from '@/lib/caption-maker/clip-to-reel';

export default function DashboardPage() {
  const router = useRouter();
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals & Active Selections
  const [showCreatorModal, setShowCreatorModal] = useState(false);
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
        if (data.projects?.length > 0 && !activeProject) {
          setActiveProject(data.projects[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  // Load individual project fresh data
  const refreshActiveProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (data.success && data.project) {
        setActiveProject(data.project);
        setProjects((prev) =>
          prev.map((p) => (p.id === data.project.id ? data.project : p))
        );
      }
    } catch (err) {
      console.error('Failed to refresh project:', err);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const sysRes = await fetch('/api/system');
        const sysData = await sysRes.json();
        if (active && sysData.status === 'ok') {
          setSystemStatus(sysData);
        }
      } catch (err) {
        console.error('Failed to fetch system status:', err);
      }

      try {
        const projRes = await fetch('/api/projects');
        const projData = await projRes.json();
        if (active && projData.success) {
          setProjects(projData.projects || []);
          if (projData.projects?.length > 0) {
            setActiveProject((prev) => prev || projData.projects[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  // Auto-poll when processing
  useEffect(() => {
    if (!activeProject) return;
    const isBusy =
      activeProject.status === 'TRANSCRIBING' ||
      activeProject.status === 'ANALYZING' ||
      activeProject.status === 'RANKING' ||
      activeProject.status === 'VERIFYING' ||
      activeProject.status === 'RENDERING';

    if (!isBusy) return;

    const interval = setInterval(() => {
      refreshActiveProject(activeProject.id);
    }, 2000);

    return () => clearInterval(interval);
  }, [activeProject, refreshActiveProject]);

  // Handler: Run Full AI Analysis
  const handleRunAnalysis = async () => {
    if (!activeProject) return;
    try {
      setIsAnalyzing(true);
      showToast('Starting speech transcription and full video semantic analysis...', 'info');

      const res = await fetch(`/api/projects/${activeProject.id}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success && data.project) {
        setActiveProject(data.project);
        showToast(`Discovered ${data.clipCount} meaningful moments!`, 'success');
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsAnalyzing(false);
      refreshActiveProject(activeProject.id);
    }
  };

  // Handler: Render Individual Clip (with optional auto-download)
  const handleRenderClip = async (clipId: string, autoDownload = false) => {
    if (!activeProject) return;
    try {
      setRenderingClipIds((prev) => [...prev, clipId]);
      showToast('Cutting and re-encoding clip with FFmpeg...', 'info');

      const res = await fetch(`/api/projects/${activeProject.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });
      const data = await res.json();

      if (data.success && data.project) {
        setActiveProject(data.project);
        showToast('Clip rendered successfully!', 'success');

        if (autoDownload) {
          const targetCand = data.project.candidates.find((c: ClipCandidate) => c.id === clipId);
          if (targetCand && targetCand.renderedVideoPath) {
            const relPath =
              targetCand.renderedVideoPath.split('storage/')[1] ||
              targetCand.renderedVideoPath.split('storage\\')[1];
            if (relPath) {
              triggerBrowserDownload(
                `/api/files/${relPath}`,
                `${targetCand.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`
              );
              showToast('Starting MP4 download...', 'success');
            }
          }
        }
      } else {
        throw new Error(data.error || 'Clip render failed');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRenderingClipIds((prev) => prev.filter((id) => id !== clipId));
      refreshActiveProject(activeProject.id);
    }
  };

  // Handler: Instant Download of SRT Subtitles
  const handleDownloadSrt = (candidate: ClipCandidate) => {
    if (!activeProject) return;
    downloadSrtDirectly(
      activeProject.transcript,
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

  // Handler: Open in AI Reel Caption Maker
  const handleCreateReel = async (candidate: ClipCandidate, lang: 'en' | 'hi' = 'en') => {
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
          if (data.success && data.audioUrl) {
            audioOverride = {
              audioUrl: data.audioUrl,
              storagePath: data.audioPath,
              duration: data.duration,
              fileSize: data.fileSize,
            };
          }
        } catch (apiErr) {
          console.warn('Clip audio API extraction failed, using fallback:', apiErr);
        }
      }

      const reelProj = createCaptionProjectFromClip(candidate, activeProject, lang, audioOverride);
      localStorage.setItem('reel_caption_project_v1', JSON.stringify(reelProj));
      showToast('Opening in AI Reel Caption Maker...', 'success');
      router.push('/caption-maker');
    } catch (err: any) {
      console.error('Failed to create reel from clip:', err);
      router.push('/caption-maker');
    }
  };

  // Handler: Upload local file for YouTube project
  const handleUploadLocalFileForYouTube = async (file: File) => {
    if (!activeProject) return;
    try {
      showToast(`Uploading local video ${file.name}...`, 'info');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/projects/${activeProject.id}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.project) {
        setActiveProject(data.project);
        showToast('Local video attached! Ready for rendering.', 'success');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handler: Toggle Select Clip
  const handleToggleSelect = (clipId: string) => {
    if (!activeProject) return;
    const updatedCandidates = activeProject.candidates.map((c) =>
      c.id === clipId ? { ...c, selected: !c.selected } : c
    );
    const updated = { ...activeProject, candidates: updatedCandidates };
    setActiveProject(updated);

    // Persist selection change
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
    const nextProject = { ...activeProject, candidates: updatedCandidates };
    setActiveProject(nextProject);

    fetch(`/api/projects/${activeProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: updatedCandidates }),
    });
    showToast('Clip boundaries updated!', 'success');
  };

  // Handler: Update Subtitle Style
  const handleUpdateSubtitleStyle = (style: SubtitleStyle) => {
    if (!activeProject) return;
    const nextSettings = { ...activeProject.settings, subtitleStyle: style };
    setActiveProject({ ...activeProject, settings: nextSettings });

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

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-white selection:text-zinc-950">
      {/* Navbar */}
      <Navbar
        systemStatus={systemStatus}
        onNewProject={() => setShowCreatorModal(true)}
        onRefreshSystem={fetchSystemStatus}
      />

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
            {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 text-white" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">Loading studio workspace...</p>
          </div>
        ) : !activeProject ? (
          /* Empty State: Create First Project */
          <div className="py-12">
            <ProjectCreator
              onProjectCreated={(id) => {
                setShowCreatorModal(false);
                refreshActiveProject(id);
                fetchProjects();
              }}
            />
          </div>
        ) : (
          /* Active Project Studio View */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Project Switcher Bar if multiple projects exist */}
            {projects.length > 1 && (
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
                <span className="text-zinc-500 font-semibold uppercase flex items-center space-x-1">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Projects:</span>
                </span>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all ${
                      p.id === activeProject.id
                        ? 'bg-zinc-800 text-white border-white/40 shadow-sm'
                        : 'bg-zinc-900/40 text-zinc-400 border-white/5 hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => setActiveProject(p)}
                      className="font-medium truncate max-w-[180px]"
                    >
                      {p.title}
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      className="text-zinc-500 hover:text-red-400 p-0.5 rounded"
                      title="Delete project"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 1. Project Header & Control Bar */}
            <ProjectHeader
              project={activeProject}
              onRunAnalysis={handleRunAnalysis}
              onRenderAllSelected={handleRenderAllSelected}
              onExportZip={handleExportZip}
              onUploadLocalFileForYouTube={handleUploadLocalFileForYouTube}
              isAnalyzing={isAnalyzing}
              isRendering={isRendering}
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

            {/* 4. Topic Filter & Sort Controls */}
            {activeProject.candidates.length > 0 && (
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
            )}

            {/* 5. Ranked Clip Cards Grid */}
            {displayCandidates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
            ) : activeProject.candidates.length > 0 ? (
              <div className="p-12 text-center glass-panel rounded-2xl border border-white/10 text-zinc-400">
                <p>No clips match the selected filter &ldquo;{selectedTopic}&rdquo;.</p>
                <button
                  onClick={() => setSelectedTopic('All')}
                  className="mt-3 text-xs text-white hover:underline"
                >
                  View all clips
                </button>
              </div>
            ) : (
              <div className="p-12 text-center glass-panel rounded-2xl border border-white/10 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No Clips Discovered Yet</h3>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Click &ldquo;Run Full AI Analysis&rdquo; in the header above to transcribe the audio/video and discover motivational, philosophical, and viral clips under 60s.
                </p>
                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing || (activeProject.sourceType === 'youtube' && !activeProject.localVideoPath)}
                  className="px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-sm shadow-lg shadow-white/5 transition-all"
                >
                  {isAnalyzing ? 'Analyzing Media...' : 'Run Full AI Analysis'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: New Project Creator */}
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
    </div>
  );
}
