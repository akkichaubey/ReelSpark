'use client';
import { accountCache, ACCOUNT_WORKSPACE_FLUSH_EVENT } from '@/lib/account-cache';
import { syncStorageReferenceInventory } from '@/lib/storage-reference-client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CaptionProject,
  CaptionGroup,
  CaptionStyle,
  OutputSettings,
  ImageAsset,
  AudioAsset,
  ImageFitMode,
  ImagePosition,
  TranscriptWord,
  ThumbnailSettings,
  BgMusicTrack,
} from '@/lib/caption-maker/types';
import { createEmptyCaptionProject, PRESET_BGM_TRACKS } from '@/lib/caption-maker/sample-data';
import { cleanBundledSampleProject } from '@/lib/caption-maker/clean-sample-project';
import { createCaptionProjectFromClip, switchProjectLanguage } from '@/lib/caption-maker/clip-to-reel';
import { validateAndHealReelProject } from '@/lib/caption-maker/pre-flight-validator';
import { AssetUploadSection } from '@/components/caption-maker/AssetUploadSection';
import { CaptionPreview } from '@/components/caption-maker/CaptionPreview';
import { TranscriptEditor } from '@/components/caption-maker/TranscriptEditor';
import { CaptionTimeline } from '@/components/caption-maker/CaptionTimeline';
import { CaptionStylePanel } from '@/components/caption-maker/CaptionStylePanel';
import { ThumbnailStylePanel, ThumbnailSubTab } from '@/components/caption-maker/ThumbnailStylePanel';
import { ThumbnailPreview } from '@/components/caption-maker/ThumbnailPreview';
import { OutputSettingsPanel } from '@/components/caption-maker/OutputSettingsPanel';
import { ExportModal } from '@/components/caption-maker/ExportModal';
import { KeyboardShortcutsDialog } from '@/components/caption-maker/KeyboardShortcutsDialog';
import { SmartEditorModal } from '@/components/caption-maker/SmartEditorModal';
import { ProjectHistoryModal } from '@/components/caption-maker/ProjectHistoryModal';
import {
  saveProjectToLocalStorage,
  saveProjectSnapshot,
  getProjectSnapshots,
  detectCrashRecovery,
  ProjectSnapshot,
} from '@/lib/caption-maker/project-storage';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';
import {
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
  getThumbnailDimensions,
} from '@/lib/caption-maker/thumbnail-presets';
import {
  Film,
  Palette,
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
  Image as ImageIcon,
  ShieldCheck,
  Shield,
  Loader2,
  AlertCircle,
  History,
  Share2,
  LayoutDashboard,
  Scissors,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from '@/components/AuthModal';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Suspense } from 'react';

function CaptionMakerPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, openAuthModal, checkAuth, logout } = useAuthStore();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Keep existing bookmarks working while presenting Reel Maker as the only
  // public editor route. Query parameters carry over for clip/project links.
  useEffect(() => {
    if (pathname !== '/caption-maker') return;

    const query = searchParams.toString();
    router.replace(`/reel-maker${query ? `?${query}` : ''}`);
  }, [pathname, router, searchParams]);

  // --- Project State & Undo/Redo History ---
  const [project, setProject] = useState<CaptionProject>(() =>
    createEmptyCaptionProject()
  );
  const [history, setHistory] = useState<CaptionProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Audio Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  // UI Panels & Tabs
  const [leftTab, setLeftTab] = useState<'assets' | 'transcript'>('assets');
  const [rightTab, setRightTab] = useState<'style' | 'thumbnail' | 'canvas'>('thumbnail');
  const [centerViewMode, setCenterViewMode] = useState<'video' | 'thumbnail'>('video');
  const [thumbnailSubTab, setThumbnailSubTab] = useState<ThumbnailSubTab>('position');

  // Modals & History
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isSmartEditorOpen, setIsSmartEditorOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle'>('saved');
  const [crashRecoverySnapshot, setCrashRecoverySnapshot] = useState<ProjectSnapshot | null>(null);
  const isInitialMount = useRef<boolean>(true);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // Rendering state
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderStatusText, setRenderStatusText] = useState<string>('');
  const [renderResult, setRenderResult] = useState<{
    videoUrl?: string;
    srtUrl?: string;
    error?: string;
    thumbnailMerged?: boolean;
    thumbnailUrl?: string;
  } | null>(null);

  // Load project from LocalStorage or dynamically resolve from URL / Server Projects
  const loadProjectFromStorage = useCallback(async () => {
    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlClipId = searchParams?.get('clipId') || null;
    const urlProjectId = searchParams?.get('projectId') || null;
    const urlLang = (searchParams?.get('lang') === 'hi' ? 'hi' : 'en') as 'en' | 'hi';

    let restoredParsed: CaptionProject | null = null;
    try {
      let saved = accountCache.getItem('reel_caption_project_v2');
      if (!saved) {
        saved = accountCache.getItem('reel_caption_project_v1');
      }
      if (saved) {
        const parsed = cleanBundledSampleProject(JSON.parse(saved));
        if (parsed && parsed.captionStyle && parsed.outputSettings) {
          // Strip out default sample image so empty upload card is shown by default
          if (
            parsed.image &&
            (parsed.image.fileName === 'sample-image.jpg' ||
              parsed.image.fileUrl === '/sample-image.jpg' ||
              parsed.image.id === 'default_img')
          ) {
            parsed.image = undefined;
          } else if (parsed.image) {
            if (!parsed.image.fitMode) {
              parsed.image.fitMode = 'cover';
            }
          }
          if (!parsed.audio) {
            parsed.transcript = [];
            parsed.captionGroups = [];
            parsed.syncedSegments = undefined;
            parsed.rawTranscriptHindi = undefined;
            parsed.rawTranscriptEnglish = undefined;
            parsed.isAudioSynced = false;
          }

          const oldYellows = ['#FFE600', '#FFD700', '#FDE047', '#FEF08A', '#EAB308', '#FFEB3B', '#F59E0B'];
          const currentImportant = parsed.captionStyle.importantColor?.toUpperCase?.() || '';
          if (!parsed.captionStyle.importantColor || oldYellows.includes(currentImportant)) {
            parsed.captionStyle.importantColor = '#FCD905';
            if (parsed.captionStyle.glowColor && oldYellows.includes(parsed.captionStyle.glowColor.toUpperCase())) {
              parsed.captionStyle.glowColor = '#FCD905';
            }
          }
          if (parsed.captionStyle.textOpacity === undefined || parsed.captionStyle.textOpacity === 0.65) {
            parsed.captionStyle.textOpacity = 1.0;
          }
          if (!parsed.captionStyle.position || parsed.captionStyle.position === 'bottom') {
            parsed.captionStyle.position = 'custom';
          }
          if (parsed.captionStyle.customY === undefined || parsed.captionStyle.customY === 82 || parsed.captionStyle.customY === 75) {
            parsed.captionStyle.customY = 20;
          }
          if (!parsed.captionStyle.textAlign || parsed.captionStyle.textAlign === 'center') {
            parsed.captionStyle.textAlign = 'custom';
          }
          if (parsed.captionStyle.customX === undefined) {
            parsed.captionStyle.customX = 50;
          }
          parsed.captionStyle.showSafeArea = false;
          if (parsed.thumbnailSettings) parsed.thumbnailSettings.showSafeArea = false;
          if (!parsed.captionStyle.fontFamily || parsed.captionStyle.fontFamily.includes('Inter')) {
            parsed.captionStyle.fontFamily = 'Montserrat, sans-serif';
            parsed.captionStyle.fontWeight = 'medium';
            parsed.captionStyle.strokeWidth = 0;
            parsed.captionStyle.animationPreset = 'clean';
            parsed.captionStyle.highlightAnimation = 'color-change';
            parsed.captionStyle.letterSpacing = 3;
            parsed.captionStyle.uppercase = false;
            parsed.captionStyle.zoomScale = 1.0;
            parsed.captionStyle.shadowBlur = 12;
            parsed.captionStyle.shadowOffsetY = 4;
            parsed.captionStyle.backgroundColor = 'transparent';
            parsed.captionStyle.backgroundStyle = 'none';
          }
          if (parsed.captionStyle.strokeWidth === undefined || parsed.captionStyle.strokeWidth === 6 || parsed.captionStyle.strokeWidth === 2) {
            parsed.captionStyle.strokeWidth = 0;
          }
          if (!parsed.captionStyle.textEffect || parsed.captionStyle.textEffect === 'drop-shadow') {
            parsed.captionStyle.textEffect = 'none';
          }
          restoredParsed = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to restore project from localStorage', e);
    }

    // If localStorage matches the requested clipId (or no specific clipId is in the URL), apply it immediately
    if (restoredParsed && (!urlClipId || restoredParsed.sourceClipId === urlClipId)) {
      if (
        restoredParsed.transcript &&
        restoredParsed.transcript.length > 0 &&
        (!restoredParsed.captionGroups || restoredParsed.captionGroups.length === 0)
      ) {
        restoredParsed.captionGroups = groupTranscriptWords(restoredParsed.transcript, 4);
      }
      try {
        accountCache.setItem('reel_caption_project_v2', JSON.stringify(restoredParsed));
      } catch {}
      setProject(restoredParsed);
      setHistory([restoredParsed]);
      setHistoryIndex(0);
      if (restoredParsed.audio?.duration) {
        setAudioDuration(restoredParsed.audio.duration);
      } else {
        setAudioDuration(0);
      }
      if (restoredParsed.transcript && restoredParsed.transcript.length > 0) {
        setLeftTab('transcript');
      } else {
        setLeftTab('assets');
      }
      const recovery = detectCrashRecovery(restoredParsed);
      if (recovery.hasRecovery && recovery.recoverySnapshot) {
        setCrashRecoverySnapshot(recovery.recoverySnapshot);
      }
      return;
    }

    // Only dynamically fetch from /api/projects when URL explicitly requests a clipId
    if (urlClipId) {
      try {
        const projRes = await fetch('/api/projects');
        const projData = await projRes.json();
        if (projData?.success && Array.isArray(projData.projects) && projData.projects.length > 0) {
          let matchedProj: any = null;
          let matchedCand: any = null;

          for (const p of projData.projects) {
            if (urlProjectId && p.id !== urlProjectId) continue;
            const c = (p.candidates || []).find((cand: any) => cand.id === urlClipId);
            if (c) {
              matchedProj = p;
              matchedCand = c;
              break;
            }
          }

          if (matchedProj && matchedCand) {
            let audioOverride: any = undefined;
            try {
              const clipAudioRes = await fetch(`/api/projects/${matchedProj.id}/clip-audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  clipId: matchedCand.id,
                  start: matchedCand.start,
                  end: matchedCand.end,
                }),
              });
              const clipAudioData = await clipAudioRes.json();
              if (clipAudioData?.success && clipAudioData.audioUrl) {
                audioOverride = {
                  audioUrl: clipAudioData.audioUrl,
                  storagePath: clipAudioData.audioPath,
                  duration: clipAudioData.duration,
                  fileSize: clipAudioData.fileSize,
                  syncedSegments: clipAudioData.syncedSegments,
                  rawTranscriptHindi: clipAudioData.rawTranscriptHindi,
                  rawTranscriptEnglish: clipAudioData.rawTranscriptEnglish,
                  titleHindi: clipAudioData.titleHindi,
                  titleEnglish: clipAudioData.titleEnglish,
                  isAudioSynced: clipAudioData.isAudioSynced,
                };
              }
            } catch {}

            const dynamicReelProj = createCaptionProjectFromClip(
              matchedCand,
              matchedProj,
              urlLang,
              audioOverride
            );
            try {
              accountCache.setItem('reel_caption_project_v2', JSON.stringify(dynamicReelProj));
            } catch {}
            setProject(dynamicReelProj);
            setHistory([dynamicReelProj]);
            setHistoryIndex(0);
            if (dynamicReelProj.audio?.duration) {
              setAudioDuration(dynamicReelProj.audio.duration);
            }
            setLeftTab('transcript');
            const recovery = detectCrashRecovery(dynamicReelProj);
            if (recovery.hasRecovery && recovery.recoverySnapshot) {
              setCrashRecoverySnapshot(recovery.recoverySnapshot);
            }
            return;
          }
        }
      } catch {}
    }

    const fallbackProj = restoredParsed || createEmptyCaptionProject();
    if (
      fallbackProj.transcript &&
      fallbackProj.transcript.length > 0 &&
      (!fallbackProj.captionGroups || fallbackProj.captionGroups.length === 0)
    ) {
      fallbackProj.captionGroups = groupTranscriptWords(fallbackProj.transcript, 4);
    }
    setProject(fallbackProj);
    setHistory([fallbackProj]);
    setHistoryIndex(0);
    if (fallbackProj.audio?.duration) {
      setAudioDuration(fallbackProj.audio.duration);
    } else {
      setAudioDuration(0);
    }
    if (fallbackProj.transcript && fallbackProj.transcript.length > 0) {
      setLeftTab('transcript');
    }
    const recovery = detectCrashRecovery(fallbackProj);
    if (recovery.hasRecovery && recovery.recoverySnapshot) {
      setCrashRecoverySnapshot(recovery.recoverySnapshot);
    }
  }, []);

  // Initialize from LocalStorage / Server and listen for clip updates from Clip Finder
  useEffect(() => {
    loadProjectFromStorage();

    const handleReelProjectUpdated = () => {
      loadProjectFromStorage();
    };

    window.addEventListener('reel_project_updated', handleReelProjectUpdated);
    window.addEventListener('storage', handleReelProjectUpdated);
    window.addEventListener('popstate', handleReelProjectUpdated);

    return () => {
      window.removeEventListener('reel_project_updated', handleReelProjectUpdated);
      window.removeEventListener('storage', handleReelProjectUpdated);
      window.removeEventListener('popstate', handleReelProjectUpdated);
    };
  }, [loadProjectFromStorage]);

  // Switch project transcript between English, Hindi, and Hinglish
  const handleSwitchLanguage = (lang: 'en' | 'hi' | 'hinglish') => {
    if (project.preferredLanguage === lang) return;
    updateProjectWithHistory((prev) => {
      const switched = switchProjectLanguage(prev, lang);
      try {
        accountCache.setItem('reel_caption_project_v2', JSON.stringify(switched));
      } catch {}
      return switched;
    });
  };

  const handleBgMusicChange = (track?: BgMusicTrack) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      bgMusic: track,
      updatedAt: new Date().toISOString(),
    }));
  };

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
      try {
        audioRef.current.pause();
      } catch {}
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
        } catch {}
      }
      setIsPlaying(false);
    } else {
      const trimStart = project.trimRange?.start ?? 0;
      const trimEnd =
        project.trimRange?.end && project.trimRange.end > 0
          ? project.trimRange.end
          : audioDuration;

      // Ensure playback starts within trimmed bounds
      if (currentTime < trimStart || (trimEnd > 0 && currentTime >= trimEnd)) {
        audioRef.current.currentTime = trimStart;
        setCurrentTime(trimStart);
      }

      try {
        const p = audioRef.current.play();
        if (p !== undefined) {
          p.catch((e) => {
            if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') {
              console.warn('Audio play prevented', e);
            }
          });
        }
      } catch {}
      if (bgMusicRef.current && project.bgMusic?.fileUrl) {
        try {
          const baseBgmVol = project.bgMusic.muted ? 0 : Math.min(1.0, project.bgMusic.volume ?? 0.2);
          bgMusicRef.current.volume = baseBgmVol;
          const offset = project.bgMusic.startOffset ?? 0;
          if (bgMusicRef.current.duration) {
            bgMusicRef.current.currentTime = (offset + currentTime) % bgMusicRef.current.duration;
          }
          const bgP = bgMusicRef.current.play();
          if (bgP !== undefined) bgP.catch(() => {});
        } catch {}
      }
      setIsPlaying(true);
    }
  }, [isPlaying, project.bgMusic, project.trimRange, currentTime, audioDuration]);

  // Handle trim range change from timeline drag handles
  const handleTrimChange = useCallback(
    (start: number, end: number) => {
      updateProjectWithHistory((prev) => ({
        ...prev,
        trimRange: { start, end },
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateProjectWithHistory]
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
        } catch {}
      }
    };
  }, []);

  // Sync voice element volume when project setting changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = project.voiceMuted ? 0 : Math.min(1.0, project.voiceVolume ?? 1.0);
    }
  }, [project.voiceVolume, project.voiceMuted]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, audioDuration));
      setCurrentTime(clamped);
      if (audioRef.current) {
        audioRef.current.currentTime = clamped;
      }
      if (bgMusicRef.current && bgMusicRef.current.duration) {
        const offset = project.bgMusic?.startOffset ?? 0;
        bgMusicRef.current.currentTime = (offset + clamped) % bgMusicRef.current.duration;
      }
    },
    [audioDuration, project.bgMusic]
  );

  // 60fps playhead sync using requestAnimationFrame with live Auto-Ducking and Trim boundary looping
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        const cur = audioRef.current.currentTime;
        setCurrentTime(cur);

        // Trim boundary enforcement: loop back or pause when reaching trimEnd
        if (project.trimRange && project.trimRange.end > 0 && cur >= project.trimRange.end) {
          audioRef.current.currentTime = project.trimRange.start;
          setCurrentTime(project.trimRange.start);
        }

        // Live Auto-Ducking in browser preview (VN & Instagram Style)
        if (bgMusicRef.current && project.bgMusic?.fileUrl) {
          const baseVol = project.bgMusic.muted ? 0 : Math.min(1.0, project.bgMusic.volume ?? 0.2);
          if (project.bgMusic.autoDucking !== false && project.transcript && project.transcript.length > 0) {
            const isSpeaking = project.transcript.some(
              (w) => cur >= Math.max(0, w.start - 0.1) && cur <= w.end + 0.15
            );
            bgMusicRef.current.volume = isSpeaking ? baseVol * 0.32 : baseVol;
          } else {
            bgMusicRef.current.volume = baseVol;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isPlaying, project.bgMusic, project.transcript, project.trimRange]);

  // Audio element events
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);
      if (project.trimRange && project.trimRange.end > 0 && cur >= project.trimRange.end) {
        audioRef.current.currentTime = project.trimRange.start;
        setCurrentTime(project.trimRange.start);
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (bgMusicRef.current && project.bgMusic) {
      bgMusicRef.current.volume = Math.max(0, Math.min(1, project.bgMusic.volume ?? 0.2));
    }
  }, [project.bgMusic?.volume]);

  useEffect(() => {
    if (!project.bgMusic && bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  }, [project.bgMusic]);

  // Debounced Autosave to localStorage
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setAutosaveStatus('saving');
    const timer = setTimeout(() => {
      saveProjectToLocalStorage(project);
      setAutosaveStatus('saved');
    }, 1200);
    return () => clearTimeout(timer);
  }, [project]);

  // The project itself lives in the user's browser cache. Keep a server-side
  // inventory of every asset reachable from the current project, undo history,
  // and saved snapshots so storage maintenance never guesses from file age.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const snapshots = getProjectSnapshots().map((snapshot) => snapshot.project);
      void syncStorageReferenceInventory('caption-maker', [project, ...history, ...snapshots]);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [history, project]);

  // Save project to localStorage and generate manual snapshot
  useEffect(() => {
    const flush = () => {
      if (saveProjectToLocalStorage(project)) setAutosaveStatus('saved');
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener(ACCOUNT_WORKSPACE_FLUSH_EVENT, flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener(ACCOUNT_WORKSPACE_FLUSH_EVENT, flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [project]);

  const handleSaveProject = () => {
    try {
      saveProjectToLocalStorage(project);
      saveProjectSnapshot(project, 'Manual Save');
      setAutosaveStatus('saved');
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2500);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  // Restore project from version snapshot
  const handleRestoreProject = (restored: CaptionProject) => {
    setProject(restored);
    setHistory([restored]);
    setHistoryIndex(0);
    if (restored.audio?.duration) {
      setAudioDuration(restored.audio.duration);
    }
    saveProjectToLocalStorage(restored);
    setCrashRecoverySnapshot(null);
  };

  // Duplicate current project into a fresh working project
  const handleDuplicateProject = (duplicated: CaptionProject) => {
    setProject(duplicated);
    setHistory([duplicated]);
    setHistoryIndex(0);
    if (duplicated.audio?.duration) {
      setAudioDuration(duplicated.audio.duration);
    }
    saveProjectToLocalStorage(duplicated);
  };

  const handleResetProject = () => {
    if (
      window.confirm(
        'Reset current project and clear history? Any unsaved edits will be lost.'
      )
    ) {
      if (typeof window !== 'undefined' && window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      const fresh = createEmptyCaptionProject();
      setProject(fresh);
      setHistory([fresh]);
      setHistoryIndex(0);
      handleSeek(0);
      setAudioDuration(0);
      setCenterViewMode('video');
      setLeftTab('assets');
      setRightTab('thumbnail');
      setThumbnailSubTab('position');
      setIsPlaying(false);
      setRenderResult(null);
      setTranscriptionError(null);
      setCrashRecoverySnapshot(null);
      try {
        accountCache.setItem('reel_caption_project_v2', JSON.stringify(fresh));
        accountCache.removeItem('reel_caption_project_v1');
      } catch {}
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
    updateProjectWithHistory((prev) => {
      const normalizedImage: ImageAsset = {
        ...image,
        fitMode: image.fitMode || 'cover',
        position: image.position || 'center',
        scale: image.scale ?? 100,
      };
      return {
        ...prev,
        image: normalizedImage,
        mediaAssets: [...new Map([
          ...(prev.mediaAssets || []).map((asset) => [asset.id, asset] as const),
          ...(prev.image ? [[prev.image.id, prev.image] as const] : []),
          [normalizedImage.id, normalizedImage] as const,
        ]).values()],
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const initialThumbAspect: '9:16' | '4:5' | '1:1' | '16:9' = useMemo(() => {
    const asp = project.outputSettings?.aspectRatio;
    if (asp === '16:9' || asp === '1:1' || asp === '4:5' || asp === '9:16') {
      return asp;
    }
    const preset = project.outputSettings?.preset;
    if (preset === 'instagram-portrait') return '4:5';
    if (preset === 'instagram-square') return '1:1';
    if (preset === 'youtube-landscape') return '16:9';
    return '9:16';
  }, [project.outputSettings?.aspectRatio, project.outputSettings?.preset]);

  const currentThumbSettings = useMemo(() => {
    if (project.thumbnailSettings) {
      const isBadgeExplicitlyDisabled = project.thumbnailSettings.badgeEnabled !== true;
      const badgePaddingX = project.thumbnailSettings.badgePaddingX ?? 18;
      const badgePaddingY = project.thumbnailSettings.badgePaddingY ?? 9;
      return {
        ...project.thumbnailSettings,
        badgeText: isBadgeExplicitlyDisabled
          ? (project.thumbnailSettings.badgeText || '')
          : (project.thumbnailSettings.badgeText || "DON'T MISS"),
        badgeEnabled: !isBadgeExplicitlyDisabled,
        badgeFontSize: project.thumbnailSettings.badgeFontSize ?? 26,
        badgeFontWeight: project.thumbnailSettings.badgeFontWeight || '800',
        badgePaddingX,
        badgePaddingY,
        badgeLetterSpacing: project.thumbnailSettings.badgeLetterSpacing ?? 1,
        aspectRatio: initialThumbAspect,
        safeZoneOverrides: project.thumbnailSettings.safeZoneOverrides || project.captionStyle?.safeZoneOverrides,
      };
    }

    const firstCaptionPhrase = project.captionGroups?.[0]?.words
      ?.map((w) => w.text)
      .join(' ')
      .trim();
    const resolvedTitle =
      project.title && project.title !== 'Untitled Reel'
        ? project.title
        : firstCaptionPhrase || 'CREATE VIRAL REELS IN SECONDS';

    const defaults = createDefaultThumbnailSettings(
      resolvedTitle,
      initialThumbAspect,
      'custom',
      27,
      project.captionStyle?.fontFamily || 'Montserrat',
      project.captionStyle?.importantColor || '#FCD905'
    );

    return {
      ...defaults,
      showSafeArea: project.captionStyle?.showSafeArea ?? false,
      safeZoneOverrides: project.captionStyle?.safeZoneOverrides,
    };
  }, [
    project.thumbnailSettings,
    project.title,
    project.captionGroups,
    project.captionStyle?.position,
    project.captionStyle?.customY,
    project.captionStyle?.fontFamily,
    project.captionStyle?.importantColor,
    project.captionStyle?.showSafeArea,
    project.captionStyle?.safeZoneOverrides,
    initialThumbAspect,
  ]);

  const handleChangeThumbnailSettings = (newSettings: ThumbnailSettings) => {
    updateProjectWithHistory((prev) => {
      // Sync safe-zone platform/overrides to captionStyle so video reel view stays synchronized
      const currentStyle = prev.captionStyle;
      const syncedStyle: CaptionStyle = newSettings.safeZoneOverrides
        ? {
            ...currentStyle,
            showSafeArea: newSettings.showSafeArea === true,
            safeZoneOverrides: {
              ...currentStyle.safeZoneOverrides,
              ...newSettings.safeZoneOverrides,
            },
          }
        : currentStyle;

      return {
        ...prev,
        captionStyle: syncedStyle,
        thumbnailSettings: newSettings,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleDownloadThumbnail = async (format: 'png' | 'jpeg') => {
    try {
      const canvas = document.createElement('canvas');
      let bgImg: HTMLImageElement | null = null;
      const sourceUrl = currentThumbSettings.customBgUrl || project.image?.fileUrl;
      if (sourceUrl) {
        bgImg = await new Promise<HTMLImageElement | null>((res) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = sourceUrl;
        });
      }

      await renderThumbnailToCanvas(canvas, currentThumbSettings, bgImg, project.image);
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const dataUrl = canvas.toDataURL(mime, 0.95);

      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanTitle = (currentThumbSettings.title || 'reel_thumbnail')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 30);
      a.download = `${cleanTitle}_cover.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Failed to download thumbnail:', e);
    }
  };

  const handleApplyThumbnailAsReelImage = async () => {
    try {
      const canvas = document.createElement('canvas');
      let bgImg: HTMLImageElement | null = null;
      const sourceUrl = currentThumbSettings.customBgUrl || project.image?.fileUrl;
      if (sourceUrl) {
        bgImg = await new Promise<HTMLImageElement | null>((res) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = sourceUrl;
        });
      }

      await renderThumbnailToCanvas(canvas, currentThumbSettings, bgImg, project.image);
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      const { width, height } = getThumbnailDimensions(currentThumbSettings.aspectRatio);

      const newImageAsset: ImageAsset = {
        id: `thumb-${Date.now()}`,
        fileUrl: dataUrl,
        fileName: `${(currentThumbSettings.title || 'cover').substring(0, 20)}.png`,
        fileSize: Math.round(dataUrl.length * 0.75),
        width,
        height,
        format: 'png',
        fitMode: 'cover',
        position: 'center',
        scale: 100,
        mediaType: 'image',
      };

      handleImageUploaded(newImageAsset);
    } catch (e) {
      console.error('Failed to apply thumbnail as reel image:', e);
    }
  };

  const handleApplyThumbnailCover = (imageAsset: ImageAsset) => {
    handleImageUploaded(imageAsset);
  };

  const handleSaveThumbnailSettings = (thumbnailSettings: ThumbnailSettings) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      thumbnailSettings,
      updatedAt: new Date().toISOString(),
    }));
  };

  const isTranscribingRef = useRef(false);

  const syncAudioWithTranscript = useCallback(
    async (targetProj: CaptionProject, silent = false): Promise<CaptionProject | null> => {
      if (!targetProj.audio || isTranscribingRef.current) return null;
      isTranscribingRef.current = true;
      setIsTranscribing(true);
      setTranscriptionError(null);
      try {
        const isSampleQuote = (t?: string) =>
          Boolean(
            t &&
              (t.includes('Zindagi mein kabhi HAAR') ||
                t.includes('ज़िंदगी में कभी हार') ||
                t.includes('girte wahi hain jo'))
          );

        const isCustomAudio = targetProj.audio.fileUrl !== '/sample-audio.mp3';

        const res = await fetch('/api/caption-maker/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: targetProj.audio.storagePath,
            fileUrl: targetProj.audio.fileUrl,
            preferredLanguage: targetProj.preferredLanguage || 'en',
            clipId: targetProj.sourceClipId,
            audioTitle: targetProj.audio.fileName || targetProj.title,
            forceRefresh: true,
            fallbackHint: {
              textHindi: isCustomAudio && isSampleQuote(targetProj.rawTranscriptHindi) ? undefined : targetProj.rawTranscriptHindi,
              textEnglish: isCustomAudio && isSampleQuote(targetProj.rawTranscriptEnglish) ? undefined : targetProj.rawTranscriptEnglish,
              titleHindi: isSampleQuote(targetProj.title) ? undefined : targetProj.title,
              titleEnglish: isSampleQuote(targetProj.title) ? undefined : targetProj.title,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to transcribe audio');
        }

        const lang = targetProj.preferredLanguage || 'en';
        const resolvedTitle =
          lang === 'hi'
            ? data.titleHindi || targetProj.title
            : data.titleEnglish || targetProj.title;

        let autoMatchedBgm = targetProj.bgMusic;
        if (!autoMatchedBgm && data.audioAnalysis?.recommendedBgmId) {
          const found = PRESET_BGM_TRACKS.find((t) => t.id === data.audioAnalysis.recommendedBgmId);
          if (found) {
            autoMatchedBgm = {
              ...found,
              volume: data.audioAnalysis.suggestedBgmVolume ?? 0.2,
            };
          }
        }

        const preValidated: CaptionProject = {
          ...targetProj,
          title: resolvedTitle,
          transcript: data.transcript,
          captionGroups: data.captionGroups,
          syncedSegments: data.syncedSegments || targetProj.syncedSegments,
          rawTranscriptHindi: data.rawTranscriptHindi || targetProj.rawTranscriptHindi,
          rawTranscriptEnglish: data.rawTranscriptEnglish || targetProj.rawTranscriptEnglish,
          isAudioSynced: true,
          syncVersion: data.wordTimingSource === 'model-word-level' ? 5 : 4,
          wordTimingSource: data.wordTimingSource || 'phrase-estimated',
          wordTimingLanguage: data.wordTimingLanguage,
          bgMusic: autoMatchedBgm,
          sfxCues: data.sfxCues || targetProj.sfxCues || [],
          autoSfxEnabled: targetProj.autoSfxEnabled !== false,
          audioAnalysis: data.audioAnalysis || targetProj.audioAnalysis || null,
          fillerSegments: data.fillerSegments || targetProj.fillerSegments || [],
          speaker1Color: targetProj.speaker1Color || '#FFFFFF',
          speaker2Color: targetProj.speaker2Color || '#06B6D4',
          updatedAt: new Date().toISOString(),
        };

        const healed = validateAndHealReelProject(
          preValidated,
          targetProj.audio?.duration || audioDuration
        ).healedProject;

        setProject(healed);
        try {
          accountCache.setItem('reel_caption_project_v2', JSON.stringify(healed));
        } catch {}
        setHistory((prevHist) => [...prevHist.slice(0, historyIndex + 1), healed]);
        setHistoryIndex((prevIdx) => prevIdx + 1);
        setLeftTab('transcript');
        return healed;
      } catch (err: any) {
        setTranscriptionError(err.message || 'Failed to re-analyze audio. Please retry.');
        setProject((current) => ({ ...current, isAudioSynced: false }));
        if (!silent) {
          console.error('Audio transcription error:', err);
        } else {
          console.warn('Auto audio sync failed:', err);
        }
        return null;
      } finally {
        isTranscribingRef.current = false;
        setIsTranscribing(false);
      }
    },
    [historyIndex, audioDuration]
  );

  // AI Smart Silence & Filler Trimmer ("AI Jump-Cutter")
  const [isTrimmingFillers, setIsTrimmingFillers] = useState<boolean>(false);

  const handleTrimFillers = async () => {
    if (!project.audio || !project.fillerSegments || project.fillerSegments.length === 0) return;
    setIsTrimmingFillers(true);
    try {
      const res = await fetch('/api/caption-maker/trim-fillers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: project.audio.storagePath,
          fileUrl: project.audio.fileUrl,
          fillerSegments: project.fillerSegments,
          transcript: project.transcript,
          syncedSegments: project.syncedSegments,
          sfxCues: project.sfxCues,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trim filler words');
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const updatedProj: CaptionProject = {
        ...project,
        audio: {
          ...project.audio,
          fileUrl: data.audioUrl,
          storagePath: data.storagePath,
          duration: data.duration,
        },
        transcript: data.transcript,
        captionGroups: data.captionGroups,
        syncedSegments: data.syncedSegments,
        sfxCues: data.sfxCues,
        fillerSegments: [],
        updatedAt: new Date().toISOString(),
      };

      setAudioDuration(data.duration);
      updateProjectWithHistory(() => updatedProj);
      handleSeek(0);
    } catch (err: any) {
      console.error('Failed to trim fillers:', err);
      alert(`Jump-cut error: ${err.message || 'Failed to trim fillers'}`);
    } finally {
      setIsTrimmingFillers(false);
    }
  };

  const handleAudioUploaded = (audio: AudioAsset) => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }
    setIsPlaying(false);
    setCurrentTime(0);

    const isDifferentAudio = project.audio?.fileUrl !== audio.fileUrl;
    const nextProject: CaptionProject = {
      ...project,
      audio,
      transcript: isDifferentAudio ? [] : project.transcript,
      captionGroups: isDifferentAudio ? [] : project.captionGroups,
      syncedSegments: isDifferentAudio ? undefined : project.syncedSegments,
      rawTranscriptHindi: isDifferentAudio ? undefined : project.rawTranscriptHindi,
      rawTranscriptEnglish: isDifferentAudio ? undefined : project.rawTranscriptEnglish,
      isAudioSynced: false,
      syncVersion: undefined,
      updatedAt: new Date().toISOString(),
    };

    setProject(nextProject);
    if (isDifferentAudio) {
      setHistory([nextProject]);
      setHistoryIndex(0);
    } else {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), nextProject]);
      setHistoryIndex((prev) => prev + 1);
    }

    try {
      accountCache.setItem('reel_caption_project_v2', JSON.stringify(nextProject));
    } catch {}

    setAudioDuration(audio.duration);
    handleSeek(0);

    // Automatically switch to Transcript tab and trigger AI analysis & caption synchronization
    setLeftTab('transcript');
    syncAudioWithTranscript(nextProject, false);
  };

  const handleAudioRemoved = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {}
    }
    if (bgMusicRef.current) {
      try {
        bgMusicRef.current.pause();
        bgMusicRef.current.currentTime = 0;
      } catch {}
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);

    // Strip any lingering ?clipId=... or ?projectId=... from the URL
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    const clearedProject: CaptionProject = {
      ...project,
      title: 'Untitled Reel',
      audio: undefined,
      transcript: [],
      captionGroups: [],
      syncedSegments: undefined,
      rawTranscriptHindi: undefined,
      rawTranscriptEnglish: undefined,
      thumbnailSettings: undefined,
      sourceClipId: undefined,
      isAudioSynced: false,
      syncVersion: undefined,
      updatedAt: new Date().toISOString(),
    };

    setProject(clearedProject);
    // "not show history": completely clear the history stack so undo/redo does NOT show or resurrect old transcript
    setHistory([clearedProject]);
    setHistoryIndex(0);

    // Switch view back to main video reel mode and assets tab
    setCenterViewMode('video');
    setLeftTab('assets');

    try {
      accountCache.setItem('reel_caption_project_v2', JSON.stringify(clearedProject));
      accountCache.removeItem('reel_caption_project_v1');
    } catch (e) {
      console.warn('Failed to update storage on audio removal:', e);
    }
  };

  const handleClearAllTranscript = () => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    const clearedTranscriptProject: CaptionProject = {
      ...project,
      title: 'Untitled Reel',
      transcript: [],
      captionGroups: [],
      syncedSegments: undefined,
      rawTranscriptHindi: undefined,
      rawTranscriptEnglish: undefined,
      thumbnailSettings: undefined,
      sourceClipId: undefined,
      isAudioSynced: false,
      syncVersion: undefined,
      updatedAt: new Date().toISOString(),
    };

    setProject(clearedTranscriptProject);
    setHistory([clearedTranscriptProject]);
    setHistoryIndex(0);
    setCenterViewMode('video');

    try {
      accountCache.setItem('reel_caption_project_v2', JSON.stringify(clearedTranscriptProject));
    } catch {}
  };

  const handleFitModeChange = (mode: ImageFitMode) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => {
      const image = prev.image
        ? { ...prev.image, fitMode: mode, position: prev.image.position || 'bottom-left', scale: prev.image.scale ?? 100 }
        : undefined;
      return {
        ...prev,
        image,
        mediaAssets: image
          ? [...new Map([...(prev.mediaAssets || []), image].map((asset) => [asset.id, asset] as const)).values()]
          : prev.mediaAssets,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleImagePositionChange = (position: ImagePosition) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => {
      const image = prev.image ? { ...prev.image, position } : undefined;
      return {
        ...prev,
        image,
        mediaAssets: image
          ? [...new Map([...(prev.mediaAssets || []), image].map((asset) => [asset.id, asset] as const)).values()]
          : prev.mediaAssets,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleImageScaleChange = (scale: number) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => {
      const image = prev.image ? { ...prev.image, scale } : undefined;
      return {
        ...prev,
        image,
        mediaAssets: image
          ? [...new Map([...(prev.mediaAssets || []), image].map((asset) => [asset.id, asset] as const)).values()]
          : prev.mediaAssets,
        updatedAt: new Date().toISOString(),
      };
    });
  };


  const handleTranscribe = async () => {
    await syncAudioWithTranscript(project, false);
  };

  // Keep existing v4 projects intact; only sync projects with no valid acoustic sync version.
  useEffect(() => {
    if (
      project.audio?.fileUrl &&
      project.audio.fileUrl !== '/sample-audio.mp3' &&
      (!project.isAudioSynced || ![4, 5].includes(project.syncVersion || 0) || project.transcript.length === 0) &&
      !isTranscribing
    ) {
      syncAudioWithTranscript(project, true);
    }
  }, [project.id, project.audio?.fileUrl, project.isAudioSynced, project.syncVersion, project.transcript.length]);

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

  const isSafeAreaOn = project.captionStyle?.showSafeArea === true;

  const handleToggleSafeArea = () => {
    const nextState = !isSafeAreaOn;
    updateProjectWithHistory((prev) => {
      const currentThumb = prev.thumbnailSettings || currentThumbSettings;
      return {
        ...prev,
        captionStyle: {
          ...prev.captionStyle,
          showSafeArea: nextState,
        },
        thumbnailSettings: {
          ...currentThumb,
          showSafeArea: nextState,
        },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleChangeStyle = (style: CaptionStyle) => {
    updateProjectWithHistory((prev) => {
      // Sync safe-zone platform/overrides to thumbnailSettings so thumbnail view stays synchronized
      const currentThumb = prev.thumbnailSettings || currentThumbSettings;
      const syncedThumb: ThumbnailSettings = {
        ...currentThumb,
        showSafeArea: style.showSafeArea,
        safeZoneOverrides: style.safeZoneOverrides
          ? {
              ...currentThumb.safeZoneOverrides,
              ...style.safeZoneOverrides,
            }
          : currentThumb.safeZoneOverrides,
      };

      return {
        ...prev,
        captionStyle: style,
        thumbnailSettings: syncedThumb,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleChangeOutput = (outputSettings: OutputSettings) => {
    updateProjectWithHistory((prev) => {
      const asp = outputSettings.aspectRatio;
      const targetAspect: '9:16' | '4:5' | '1:1' | '16:9' =
        asp === '16:9' || asp === '1:1' || asp === '4:5' || asp === '9:16'
          ? asp
          : '9:16';

      const currentThumb = prev.thumbnailSettings || currentThumbSettings;
      const presetPlatform = outputSettings.preset;

      return {
        ...prev,
        outputSettings,
        captionStyle: {
          ...prev.captionStyle,
          safeZoneOverrides: {
            ...prev.captionStyle.safeZoneOverrides,
            platform: presetPlatform,
          },
        },
        thumbnailSettings: {
          ...currentThumb,
          aspectRatio: targetAspect,
          safeZoneOverrides: {
            ...currentThumb.safeZoneOverrides,
            platform: presetPlatform,
          },
        },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Video Render Trigger (Remotion + GSAP or FFmpeg) with mandatory Pre-Render AI Sync & Quality Gate
  const handleStartRender = async (
    engine: 'remotion' | 'ffmpeg' = 'remotion',
    options?: {
      mergeThumbnail?: boolean;
      thumbnailMergeMode?: 'intro_and_poster' | 'intro_hook' | 'poster_only';
      thumbnailIntroDuration?: number;
    }
  ) => {
    if (!project.audio) {
      alert('Please upload an audio file before rendering.');
      return;
    }

    setIsRendering(true);
    setRenderProgress(2);
    setRenderResult(null);

    let activeProj = project;

    // Mandatory Pre-Render Check 1: Ensure audio & text are 100% acoustic-synced before spending time rendering
    if (
      activeProj.audio?.fileUrl &&
      activeProj.audio.fileUrl !== '/sample-audio.mp3' &&
      (!activeProj.isAudioSynced || ![4, 5].includes(activeProj.syncVersion || 0))
    ) {
      setRenderStatusText('Pre-Render Check: Locking audio waveform & caption timestamps...');
      const synced = await syncAudioWithTranscript(activeProj, true);
      if (synced) {
        activeProj = synced;
      }
    }

    // Mandatory Pre-Render Check 2: Validate & auto-heal word timestamps, overlaps, and pause boundaries
    const preFlight = validateAndHealReelProject(activeProj, audioDuration);
    if (!preFlight.ready) {
      setIsRendering(false);
      const errDetail = preFlight.checks.find((c) => c.status === 'error')?.detail || 'Project validation failed.';
      setRenderResult({ error: `Pre-Render Check Failed: ${errDetail}` });
      return;
    }
    if (preFlight.autoFixedCount > 0) {
      activeProj = preFlight.healedProject;
      setProject(activeProj);
    }

    setRenderProgress(5);
    setRenderStatusText(
      engine === 'remotion'
        ? 'Verified! Bundling Remotion React composition & GSAP typography...'
        : 'Verified! Initializing FFmpeg rendering pipeline...'
    );

    // Auto-generate or resolve thumbnail data URL if mergeThumbnail is enabled
    let thumbnailDataUrl = activeProj.thumbnailUrl;
    const shouldMerge = options?.mergeThumbnail !== false;

    if (shouldMerge && !thumbnailDataUrl && typeof window !== 'undefined') {
      try {
        const { renderThumbnailToCanvas, createDefaultThumbnailSettings } = await import(
          '@/lib/caption-maker/thumbnail-presets'
        );
        const canvas = document.createElement('canvas');
        const aspect = (activeProj.outputSettings?.aspectRatio === '4:5'
          ? '4:5'
          : activeProj.outputSettings?.aspectRatio === '1:1'
          ? '1:1'
          : activeProj.outputSettings?.aspectRatio === '16:9'
          ? '16:9'
          : '9:16') as '9:16' | '4:5' | '1:1' | '16:9';

        const thumbSettings =
          activeProj.thumbnailSettings ||
          createDefaultThumbnailSettings(activeProj.title, aspect);

        let bgImg: HTMLImageElement | null = null;
        if (activeProj.image?.fileUrl) {
          bgImg = await new Promise<HTMLImageElement | null>((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = activeProj.image!.fileUrl;
          });
        }

        await renderThumbnailToCanvas(canvas, thumbSettings, bgImg, activeProj.image);
        thumbnailDataUrl = canvas.toDataURL('image/png', 0.95);
      } catch (e) {
        console.warn('Could not auto-generate thumbnail before render:', e);
      }
    }

    const payload = {
      projectId: activeProj.id,
      projectTitle: activeProj.title,
      image: activeProj.image,
      imageUrl: activeProj.image?.fileUrl,
      imagePath: activeProj.image?.storagePath,
      imageFitMode: activeProj.image?.fitMode || 'cover',
      imagePosition: activeProj.image?.position || 'center',
      audio: activeProj.audio,
      audioUrl: activeProj.audio?.fileUrl,
      audioPath: activeProj.audio?.storagePath,
      voiceVolume: activeProj.voiceVolume ?? 1.0,
      voiceMuted: activeProj.voiceMuted ?? false,
      studioDenoise: activeProj.studioDenoise ?? false,
      transcript: activeProj.transcript,
      captionStyle: activeProj.captionStyle,
      captionGroups: activeProj.captionGroups,
      bgMusic: activeProj.bgMusic,
      preferredLanguage: activeProj.preferredLanguage,
      sfxCues: activeProj.sfxCues,
      autoSfxEnabled: activeProj.autoSfxEnabled !== false,
      speaker1Color: activeProj.speaker1Color,
      speaker2Color: activeProj.speaker2Color,
      outputSettings: activeProj.outputSettings,
      thumbnailDataUrl,
      mergeThumbnail: shouldMerge,
      thumbnailMergeMode: options?.thumbnailMergeMode || 'intro_and_poster',
      thumbnailIntroDuration: options?.thumbnailIntroDuration ?? 0.000001,
    };

    try {
      if (engine === 'remotion') {
        const response = await fetch('/api/caption-maker/render-remotion?stream=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Remotion render failed' }));
          throw new Error(errData.error || 'Remotion server render failed');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) {
          throw new Error('Streaming response body is unavailable');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const msg of messages) {
            if (msg.startsWith('data: ')) {
              try {
                const event = JSON.parse(msg.slice(6));
                if (event.type === 'progress') {
                  setRenderProgress(event.progress);
                  setRenderStatusText(
                    `Rendering GSAP typography frames... ${event.progress}%`
                  );
                } else if (event.type === 'complete') {
                  setRenderProgress(100);
                  setRenderStatusText('Remotion video rendering completed!');
                  setRenderResult({
                    videoUrl: event.videoUrl,
                    srtUrl: event.srtUrl,
                    thumbnailMerged: event.thumbnailMerged ?? shouldMerge,
                    thumbnailUrl: event.thumbnailUrl || payload.thumbnailDataUrl || project.thumbnailUrl,
                  });
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    renderedVideoUrl: event.videoUrl,
                    renderedVideoPath: event.videoPath,
                    renderedSrtPath: event.srtPath,
                  }));
                  return;
                } else if (event.type === 'error') {
                  throw new Error(event.error || 'Rendering pipeline error');
                }
              } catch (parseErr: any) {
                if (msg.includes('"type":"error"')) throw parseErr;
              }
            }
          }
        }
      } else {
        setRenderProgress(25);
        setRenderStatusText('Compositing ASS word-level animations & styles...');

        const response = await fetch('/api/caption-maker/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        setRenderProgress(70);
        setRenderStatusText('FFmpeg encoding H.264 video with AAC audio...');

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'FFmpeg rendering failed on the server.');
        }

        setRenderProgress(100);
        setRenderStatusText('FFmpeg rendering finished!');
        setRenderResult({
          videoUrl: data.videoUrl,
          srtUrl: data.srtUrl,
          thumbnailMerged: data.thumbnailMerged ?? shouldMerge,
          thumbnailUrl: data.thumbnailUrl || payload.thumbnailDataUrl || project.thumbnailUrl,
        });

        updateProjectWithHistory((prev) => ({
          ...prev,
          renderedVideoUrl: data.videoUrl,
          renderedVideoPath: data.videoPath,
          renderedSrtPath: data.srtPath,
        }));
      }
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

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col text-white font-sans">
        <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 sticky top-0 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-black shadow-md shadow-amber-400/20">
              <Film className="w-4 h-4 fill-black" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                AI Reel Maker
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Pro Studio
                </span>
              </span>
            </div>
          </Link>
          <button
            onClick={() => openAuthModal('login')}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs cursor-pointer shadow-sm transition-all"
          >
            Sign In / Register
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="max-w-md space-y-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-400/5">
              <Film className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold">Sign In to Use AI Reel Maker</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Please sign in or create an account to start editing animated captions, generating thumbnails, and rendering video reels.
            </p>
            <div className="pt-2">
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs cursor-pointer shadow-lg shadow-white/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                Sign In to Continue
              </button>
            </div>
          </div>
        </main>
        <AuthModal />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="AI Reel Maker"
      subtitle={project.title}
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Reel Maker' },
        { label: project.title },
      ]}
      contentFullWidth
    >
      <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
        {/* Audio Engine element */}
        <audio
          ref={audioRef}
          src={project.audio?.fileUrl || undefined}
          onTimeUpdate={handleAudioTimeUpdate}
          onEnded={handleAudioEnded}
          onLoadedMetadata={(e) => {
            if (!project.audio) return;
            const d = (e.target as HTMLAudioElement).duration;
            if (d && !isNaN(d) && isFinite(d) && d > 0) {
              const rounded = Number(d.toFixed(2));
              setAudioDuration(rounded);
              setProject((prev) =>
                prev.audio && Math.abs((prev.audio.duration || 0) - rounded) > 0.1
                  ? {
                      ...prev,
                      audio: {
                        ...prev.audio,
                        duration: rounded,
                      },
                    }
                  : prev
              );
            }
          }}
          preload="auto"
        />

        {/* Background Music Engine element */}
        {project.bgMusic?.fileUrl && (
          <audio
            ref={bgMusicRef}
            src={project.bgMusic.fileUrl}
            loop
            preload="auto"
            className="hidden"
          />
        )}

        {/* Crash Recovery Notification Banner */}
        {crashRecoverySnapshot && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-40 relative">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Auto-Recovery Found:</strong> An unsaved snapshot from{' '}
                {new Date(crashRecoverySnapshot.timestamp).toLocaleTimeString()} ({crashRecoverySnapshot.wordCount} words) was found.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRestoreProject(crashRecoverySnapshot.project)}
                className="px-2.5 py-1 bg-amber-400 text-black font-semibold rounded hover:bg-amber-300 transition-colors shadow-sm cursor-pointer"
              >
                Restore Session
              </button>
              <button
                type="button"
                onClick={() => setCrashRecoverySnapshot(null)}
                className="px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Caption Studio Workspace Toolbar */}
        <div className="h-12 border-b border-zinc-800 bg-zinc-900/60 px-4 flex items-center justify-between shrink-0 z-20 gap-3">
          {/* Project Name Editable & Language Switcher */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={project.title}
              onChange={(e) =>
                updateProjectWithHistory((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              className="bg-zinc-950 hover:bg-zinc-800 focus:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 focus:border-amber-400 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-200 focus:outline-none transition-all w-48 truncate"
              placeholder="Project title..."
            />

            {/* Multilingual Language Switcher Toggle (English / Hindi / Hinglish) */}
            <div className="flex items-center bg-zinc-800/90 rounded-lg p-0.5 border border-zinc-700/60 text-xs">
              <button
                type="button"
                onClick={() => handleSwitchLanguage('en')}
                className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                  project.preferredLanguage === 'en'
                    ? 'bg-amber-400 text-black shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Show English captions"
              >
                English
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('hi')}
                className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                  project.preferredLanguage === 'hi'
                    ? 'bg-amber-400 text-black shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Show Hindi captions"
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('hinglish')}
                className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                  project.preferredLanguage === 'hinglish'
                    ? 'bg-amber-400 text-black shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Show Hinglish captions (Roman Hindi)"
              >
                Hinglish
              </button>
            </div>

            {/* Word timing quality badge */}
            {(() => {
              const exactWordCount = project.transcript.filter((word) => word.timingSource === 'model-word-level').length;
              const wordTimingCoverage = project.transcript.length
                ? Math.round((exactWordCount / project.transcript.length) * 100)
                : 0;
              const hasStrongWordTiming = wordTimingCoverage >= 85;
              return (
            <button
              type="button"
              onClick={handleTranscribe}
              disabled={isTranscribing}
              title={hasStrongWordTiming
                ? 'Most visible caption words use speech-recognizer word timestamps. Click to sync again.'
                : 'Current captions use phrase-based timing estimates. Click to request accurate word-level timing.'}
              className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                isTranscribing
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : hasStrongWordTiming
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-amber-500/10 border-amber-500/35 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Verifying Audio Sync...</span>
                </>
              ) : (
                <>
                  {hasStrongWordTiming
                    ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    : <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />}
                  <span>
                    {hasStrongWordTiming
                      ? `Word Sync ${wordTimingCoverage}%`
                      : exactWordCount > 0
                        ? `Word Sync ${wordTimingCoverage}% · Verify`
                        : project.isAudioSynced
                          ? 'Estimated Sync · Verify'
                          : 'Verify Audio Sync'}
                  </span>
                </>
              )}
            </button>
              );
            })()}
          </div>

          {/* Action Controls (Undo, Redo, Save, Render, Shortcuts) */}
          <div className="flex items-center gap-2">
            {/* Undo / Redo */}
            <div className="flex items-center bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/60">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
                className="p-1 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reset */}
            <button
              onClick={handleResetProject}
              title="Reset Project"
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Safe Mode Toggle Button in Header */}
            <button
              type="button"
              onClick={handleToggleSafeArea}
              title={
                isSafeAreaOn
                  ? 'Safe Mode guides are ON (Overlaying 9:16 safe zones). Click to hide.'
                  : 'Safe Mode guides are OFF. Click to show.'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 ${
                isSafeAreaOn
                  ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 hover:bg-sky-500/30 shadow-sky-500/10'
                  : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              <Shield className={`w-3.5 h-3.5 ${isSafeAreaOn ? 'text-sky-400' : 'text-zinc-500'}`} />
              <span>Safe Mode: {isSafeAreaOn ? 'ON' : 'OFF'}</span>
            </button>

            {/* Autosave Status Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-[11px] text-zinc-400">
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  autosaveStatus === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              <span>{autosaveStatus === 'saving' ? 'Saving...' : 'Autosaved'}</span>
            </div>

            {/* Save */}
            <button
              onClick={handleSaveProject}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
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

            {/* Platform & Canvas Setting Trigger */}
            <button
              onClick={() => {
                if (rightTab === 'canvas') {
                  setRightTab('style');
                } else {
                  setRightTab('canvas');
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer ${
                rightTab === 'canvas'
                  ? 'bg-amber-400 text-black border-amber-400 font-bold shadow-md shadow-amber-400/20'
                  : 'border-zinc-700/60 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
              }`}
              title="Target Platform Preset, Aspect Ratio & Canvas Resolution"
            >
              <Tv className={`w-3.5 h-3.5 ${rightTab === 'canvas' ? 'text-black' : 'text-amber-400'}`} />
              <span className="hidden sm:inline">Canvas</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                  rightTab === 'canvas'
                    ? 'bg-black/20 text-black border-black/30'
                    : 'bg-zinc-950 text-amber-300 border-zinc-800'
                }`}
              >
                {project.outputSettings.aspectRatio}
              </span>
            </button>

            {/* Render / Export Modal Trigger */}
            <button
              onClick={() => setIsExportOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg text-xs shadow-md shadow-amber-400/10 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Render Reel</span>
            </button>
          </div>
        </div>

      {/* Main 3-Column Studio Editor Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* LEFT COLUMN: Assets & Audio and Transcript Tabs */}
        <section className="w-full md:w-80 lg:w-96 flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 min-h-0">
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
              Transcript
              {project.captionGroups.length > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded-full font-mono">
                  {project.captionGroups.length}
                </span>
              )}
            </button>
          </div>

          {/* Left Tab Body (Scrollable for assets, flex pinned for transcript) */}
          {transcriptionError && (
            <div role="alert" className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p>{transcriptionError}</p>
              <button type="button" disabled={isTranscribing || !project.audio}
                onClick={() => void syncAudioWithTranscript(project)}
                className="mt-2 rounded bg-amber-400 px-3 py-1 font-semibold text-black disabled:opacity-50">
                {isTranscribing ? 'Retrying speech recognition…' : 'Retry transcription'}
              </button>
            </div>
          )}
          <div
            className={`flex-1 min-h-0 ${
              leftTab === 'transcript' ? 'overflow-hidden flex flex-col p-3' : 'overflow-y-auto p-3'
            }`}
          >
            {leftTab === 'assets' ? (
              <AssetUploadSection
                image={project.image}
                mediaAssets={project.mediaAssets || (project.image ? [project.image] : [])}
                audio={project.audio}
                onImageChange={(img) => {
                  if (img) handleImageUploaded(img);
                  else {
                    const isAudioEmpty = !project.audio;
                    if (isAudioEmpty) {
                      setCenterViewMode('video');
                    }
                    updateProjectWithHistory((prev) => ({
                      ...prev,
                      image: undefined,
                      title: isAudioEmpty ? 'Untitled Reel' : prev.title,
                      thumbnailSettings: isAudioEmpty ? undefined : prev.thumbnailSettings,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
                onAudioChange={(aud) => {
                  if (aud) handleAudioUploaded(aud);
                  else {
                    handleAudioRemoved();
                  }
                }}
                onTranscribe={handleTranscribe}
                isTranscribing={isTranscribing}
                onFitModeChange={handleFitModeChange}
                onPositionChange={handleImagePositionChange}
                onScaleChange={handleImageScaleChange}
                preferredLanguage={project.preferredLanguage || 'en'}
                onLanguageChange={handleSwitchLanguage}
                bgMusic={project.bgMusic}
                onBgMusicChange={handleBgMusicChange}
                voiceVolume={project.voiceVolume ?? 1.0}
                voiceMuted={project.voiceMuted ?? false}
                studioDenoise={project.studioDenoise ?? false}
                onVoiceVolumeChange={(val) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    voiceVolume: val,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onVoiceMutedChange={(muted) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    voiceMuted: muted,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onStudioDenoiseChange={(denoise) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    studioDenoise: denoise,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                audioAnalysis={project.audioAnalysis}
                sfxCues={project.sfxCues}
                autoSfxEnabled={project.autoSfxEnabled !== false}
                onAutoSfxEnabledChange={(enabled) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    autoSfxEnabled: enabled,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                fillerSegments={project.fillerSegments}
                onTrimFillers={handleTrimFillers}
                isTrimmingFillers={isTrimmingFillers}
                onOpenSmartEditor={() => setIsSmartEditorOpen(true)}
                speaker1Color={project.speaker1Color || '#FFFFFF'}
                speaker2Color={project.speaker2Color || '#06B6D4'}
                onSpeaker1ColorChange={(col) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    speaker1Color: col,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onSpeaker2ColorChange={(col) => {
                  updateProjectWithHistory((prev) => ({
                    ...prev,
                    speaker2Color: col,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
              />
            ) : (
              <div className="h-full min-h-0">
                <TranscriptEditor
                  groups={
                    project.captionGroups && project.captionGroups.length > 0
                      ? project.captionGroups
                      : project.transcript && project.transcript.length > 0
                      ? groupTranscriptWords(project.transcript, 4)
                      : []
                  }
                  currentTime={currentTime}
                  onUpdateGroups={handleUpdateGroups}
                  onSeek={handleSeek}
                  onClearAll={handleClearAllTranscript}
                  onAutoDetectTranscript={handleTranscribe}
                  isTranscribing={isTranscribing}
                />
              </div>
            )}
          </div>
        </section>

        {/* CENTER COLUMN: Real-Time Canvas Video Preview OR Live Thumbnail Cover Output */}
        <main className="flex-1 flex flex-col bg-zinc-950 items-center justify-center p-3 sm:p-4 overflow-hidden relative">
          <div className="flex flex-col items-center justify-center w-full h-full relative">
            {/* Center Mode Switcher Tabs */}
            <div className="flex items-center justify-between w-full max-w-sm sm:max-w-md mb-2 px-1 text-xs">
              <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCenterViewMode('video');
                    setRightTab('style');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    centerViewMode === 'video'
                      ? 'bg-amber-400 text-black font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Switch to Video Reel Playback Preview"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Video Reel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCenterViewMode('thumbnail');
                    setRightTab('thumbnail');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    centerViewMode === 'thumbnail'
                      ? 'bg-amber-400 text-black font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Switch to Live Thumbnail Cover Output"
                >
                  <ImageIcon className={`w-3.5 h-3.5 ${centerViewMode === 'thumbnail' ? 'fill-black' : 'text-amber-400'}`} />
                  <span>Thumbnail Cover</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                {centerViewMode === 'thumbnail'
                  ? `${currentThumbSettings.aspectRatio === '16:9' ? '1920 × 1080' : currentThumbSettings.aspectRatio === '1:1' ? '1080 × 1080' : currentThumbSettings.aspectRatio === '4:5' ? '1080 × 1350' : '1080 × 1920'}`
                  : `${project.outputSettings.width} × ${project.outputSettings.height}`}
              </span>
            </div>

            {centerViewMode === 'thumbnail' ? (
              <ThumbnailPreview
                settings={currentThumbSettings}
                image={project.image}
                outputSettings={project.outputSettings}
                onSwitchToVideo={() => {
                  setCenterViewMode('video');
                  setRightTab('style');
                }}
                onDownload={handleDownloadThumbnail}
                onApplyAsReelImage={handleApplyThumbnailAsReelImage}
                onToggleSafeArea={() => {
                  handleChangeThumbnailSettings({
                    ...currentThumbSettings,
                    showSafeArea: currentThumbSettings.showSafeArea === false ? true : false,
                  });
                }}
                onUpdateSettings={(updates) => {
                  handleChangeThumbnailSettings({
                    ...currentThumbSettings,
                    ...updates,
                  });
                }}
                onEditBadge={() => {
                  setRightTab('thumbnail');
                  setThumbnailSubTab('badge');
                }}
                onEditTitle={() => {
                  setRightTab('thumbnail');
                  setThumbnailSubTab('content');
                }}
              />
            ) : (
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
                speaker1Color={project.speaker1Color || '#FFFFFF'}
                speaker2Color={project.speaker2Color || '#06B6D4'}
                sfxCues={project.sfxCues}
                autoSfxEnabled={project.autoSfxEnabled !== false}
                onUpdateStyle={(updates) =>
                  handleChangeStyle({ ...project.captionStyle, ...updates })
                }
              />
            )}
          </div>
        </main>

        {/* RIGHT COLUMN: Caption Style & Thumbnail Style Tabs */}
        <section className="w-full md:w-80 lg:w-96 flex flex-col border-l border-zinc-800 bg-zinc-950 shrink-0 min-h-0">
          {/* Tab Headers: Clean 2 tabs only */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/60 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => {
                setRightTab('style');
                setCenterViewMode('video');
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                rightTab === 'style'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>Caption Styles</span>
            </button>

            <button
              onClick={() => {
                setRightTab('thumbnail');
                setCenterViewMode('thumbnail');
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                rightTab === 'thumbnail'
                  ? 'bg-zinc-800 text-amber-300 shadow-sm border border-amber-500/30 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              <span>Thumbnail Style</span>
            </button>
          </div>

          {/* Right Tab Body (Scrollable Box) */}
          <div className={`flex-1 min-h-0 p-3 ${rightTab === 'canvas' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
            {rightTab === 'canvas' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <Tv className="w-4 h-4 text-amber-400" />
                    <span>Platform & Canvas Settings</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightTab('style')}
                    className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 cursor-pointer transition-colors"
                  >
                    Back to Styles
                  </button>
                </div>
                <OutputSettingsPanel
                  settings={project.outputSettings}
                  onChangeSettings={handleChangeOutput}
                  audioDuration={audioDuration}
                />
              </div>
            ) : rightTab === 'thumbnail' ? (
              <ThumbnailStylePanel
                settings={currentThumbSettings}
                onChangeSettings={handleChangeThumbnailSettings}
                projectTitle={project.title}
                captionGroups={project.captionGroups}
                image={project.image}
                onDownload={handleDownloadThumbnail}
                onApplyAsReelImage={handleApplyThumbnailAsReelImage}
                activeSubTab={thumbnailSubTab}
                onSelectSubTab={setThumbnailSubTab}
              />
            ) : (
              <CaptionStylePanel
                style={project.captionStyle}
                onChangeStyle={handleChangeStyle}
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
          trimRange={project.trimRange}
          onSeek={handleSeek}
          onTogglePlay={togglePlay}
          onTrimChange={handleTrimChange}
          onUpdateGroups={handleUpdateGroups}
          onOpenSmartEditor={() => setIsSmartEditorOpen(true)}
        />
      </footer>

      {/* Render / Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
        onStartRender={handleStartRender}
        onUpdateOutputSettings={handleChangeOutput}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStatusText={renderStatusText}
        renderResult={renderResult}
        onOpenThumbnailCreator={() => {
          setIsExportOpen(false);
          setRightTab('thumbnail');
          setCenterViewMode('thumbnail');
        }}
        onOpenSocialPost={() => {
          setIsExportOpen(false);
          router.push('/social-post');
        }}
      />

      {/* AI Smart Editing & Silence Studio Modal */}
      <SmartEditorModal
        isOpen={isSmartEditorOpen}
        onClose={() => setIsSmartEditorOpen(false)}
        words={project.transcript}
        captionGroups={project.captionGroups}
        totalDuration={audioDuration}
        audio={project.audio}
        fillerSegments={project.fillerSegments}
        onApplyTrimmedAudio={(data) => {
          setAudioDuration(data.duration);
          updateProjectWithHistory((prev) => ({
            ...prev,
            audio: prev.audio
              ? {
                  ...prev.audio,
                  fileUrl: data.audioUrl,
                  storagePath: data.storagePath || prev.audio.storagePath,
                  duration: data.duration,
                }
              : undefined,
            transcript: data.transcript,
            captionGroups: data.captionGroups,
            fillerSegments: [],
            isAudioSynced: true,
            syncVersion: 4,
            updatedAt: new Date().toISOString(),
          }));
        }}
        onUpdateWords={(updatedWords) => {
          const newGroups = groupTranscriptWords(updatedWords, 4);
          updateProjectWithHistory((prev) => ({
            ...prev,
            transcript: updatedWords,
            captionGroups: newGroups,
            updatedAt: new Date().toISOString(),
          }));
        }}
        onSetTrimRange={(range) => {
          handleTrimChange(range.start, range.end);
        }}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Project Version History, Snapshots & Crash Recovery Modal */}
      <ProjectHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        currentProject={project}
        onRestoreProject={handleRestoreProject}
        onDuplicateProject={handleDuplicateProject}
      />
    </div>
  </DashboardLayout>
);
}

export default function CaptionMakerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center py-32 space-y-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-xs">Loading Caption Studio...</p>
        </div>
      }
    >
      <CaptionMakerPageContent />
    </Suspense>
  );
}
