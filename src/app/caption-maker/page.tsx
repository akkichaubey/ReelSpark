'use strict';
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  CaptionProject,
  CaptionGroup,
  CaptionStyle,
  OutputSettings,
  ImageAsset,
  AudioAsset,
  ImageFitMode,
  TranscriptWord,
} from '@/lib/caption-maker/types';
import {
  createDefaultCaptionProject,
  SAMPLE_TRANSCRIPT_WORDS,
} from '@/lib/caption-maker/sample-data';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';
import { AssetUploadSection } from '@/components/caption-maker/AssetUploadSection';
import { CaptionPreview } from '@/components/caption-maker/CaptionPreview';
import { TranscriptEditor } from '@/components/caption-maker/TranscriptEditor';
import { CaptionTimeline } from '@/components/caption-maker/CaptionTimeline';
import { CaptionStylePanel } from '@/components/caption-maker/CaptionStylePanel';
import { OutputSettingsPanel } from '@/components/caption-maker/OutputSettingsPanel';
import { ExportModal } from '@/components/caption-maker/ExportModal';
import { KeyboardShortcutsDialog } from '@/components/caption-maker/KeyboardShortcutsDialog';
import {
  Film,
  Sparkles,
  Undo2,
  Redo2,
  Save,
  Download,
  RotateCcw,
  Keyboard,
  FileText,
  SlidersHorizontal,
  FolderOpen,
  Check,
  Tv,
} from 'lucide-react';

export default function CaptionMakerPage() {
  // --- Project State & Undo/Redo History ---
  const [project, setProject] = useState<CaptionProject>(() =>
    createDefaultCaptionProject()
  );
  const [history, setHistory] = useState<CaptionProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Audio Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number>(10);

  // UI Panels & Tabs
  const [leftTab, setLeftTab] = useState<'assets' | 'transcript'>('assets');
  const [rightTab, setRightTab] = useState<'style' | 'output'>('style');

  // Modals
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

  // Rendering state
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderStatusText, setRenderStatusText] = useState<string>('');
  const [renderResult, setRenderResult] = useState<{
    videoUrl?: string;
    srtUrl?: string;
    error?: string;
  } | null>(null);

  // Initialize from LocalStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('reel_caption_project_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.captionStyle && parsed.outputSettings) {
          setTimeout(() => {
            setProject(parsed);
            setHistory([parsed]);
            setHistoryIndex(0);
            if (parsed.audio?.duration) {
              setAudioDuration(parsed.audio.duration);
            }
          }, 0);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to restore project from localStorage', e);
    }

    setTimeout(() => {
      const initial = createDefaultCaptionProject();
      setProject(initial);
      setHistory([initial]);
      setHistoryIndex(0);
    }, 0);
  }, []);

  // Sync audio duration
  useEffect(() => {
    if (project.audio?.duration) {
      const dur = project.audio.duration;
      setTimeout(() => {
        setAudioDuration(dur);
      }, 0);
    }
  }, [project.audio?.duration]);

  // Push new state to undo/redo history
  const updateProjectWithHistory = useCallback(
    (updater: (prev: CaptionProject) => CaptionProject) => {
      setProject((prev) => {
        const next = updater(prev);
        setHistory((prevHist) => {
          const cut = prevHist.slice(0, historyIndex + 1);
          return [...cut, next];
        });
        setHistoryIndex((prevIdx) => prevIdx + 1);
        return next;
      });
    },
    [historyIndex]
  );

  const undo = () => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setProject(target);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setProject(target);
    }
  };

  // Audio Playback Sync
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => {
        console.warn('Audio play prevented', e);
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, audioDuration));
      setCurrentTime(clamped);
      if (audioRef.current) {
        audioRef.current.currentTime = clamped;
      }
    },
    [audioDuration]
  );

  // Audio element events
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  // Save project to localStorage
  const handleSaveProject = () => {
    try {
      localStorage.setItem('reel_caption_project_v1', JSON.stringify(project));
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2500);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const handleResetProject = () => {
    if (
      window.confirm(
        'Reset current project to default? Any unsaved edits will be lost.'
      )
    ) {
      const fresh = createDefaultCaptionProject();
      setProject(fresh);
      setHistory([fresh]);
      setHistoryIndex(0);
      handleSeek(0);
    }
  };

  // Keyboard Shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(currentTime - 1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(currentTime + 1);
      } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsExportOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleSeek, currentTime, undo, redo]);

  // Asset Upload Handlers
  const handleImageUploaded = (image: ImageAsset) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      image,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleAudioUploaded = (audio: AudioAsset) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      audio,
      updatedAt: new Date().toISOString(),
    }));
    setAudioDuration(audio.duration);
    handleSeek(0);
  };

  const handleFitModeChange = (mode: ImageFitMode) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => ({
      ...prev,
      image: prev.image ? { ...prev.image, fitMode: mode } : undefined,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleTranscribe = async () => {
    if (!project.audio) return;
    setIsTranscribing(true);
    try {
      const res = await fetch('/api/caption-maker/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: project.audio.storagePath,
          fileUrl: project.audio.fileUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to transcribe audio');
      }
      handleTranscribeComplete(data.transcript, data.captionGroups);
    } catch (err: any) {
      alert(err.message || 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscribeComplete = (
    words: TranscriptWord[],
    groups: CaptionGroup[]
  ) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      transcript: words,
      captionGroups: groups,
      updatedAt: new Date().toISOString(),
    }));
    setLeftTab('transcript'); // Automatically switch to transcript editor to show words
  };

  const handleUpdateGroups = (groups: CaptionGroup[]) => {
    // Flatten words
    const flattenedWords = groups.flatMap((g) => g.words);
    updateProjectWithHistory((prev) => ({
      ...prev,
      captionGroups: groups,
      transcript: flattenedWords,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleChangeStyle = (style: CaptionStyle) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      captionStyle: style,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleChangeOutput = (outputSettings: OutputSettings) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      outputSettings,
      updatedAt: new Date().toISOString(),
    }));
  };

  // FFmpeg Video Render Trigger
  const handleStartRender = async () => {
    if (!project.audio) {
      alert('Please upload an audio file before rendering.');
      return;
    }

    setIsRendering(true);
    setRenderProgress(10);
    setRenderStatusText('Initializing rendering pipeline...');
    setRenderResult(null);

    try {
      setRenderProgress(25);
      setRenderStatusText('Compositing ASS word-level animations & styles...');

      const response = await fetch('/api/caption-maker/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle: project.title,
          image: project.image,
          audio: project.audio,
          captionStyle: project.captionStyle,
          captionGroups: project.captionGroups,
          outputSettings: project.outputSettings,
        }),
      });

      setRenderProgress(70);
      setRenderStatusText('FFmpeg encoding H.264 video with AAC audio...');

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'FFmpeg rendering failed on the server.');
      }

      setRenderProgress(100);
      setRenderStatusText('Rendering finished!');
      setRenderResult({
        videoUrl: data.videoUrl,
        srtUrl: data.srtUrl,
      });

      // Update project with render urls
      updateProjectWithHistory((prev) => ({
        ...prev,
        renderedVideoUrl: data.videoUrl,
        renderedVideoPath: data.videoPath,
        renderedSrtPath: data.srtPath,
      }));
    } catch (err) {
      console.error('Render error:', err);
      setRenderResult({
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error occurred during rendering.',
      });
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Audio Engine element */}
      <audio
        ref={audioRef}
        src={project.audio?.fileUrl || '/sample-audio.mp3'}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration;
          if (d && !isNaN(d) && d > 0) setAudioDuration(d);
        }}
        preload="auto"
      />

      {/* Top Navbar Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 flex items-center justify-between shrink-0 z-30">
        {/* Brand & Studio Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-black shadow-md shadow-amber-400/20">
              <Sparkles className="w-4 h-4 fill-black" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                AI Reel Caption Maker
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Pro Studio
                </span>
              </span>
            </div>
          </div>

          {/* Quick Studio Switcher */}
          <div className="hidden md:flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 ml-3 text-xs">
            <Link
              href="/caption-maker"
              className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1.5 border border-amber-500/30"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              Reel Caption Maker
            </Link>
            <Link
              href="/"
              className="px-2.5 py-1 rounded-md text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Film className="w-3 h-3" />
              Clip Finder
            </Link>
          </div>
        </div>

        {/* Project Name Editable */}
        <div className="hidden lg:flex items-center gap-2">
          <input
            type="text"
            value={project.title}
            onChange={(e) =>
              updateProjectWithHistory((prev) => ({
                ...prev,
                title: e.target.value,
              }))
            }
            className="bg-transparent hover:bg-zinc-800 focus:bg-zinc-800 border border-transparent hover:border-zinc-700 focus:border-amber-400 px-2 py-1 rounded text-xs font-medium text-zinc-200 focus:outline-none transition-all text-center w-52"
            placeholder="Project title..."
          />
        </div>

        {/* Action Controls (Undo, Redo, Save, Render, Shortcuts) */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/60">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Redo (Ctrl+Shift+Z)"
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset */}
          <button
            onClick={handleResetProject}
            title="Reset Project"
            className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Shortcuts Help */}
          <button
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard Shortcuts"
            className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          {/* Save */}
          <button
            onClick={handleSaveProject}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              saveSuccessNotice
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
            }`}
          >
            {saveSuccessNotice ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save</span>
              </>
            )}
          </button>

          {/* Render / Export Modal Trigger */}
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Render Reel</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Editor Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* LEFT COLUMN: Assets & Transcript Tabs */}
        <section className="w-full md:w-80 lg:w-96 flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0">
          {/* Tab Headers */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/60 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => setLeftTab('assets')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                leftTab === 'assets'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              Assets & Audio
            </button>
            <button
              onClick={() => setLeftTab('transcript')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                leftTab === 'transcript'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Transcript & Words
              {project.captionGroups.length > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded-full font-mono">
                  {project.captionGroups.length}
                </span>
              )}
            </button>
          </div>

          {/* Left Tab Body */}
          <div className="flex-1 overflow-hidden p-3">
            {leftTab === 'assets' ? (
              <AssetUploadSection
                image={project.image}
                audio={project.audio}
                onImageChange={(img) => {
                  if (img) handleImageUploaded(img);
                  else {
                    updateProjectWithHistory((prev) => ({
                      ...prev,
                      image: undefined,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
                onAudioChange={(aud) => {
                  if (aud) handleAudioUploaded(aud);
                  else {
                    updateProjectWithHistory((prev) => ({
                      ...prev,
                      audio: undefined,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
                onTranscribe={handleTranscribe}
                isTranscribing={isTranscribing}
                onFitModeChange={handleFitModeChange}
              />
            ) : (
              <TranscriptEditor
                groups={project.captionGroups}
                currentTime={currentTime}
                onUpdateGroups={handleUpdateGroups}
                onSeek={handleSeek}
              />
            )}
          </div>
        </section>

        {/* CENTER COLUMN: Real-Time Canvas Video Preview */}
        <main className="flex-1 flex flex-col bg-zinc-950 items-center justify-center p-3 sm:p-4 overflow-hidden relative">
          <CaptionPreview
            image={project.image}
            audioUrl={project.audio?.fileUrl}
            transcript={project.transcript}
            captionGroups={project.captionGroups}
            captionStyle={project.captionStyle}
            outputSettings={project.outputSettings}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSeek={handleSeek}
            totalDuration={audioDuration}
          />
        </main>

        {/* RIGHT COLUMN: Style & Output Settings Tabs */}
        <section className="w-full md:w-80 lg:w-96 flex flex-col border-l border-zinc-800 bg-zinc-950 shrink-0">
          {/* Tab Headers */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/60 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => setRightTab('style')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                rightTab === 'style'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              Caption Styles
            </button>
            <button
              onClick={() => setRightTab('output')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                rightTab === 'output'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" />
              Platform & Canvas
            </button>
          </div>

          {/* Right Tab Body */}
          <div className="flex-1 overflow-hidden p-3">
            {rightTab === 'style' ? (
              <CaptionStylePanel
                style={project.captionStyle}
                onChangeStyle={handleChangeStyle}
              />
            ) : (
              <OutputSettingsPanel
                settings={project.outputSettings}
                onChangeSettings={handleChangeOutput}
              />
            )}
          </div>
        </section>
      </div>

      {/* BOTTOM SECTION: Full Interactive Scrubber & Audio Waveform Timeline */}
      <footer className="shrink-0">
        <CaptionTimeline
          duration={audioDuration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          groups={project.captionGroups}
          onSeek={handleSeek}
          onTogglePlay={togglePlay}
        />
      </footer>

      {/* Render / Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
        onStartRender={handleStartRender}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStatusText={renderStatusText}
        renderResult={renderResult}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
