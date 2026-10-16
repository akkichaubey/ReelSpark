'use strict';
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
} from '@/lib/caption-maker/types';
import { createDefaultCaptionProject } from '@/lib/caption-maker/sample-data';
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
import {
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
  getThumbnailDimensions,
} from '@/lib/caption-maker/thumbnail-presets';
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
  Image as ImageIcon,
  ShieldCheck,
  Loader2,
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
  const [rightTab, setRightTab] = useState<'style' | 'thumbnail' | 'canvas'>('style');
  const [centerViewMode, setCenterViewMode] = useState<'video' | 'thumbnail'>('video');
  const [thumbnailSubTab, setThumbnailSubTab] = useState<ThumbnailSubTab>('layout');

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
      let saved = localStorage.getItem('reel_caption_project_v2');
      if (!saved) {
        saved = localStorage.getItem('reel_caption_project_v1');
      }
      if (saved) {
        const parsed = JSON.parse(saved);
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
            // Default any unset or previous default values to contain, bottom-left, and 100% scale
            if (!parsed.image.fitMode || parsed.image.fitMode === 'cover') {
              parsed.image.fitMode = 'contain';
            }
            if (!parsed.image.position || parsed.image.position === 'center') {
              parsed.image.position = 'bottom-left';
            }
            if (parsed.image.scale === undefined || parsed.image.scale === 85) {
              parsed.image.scale = 100;
            }
          }
          if (!parsed.audio) {
            parsed.audio = {
              id: 'default_audio',
              fileName: 'sample-audio.mp3',
              fileUrl: '/sample-audio.mp3',
              storagePath: 'public/sample-audio.mp3',
              fileSize: 104950,
              duration: 10.1,
              format: 'audio/mp3',
            };
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
          if (parsed.captionStyle.showSafeArea === undefined) {
            parsed.captionStyle.showSafeArea = true;
          }
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
      try {
        localStorage.setItem('reel_caption_project_v2', JSON.stringify(restoredParsed));
      } catch {}
      setProject(restoredParsed);
      setHistory([restoredParsed]);
      setHistoryIndex(0);
      if (restoredParsed.audio?.duration) {
        setAudioDuration(restoredParsed.audio.duration);
      }
      if (restoredParsed.transcript && restoredParsed.transcript.length > 0) {
        setLeftTab('transcript');
      }
      return;
    }

    // Dynamically fetch clip from /api/projects when URL has a new clipId or localStorage is empty
    try {
      const projRes = await fetch('/api/projects');
      const projData = await projRes.json();
      if (projData?.success && Array.isArray(projData.projects) && projData.projects.length > 0) {
        let matchedProj: any = null;
        let matchedCand: any = null;

        if (urlClipId) {
          for (const p of projData.projects) {
            if (urlProjectId && p.id !== urlProjectId) continue;
            const c = (p.candidates || []).find((cand: any) => cand.id === urlClipId);
            if (c) {
              matchedProj = p;
              matchedCand = c;
              break;
            }
          }
        }

        // If no URL clipId and no localStorage project existed, dynamically pick the first available clip
        if (!matchedCand && !restoredParsed) {
          for (const p of projData.projects) {
            if (Array.isArray(p.candidates) && p.candidates.length > 0) {
              matchedProj = p;
              matchedCand = p.candidates[0];
              break;
            }
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
            localStorage.setItem('reel_caption_project_v2', JSON.stringify(dynamicReelProj));
          } catch {}
          setProject(dynamicReelProj);
          setHistory([dynamicReelProj]);
          setHistoryIndex(0);
          if (dynamicReelProj.audio?.duration) {
            setAudioDuration(dynamicReelProj.audio.duration);
          }
          setLeftTab('transcript');
          return;
        }
      }
    } catch {}

    const fallbackProj = restoredParsed || createDefaultCaptionProject();
    setProject(fallbackProj);
    setHistory([fallbackProj]);
    setHistoryIndex(0);
    if (fallbackProj.audio?.duration) {
      setAudioDuration(fallbackProj.audio.duration);
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

  // Switch project transcript between English and Hindi
  const handleSwitchLanguage = (lang: 'en' | 'hi') => {
    if (project.preferredLanguage === lang) return;
    updateProjectWithHistory((prev) => {
      const switched = switchProjectLanguage(prev, lang);
      try {
        localStorage.setItem('reel_caption_project_v2', JSON.stringify(switched));
      } catch {}
      return switched;
    });
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
      setIsPlaying(false);
    } else {
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
      setIsPlaying(true);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
    };
  }, []);

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

  // 60fps playhead sync using requestAnimationFrame for millisecond-accurate word & phrase highlights
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isPlaying]);

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
      localStorage.setItem('reel_caption_project_v2', JSON.stringify(project));
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
  const handleImageUploaded = (image: ImageAsset, accompanyingAudio?: AudioAsset) => {
    updateProjectWithHistory((prev) => {
      const useAccompanying = Boolean(accompanyingAudio && (!prev.audio || prev.audio.fileUrl === '/sample-audio.mp3'));
      const normalizedImage: ImageAsset = {
        ...image,
        fitMode: image.fitMode || 'contain',
        position: image.position || 'bottom-left',
        scale: image.scale ?? 100,
      };
      return {
        ...prev,
        image: normalizedImage,
        audio: useAccompanying ? accompanyingAudio : prev.audio,
        isAudioSynced: useAccompanying ? false : prev.isAudioSynced,
        syncVersion: useAccompanying ? undefined : prev.syncVersion,
        updatedAt: new Date().toISOString(),
      };
    });
    if (accompanyingAudio && (!project.audio || project.audio.fileUrl === '/sample-audio.mp3')) {
      setAudioDuration(accompanyingAudio.duration);
      handleSeek(0);
    }
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
      return {
        ...project.thumbnailSettings,
        aspectRatio: initialThumbAspect,
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

    return createDefaultThumbnailSettings(
      resolvedTitle,
      initialThumbAspect,
      (project.captionStyle?.position as any) || 'top',
      project.captionStyle?.customY ?? (project.captionStyle?.position === 'top' ? 18 : 50),
      project.captionStyle?.fontFamily || 'Montserrat',
      project.captionStyle?.importantColor || '#FCD905'
    );
  }, [
    project.thumbnailSettings,
    project.title,
    project.captionGroups,
    project.captionStyle?.position,
    project.captionStyle?.customY,
    project.captionStyle?.fontFamily,
    project.captionStyle?.importantColor,
    initialThumbAspect,
  ]);

  const handleChangeThumbnailSettings = (newSettings: ThumbnailSettings) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      thumbnailSettings: newSettings,
      updatedAt: new Date().toISOString(),
    }));
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
        fitMode: 'contain',
        position: 'bottom-left',
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

  const handleAudioUploaded = (audio: AudioAsset) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      audio,
      isAudioSynced: false,
      syncVersion: undefined,
      syncedSegments: undefined,
      updatedAt: new Date().toISOString(),
    }));
    setAudioDuration(audio.duration);
    handleSeek(0);
  };

  const handleFitModeChange = (mode: ImageFitMode) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => ({
      ...prev,
      image: prev.image
        ? {
            ...prev.image,
            fitMode: mode,
            position: prev.image.position || 'bottom-left',
            scale: prev.image.scale ?? 100,
          }
        : undefined,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleImagePositionChange = (position: ImagePosition) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => ({
      ...prev,
      image: prev.image ? { ...prev.image, position } : undefined,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleImageScaleChange = (scale: number) => {
    if (!project.image) return;
    updateProjectWithHistory((prev) => ({
      ...prev,
      image: prev.image ? { ...prev.image, scale } : undefined,
      updatedAt: new Date().toISOString(),
    }));
  };

  const syncAudioWithTranscript = useCallback(
    async (targetProj: CaptionProject, silent = false): Promise<CaptionProject | null> => {
      if (!targetProj.audio) return null;
      setIsTranscribing(true);
      try {
        const res = await fetch('/api/caption-maker/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: targetProj.audio.storagePath,
            fileUrl: targetProj.audio.fileUrl,
            preferredLanguage: targetProj.preferredLanguage || 'en',
            fallbackHint: {
              textHindi: targetProj.rawTranscriptHindi,
              textEnglish: targetProj.rawTranscriptEnglish,
              titleHindi: targetProj.title,
              titleEnglish: targetProj.title,
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

        const preValidated: CaptionProject = {
          ...targetProj,
          title: resolvedTitle,
          transcript: data.transcript,
          captionGroups: data.captionGroups,
          syncedSegments: data.syncedSegments || targetProj.syncedSegments,
          rawTranscriptHindi: data.rawTranscriptHindi || targetProj.rawTranscriptHindi,
          rawTranscriptEnglish: data.rawTranscriptEnglish || targetProj.rawTranscriptEnglish,
          isAudioSynced: true,
          syncVersion: 4,
          updatedAt: new Date().toISOString(),
        };

        const healed = validateAndHealReelProject(
          preValidated,
          targetProj.audio?.duration || audioDuration
        ).healedProject;

        setProject(healed);
        try {
          localStorage.setItem('reel_caption_project_v2', JSON.stringify(healed));
        } catch {}
        setHistory((prevHist) => [...prevHist.slice(0, historyIndex + 1), healed]);
        setHistoryIndex((prevIdx) => prevIdx + 1);
        setLeftTab('transcript');
        return healed;
      } catch (err: any) {
        if (!silent) {
          alert(err.message || 'Transcription failed');
        } else {
          console.warn('Auto audio sync failed:', err);
        }
        return null;
      } finally {
        setIsTranscribing(false);
      }
    },
    [historyIndex, audioDuration]
  );

  const handleTranscribe = async () => {
    await syncAudioWithTranscript(project, false);
  };

  // Automatically sync audio & text when any clip or uploaded audio project is loaded without acoustic-locked syncVersion 4
  useEffect(() => {
    if (
      project.audio?.fileUrl &&
      project.audio.fileUrl !== '/sample-audio.mp3' &&
      (!project.isAudioSynced || project.syncVersion !== 4) &&
      !isTranscribing
    ) {
      syncAudioWithTranscript(project, true);
    }
  }, [project.id, project.audio?.fileUrl, project.isAudioSynced, project.syncVersion]);

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
    updateProjectWithHistory((prev) => {
      const asp = outputSettings.aspectRatio;
      const targetAspect: '9:16' | '4:5' | '1:1' | '16:9' =
        asp === '16:9' || asp === '1:1' || asp === '4:5' || asp === '9:16'
          ? asp
          : '9:16';

      return {
        ...prev,
        outputSettings,
        thumbnailSettings: prev.thumbnailSettings
          ? {
              ...prev.thumbnailSettings,
              aspectRatio: targetAspect,
            }
          : undefined,
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
      (!activeProj.isAudioSynced || activeProj.syncVersion !== 4)
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
      transcript: activeProj.transcript,
      captionStyle: activeProj.captionStyle,
      captionGroups: activeProj.captionGroups,
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

        {/* Project Name Editable & Language Switcher */}
        <div className="hidden lg:flex items-center gap-3">
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

          {/* Bilingual Language Switcher Toggle */}
          {(project.rawTranscriptHindi || project.rawTranscriptEnglish) && (
            <div className="flex items-center bg-zinc-800/90 rounded-lg p-0.5 border border-zinc-700/60 text-xs">
              <button
                type="button"
                onClick={() => handleSwitchLanguage('en')}
                className={`px-2 py-0.5 rounded font-medium transition-all ${
                  project.preferredLanguage === 'en'
                    ? 'bg-amber-400 text-black shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Show English captions"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('hi')}
                className={`px-2 py-0.5 rounded font-medium transition-all ${
                  project.preferredLanguage === 'hi'
                    ? 'bg-amber-400 text-black shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Show Hindi captions"
              >
                हिन्दी
              </button>
            </div>
          )}

          {/* Live AI Pre-Check Verification Badge */}
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={isTranscribing}
            title="Click to re-verify audio & caption waveform sync"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
              isTranscribing
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : project.isAudioSynced && project.syncVersion === 4
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-sky-500/15 border-sky-500/35 text-sky-300 hover:bg-sky-500/25'
            }`}
          >
            {isTranscribing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Verifying Audio Sync...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {project.isAudioSynced && project.syncVersion === 4
                    ? `AI Sync Verified (${project.captionGroups.length} Phrases)`
                    : 'Verify Audio Sync'}
                </span>
              </>
            )}
          </button>
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

          {/* Platform & Canvas Setting Trigger (activates Canvas tab on the right side) */}
          <button
            onClick={() => {
              if (rightTab === 'canvas') {
                setRightTab('style');
              } else {
                setRightTab('canvas');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer ${
              rightTab === 'canvas'
                ? 'bg-amber-400 text-black border-amber-400 font-bold shadow-md shadow-amber-400/20'
                : 'border-zinc-700/60 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
            }`}
            title="Target Platform Preset, Aspect Ratio & Canvas Resolution"
          >
            <Tv className={`w-3.5 h-3.5 ${rightTab === 'canvas' ? 'text-black' : 'text-amber-400'}`} />
            <span className="hidden sm:inline">Platform & Canvas</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
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
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Render Reel</span>
          </button>
        </div>
      </header>

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

          {/* Left Tab Body (Scrollable Box) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {leftTab === 'assets' ? (
              <AssetUploadSection
                image={project.image}
                audio={project.audio}
                onImageChange={(img, aud) => {
                  if (img) handleImageUploaded(img, aud);
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
                onPositionChange={handleImagePositionChange}
                onScaleChange={handleImageScaleChange}
              />
            ) : (
              <div className="flex flex-col h-full gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleTranscribe}
                      disabled={isTranscribing || !project.audio}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isTranscribing
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : project.isAudioSynced
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-amber-400 text-black hover:bg-amber-300 shadow-sm'
                      }`}
                      title="Transcribe and synchronize caption timestamps directly from clip audio"
                    >
                      <Sparkles className="w-3 h-3" />
                      {isTranscribing
                        ? 'Syncing Audio...'
                        : project.isAudioSynced
                        ? 'Audio Synced'
                        : 'Sync Audio & Text'}
                    </button>
                  </div>

                  {(project.rawTranscriptHindi || project.rawTranscriptEnglish) && (
                    <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-md border border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleSwitchLanguage('en')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                          project.preferredLanguage === 'en'
                            ? 'bg-amber-400 text-black font-semibold shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        English
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchLanguage('hi')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                          project.preferredLanguage === 'hi'
                            ? 'bg-amber-400 text-black font-semibold shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        हिन्दी
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <TranscriptEditor
                    groups={project.captionGroups}
                    currentTime={currentTime}
                    onUpdateGroups={handleUpdateGroups}
                    onSeek={handleSeek}
                  />
                </div>
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
                  <Sparkles className={`w-3.5 h-3.5 ${centerViewMode === 'thumbnail' ? 'fill-black' : 'text-amber-400'}`} />
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
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Thumbnail Style</span>
            </button>
          </div>

          {/* Right Tab Body (Scrollable Box) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
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
        onOpenThumbnailCreator={() => {
          setIsExportOpen(false);
          setRightTab('thumbnail');
          setCenterViewMode('thumbnail');
        }}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
