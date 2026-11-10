'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Play,
  Pause,
  Maximize,
  Volume2,
  VolumeX,
  Sliders,
  AlertCircle,
  Scissors,
  Clapperboard,
  ChefHat,
  Zap,
  GraduationCap,
  Mic,
  Film,
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileVideo,
  CheckCircle2,
  Upload,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AutoCutSceneReview } from './AutoCutSceneReview';
import { reconcileAutoCutScenes, sceneCandidates } from '@/lib/auto-cut/scenes';
import { assembleRecipe } from '@/lib/auto-cut/recipe';
import { AutoCutRecipeReview } from './AutoCutRecipeReview';
import { AutoCutSpeechReview } from './AutoCutSpeechReview';
import { AutoCutHookReview } from './AutoCutHookReview';
import { AutoCutDuplicateReview } from './AutoCutDuplicateReview';
import { AutoCutQualityReview } from './AutoCutQualityReview';
import { AutoCutBRollReview } from './AutoCutBRollReview';
import { AutoCutTransitionReview } from './AutoCutTransitionReview';
import { AutoCutMulticamera } from './AutoCutMulticamera';
import { CameraSyncSchema, recommendCamera, switchCameraRange, type CameraSync } from '@/lib/auto-cut/multicamera';
import { defaultNaturalTransitions, NaturalTransitionConfigSchema, naturalTransitionNames, type NaturalTransitionConfig } from '@/lib/auto-cut/natural-transitions';
import { BRollEditSchema, type BRollEdit } from '@/lib/auto-cut/broll';
import { defaultQualityConfig } from '@/lib/auto-cut/quality';
import { applyDuplicateDecisions, clusterDuplicates, duplicateDecision, DuplicateDecisionSchema, type DuplicateDecision } from '@/lib/auto-cut/duplicates';
import { HookSchema, suggestHooks, type AutoCutHook } from '@/lib/auto-cut/hooks';
import { TimelinePreview } from '@/components/caption-maker/TimelinePreview';
import { buildSpeechMoments, speechClip, type SpeechMoment } from '@/lib/auto-cut/speech';
import { optimizeDurationAndAssemble } from '@/lib/auto-cut/optimizer';
import { createAutoCutReel } from '@/lib/auto-cut/reel-bridge';
import { saveReel } from '@/lib/saved-reels/client';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import { useAuthStore } from '@/lib/use-auth-store';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';
import { getMediaAssetWebUrl, type MediaAsset } from '@/lib/clipping-studio/contracts';
import {
  AutoCutClipCandidateSchema,
  AutoCutSettingsSchema,
  AutoCutSceneSchema,
  validateAutoCutScenes,
  type AutoCutScene,
  type RecipeStyle,
  AutoCutClipCandidate,
  AutoCutMode,
  DurationPreset,
  EditingIntensity,
  VideoPacing,
  SilenceRemoval,
  SceneSelection,
  TransitionStyle,
} from '@/lib/auto-cut/types';

interface ModeOption {
  id: AutoCutMode;
  label: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgActive: string;
}

const MODES: ModeOption[] = [
  {
    id: 'auto_highlight',
    label: 'Auto Highlight',
    tagline: 'Rank measured scene changes and audio activity',
    icon: Sparkles,
    color: 'text-amber-400',
    bgActive: 'bg-amber-400/10 border-amber-400/50',
  },
  {
    id: 'cooking_recipe',
    label: 'Cooking Recipe',
    tagline: 'Spread clips chronologically; review recipe steps',
    icon: ChefHat,
    color: 'text-emerald-400',
    bgActive: 'bg-emerald-400/10 border-emerald-400/50',
  },
  {
    id: 'fast_paced',
    label: 'Fast-Paced Reel',
    tagline: '1.5s - 3s rapid cuts with maximum energy',
    icon: Zap,
    color: 'text-cyan-400',
    bgActive: 'bg-cyan-400/10 border-cyan-400/50',
  },
  {
    id: 'tutorial',
    label: 'Tutorial Mode',
    tagline: 'Step-by-step instructional progression',
    icon: GraduationCap,
    color: 'text-blue-400',
    bgActive: 'bg-blue-400/10 border-blue-400/50',
  },
  {
    id: 'podcast',
    label: 'Podcast Highlights',
    tagline: 'Prioritize audio activity; review spoken meaning',
    icon: Mic,
    color: 'text-purple-400',
    bgActive: 'bg-purple-400/10 border-purple-400/50',
  },
  {
    id: 'cinematic',
    label: 'Cinematic Mode',
    tagline: 'Longer shots with scene-change priority',
    icon: Film,
    color: 'text-rose-400',
    bgActive: 'bg-rose-400/10 border-rose-400/50',
  },
  {
    id: 'custom',
    label: 'Custom Mode',
    tagline: 'Tune pacing, intensity & scene priority',
    icon: Settings2,
    color: 'text-yellow-400',
    bgActive: 'bg-yellow-400/10 border-yellow-400/50',
  },
];

const DURATION_PRESETS: { value: DurationPreset; label: string }[] = [
  { value: 15, label: '15s Story' },
  { value: 30, label: '30s Reel' },
  { value: 40, label: '40s Short' },
  { value: 45, label: '45s Standard' },
  { value: 60, label: '60s TikTok' },
  { value: 90, label: '90s In-Depth' },
  { value: 'custom', label: 'Custom' },
];

function formatPreviewTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const AutoCutStudio: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const accountId = useAuthStore(state => state.user?.id);
  const projectId = useClippingStore(state => state.activeProject?.id);
  const assetId = useClippingStore(state => (state.activeProject?.mediaAssets.find(asset => asset.id === state.selectedAssetId) || state.activeProject?.mediaAssets[0])?.id);
  const workspaceKey = JSON.stringify([accountId, projectId, assetId]);
  const draftKey = accountId && projectId && assetId ? `reelspark:auto-cut-draft:v1:${workspaceKey}` : null;
  const duplicateKey = accountId && projectId ? `reelspark:auto-cut-duplicates:v1:${JSON.stringify([accountId, projectId])}` : null;
  return <AutoCutWorkspace key={workspaceKey} visible={visible} draftKey={draftKey} duplicateKey={duplicateKey} />;
};

function readDraft(key: string | null) {
  if (!key || typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? localStorage.getItem(key) ?? 'null');
    if (!saved) return null;
    return {
      sourceCandidates: AutoCutClipCandidateSchema.array().parse(saved.sourceCandidates),
      candidates: AutoCutClipCandidateSchema.array().parse(saved.candidates),
      settings: AutoCutSettingsSchema.parse(saved.settings),
      scenes: AutoCutSceneSchema.array().parse(saved.scenes ?? []),
      usingScenes: saved.usingScenes === true,
      notice: typeof saved.notice === 'string' ? saved.notice : '',
      recipeNotice: typeof saved.recipeNotice === 'string' ? saved.recipeNotice : '',
      hook: HookSchema.safeParse(saved.hook).data,
      hookDuration: typeof saved.hookDuration === 'number' && saved.hookDuration >= 1000 && saved.hookDuration <= 3000 ? saved.hookDuration : 2000,
      brollEdits: BRollEditSchema.array().safeParse(saved.brollEdits).data ?? [],
      brollIgnored: Array.isArray(saved.brollIgnored) ? saved.brollIgnored.filter((key: unknown) => typeof key === 'string') as string[] : [],
      brollFootage: AutoCutClipCandidateSchema.array().safeParse(saved.brollFootage).data ?? [],
      naturalTransitions: NaturalTransitionConfigSchema.safeParse(saved.naturalTransitions).data,
      showCaptions: saved.showCaptions !== false,
      cameraMode: saved.cameraMode === 'sync' || saved.cameraMode === 'takes' ? saved.cameraMode : 'single' as const,
      cameraSync: CameraSyncSchema.safeParse(saved.cameraSync).data ?? {},
      masterCamera: typeof saved.masterCamera === 'string' ? saved.masterCamera : '',
      cameraEdited: saved.cameraEdited === true,
      cameraSources: Array.isArray(saved.cameraSources) ? saved.cameraSources.filter((id: unknown) => typeof id === 'string').slice(0, 3) as string[] : undefined,
    };
  } catch {
    return null;
  }
}

const AutoCutWorkspace: React.FC<{ visible: boolean; draftKey: string | null; duplicateKey: string | null }> = ({ visible, draftKey, duplicateKey }) => {
  const router = useRouter();
  const [savedDraft] = useState(() => readDraft(draftKey));
  const {
    activeProject,
    projects,
    selectedAssetId,
    setActiveTab,
    createClipsBulk,
    addMediaAsset,
    selectAsset,
  } = useClippingStore();

  const activeAsset = useMemo(() => {
    if (!activeProject || !activeProject.mediaAssets.length) return null;
    return (
      activeProject.mediaAssets.find((a) => a.id === selectedAssetId) ||
      activeProject.mediaAssets[0]
    );
  }, [activeProject, selectedAssetId]);

  const detectedCategory = useMemo(() => {
    if (!activeAsset) return null;
    const name = activeAsset.filename.toLowerCase();

    // Cooking & culinary keywords
    const cookingKeywords = [
      'food', 'cook', 'recipe', 'dish', 'kitchen', 'sabzi', 'curry', 'aloo', 'paneer',
      'roti', 'bake', 'cake', 'fry', 'boil', 'spices', 'masala', 'chef', 'meal',
      'lunch', 'dinner', 'breakfast', 'tasty', 'delicious', 'eating', 'chutney',
      'gravy', 'snack', 'chicken', 'vegetable', 'biryani', 'pasta', 'pizza', 'whatsapp'
    ];
    if (cookingKeywords.some(kw => name.includes(kw))) {
      return {
        category: 'Cooking Recipe',
        mode: 'cooking_recipe' as AutoCutMode,
        icon: ChefHat,
        badge: 'Food & Cooking Video Detected',
        description: 'Culinary content detected. Switch to Cooking Recipe mode to intelligently detect chronological steps (Prep ➔ Cooking ➔ Final Dish) while cutting idle waiting time.',
      };
    }

    // Podcast & Dialogue keywords
    const podcastKeywords = ['podcast', 'interview', 'talk', 'conversation', 'episode', 'audiobook', 'voice'];
    if (podcastKeywords.some(kw => name.includes(kw))) {
      return {
        category: 'Podcast Highlights',
        mode: 'podcast' as AutoCutMode,
        icon: Mic,
        badge: 'Podcast / Dialogue Detected',
        description: 'Spoken dialogue detected. Use Podcast Highlights to prioritize meaningful speech and remove awkward pauses.',
      };
    }

    // Tutorial keywords
    const tutorialKeywords = ['tutorial', 'how to', 'guide', 'lesson', 'demo', 'course', 'learn'];
    if (tutorialKeywords.some(kw => name.includes(kw))) {
      return {
        category: 'Tutorial Mode',
        mode: 'tutorial' as AutoCutMode,
        icon: GraduationCap,
        badge: 'Tutorial Video Detected',
        description: 'Instructional content detected. Use Tutorial Mode to preserve step-by-step demonstrations in sequential order.',
      };
    }

    // Fast-Paced Reel keywords
    const actionKeywords = ['vlog', 'action', 'dance', 'workout', 'gym', 'fitness', 'sport', 'travel'];
    if (actionKeywords.some(kw => name.includes(kw))) {
      return {
        category: 'Fast-Paced Reel',
        mode: 'fast_paced' as AutoCutMode,
        icon: Zap,
        badge: 'High Energy Action Detected',
        description: 'Dynamic visual motion detected. Use Fast-Paced Reel for punchy 1.5s–3s cuts and maximum social engagement.',
      };
    }

    return null;
  }, [activeAsset]);

  // Settings State
  const [analysisMethod, setAnalysisMethod] = useState<'semantic' | 'scene_audio'>(savedDraft?.settings.analysisMethod ?? 'semantic');
  const [analysisNotice, setAnalysisNotice] = useState(savedDraft?.notice ?? '');
  const [mode, setMode] = useState<AutoCutMode>(savedDraft?.settings.mode ?? 'auto_highlight');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(() => savedDraft
    ? DURATION_PRESETS.find(preset => preset.value === savedDraft.settings.targetDurationSeconds)?.value ?? 'custom'
    : 60);
  const [customDuration, setCustomDuration] = useState<number>(savedDraft?.settings.targetDurationSeconds ?? 30);
  const [intensity, setIntensity] = useState<EditingIntensity>(savedDraft?.settings.intensity ?? 'balanced');
  const [pacing, setPacing] = useState<VideoPacing>(savedDraft?.settings.pacing ?? 'normal');
  const [silenceRemoval, setSilenceRemoval] = useState<SilenceRemoval>(savedDraft?.settings.silenceRemoval ?? 'moderate');
  const [sceneSelection, setSceneSelection] = useState<SceneSelection>(savedDraft?.settings.sceneSelection ?? 'balanced');
  const transition: TransitionStyle = 'cut';
  const [showCaptions, setShowCaptions] = useState(savedDraft?.showCaptions ?? true);
  const [cameraMode, setCameraMode] = useState<'single' | 'sync' | 'takes'>(savedDraft?.cameraMode ?? 'single');
  const [cameraSync, setCameraSync] = useState<CameraSync>(savedDraft?.cameraSync ?? {});
  const [masterCamera, setMasterCamera] = useState(savedDraft?.masterCamera ?? '');
  const [cameraEdited, setCameraEdited] = useState(savedDraft?.cameraEdited ?? false);
  const [syncError, setSyncError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const syncRequest = useRef<AbortController | null>(null);
  const [naturalTransitions, setNaturalTransitions] = useState<NaturalTransitionConfig>(() => savedDraft?.naturalTransitions ?? {
    ...defaultNaturalTransitions, profile: savedDraft?.settings.transition === 'none' ? 'none' :
      savedDraft?.settings.transition === 'smooth' ? 'cinematic' : 'natural',
  });
  const [quality, setQuality] = useState(savedDraft?.settings.quality ?? defaultQualityConfig);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Results State
  const [sourceCandidates, setSourceCandidates] = useState<AutoCutClipCandidate[]>(savedDraft?.sourceCandidates ?? []);
  const [recipeStyle, setRecipeStyle] = useState<RecipeStyle>(savedDraft?.settings.recipeStyle ?? 'recipe');
  const [additionalSources, setAdditionalSources] = useState<string[]>(() =>
    savedDraft?.cameraSources ?? [...new Set(savedDraft?.sourceCandidates.flatMap(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset?.id ? [clip.sourceVideoId] : []) ?? [])]);
  const [recipeNotice, setRecipeNotice] = useState(savedDraft?.recipeNotice ?? '');
  const [duplicateDecisions, setDuplicateDecisions] = useState<DuplicateDecision[]>(() => {
    try { return duplicateKey ? DuplicateDecisionSchema.array().parse(JSON.parse(localStorage.getItem(duplicateKey) ?? '[]')) : []; }
    catch { return []; }
  });
  const [candidates, setCandidates] = useState<AutoCutClipCandidate[]>(() => applyDuplicateDecisions(savedDraft?.candidates ?? [], duplicateDecisions));
  const [brollEdits, setBRollEdits] = useState<BRollEdit[]>(savedDraft?.brollEdits ?? []);
  const [brollIgnored, setBRollIgnored] = useState(savedDraft?.brollIgnored ?? []);
  const [brollFootage, setBRollFootage] = useState(savedDraft?.brollFootage ?? []);
  const [brollAuthorized, setBRollAuthorized] = useState<Record<string, string>>({});
  const [brollBusy, setBRollBusy] = useState(false);
  const [brollError, setBRollError] = useState('');
  const brollRequest = useRef<AbortController | null>(null);
  const brollLibrary = useMemo(() => [...new Map([
    ...(activeProject?.mediaAssets ?? []),
    ...projects.filter(project => project.id !== activeProject?.id).flatMap(project => project.mediaAssets),
  ].filter(asset => asset.metadata.hasVideo).map(asset => [asset.id, asset])).values()], [activeProject, projects]);
  const duplicateClusters = useMemo(() => clusterDuplicates(sourceCandidates, duplicateDecisions, activeAsset?.id,
    Object.fromEntries(activeProject?.mediaAssets.map(asset => [asset.id, (asset.metadata.width ?? 0) * (asset.metadata.height ?? 0)]) ?? [])),
  [sourceCandidates, duplicateDecisions, activeAsset?.id, activeProject]);
  const saveDuplicateDecisions = (next: DuplicateDecision[]) => {
    setDuplicateDecisions(next);
    try { if (duplicateKey) localStorage.setItem(duplicateKey, JSON.stringify(next)); }
    catch { /* Decisions still apply to the current draft. */ }
  };
  const decideDuplicates = (changes: { clip: AutoCutClipCandidate; value: DuplicateDecision['value'] }[]) => {
    const updates = changes.map(({ clip, value }) => ({ sourceVideoId: clip.sourceVideoId, startMs: clip.startMs, endMs: clip.endMs, value }));
    const next = [...duplicateDecisions.filter(item => !updates.some(update => item.sourceVideoId === update.sourceVideoId &&
      item.startMs === update.startMs && item.endMs === update.endMs)), ...updates];
    saveDuplicateDecisions(next);
    setCandidates(previous => applyDuplicateDecisions([
      ...previous,
      ...changes.filter(({ clip, value }) => value === 'keep' && !previous.some(item => item.id === clip.id)).map(({ clip }) => clip),
    ], next));
  };
  const [hook, setHook] = useState(savedDraft?.hook);
  const [hookDuration, setHookDuration] = useState(savedDraft?.hookDuration ?? 2000);
  const [hookPreview, setHookPreview] = useState<ReturnType<typeof createAutoCutReel>>();
  const [hookPlaying, setHookPlaying] = useState(false);
  const [hookTime, setHookTime] = useState(0);
  const hookOptions = useMemo(() => suggestHooks(sourceCandidates.filter(clip => duplicateDecision(clip, duplicateDecisions) !== 'exclude' &&
    activeProject?.mediaAssets.find(asset => asset.id === (clip.sourceVideoId ?? activeAsset?.id))?.metadata.hasVideo),
  hookDuration, mode === 'cooking_recipe'), [sourceCandidates, activeProject, activeAsset, hookDuration, mode, duplicateDecisions]);
  const [scenes, setScenes] = useState<AutoCutScene[]>(savedDraft?.scenes ?? []);
  const [usingScenes, setUsingScenes] = useState(savedDraft?.usingScenes ?? false);
  const achievedDurationMs = candidates.filter(c => c.selected).reduce((sum, c) => sum + c.durationMs, 0);
  const [isOpening, setIsOpening] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [uploadRows, setUploadRows] = useState<{ file: File; progress: number; error?: string; done?: boolean }[]>([]);
  const uploadVideo = async (files: File[]) => {
    if (!activeProject || uploadRef.current) return;
    const controller = new AbortController();
    uploadRef.current = controller;
    setUploadError(null);
    setUploadProgress(0);
    setUploadRows(files.map(file => ({ file, progress: 0 })));
    const uploaded: MediaAsset[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (controller.signal.aborted) break;
        const update = (patch: Partial<(typeof uploadRows)[number]>) => setUploadRows(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
        try {
          const data = await uploadFileWithProgress<{ success?: boolean; asset?: MediaAsset; error?: string }>(
        '/api/clipping-studio/projects/' + encodeURIComponent(activeProject.id) + '/media',
        file, progress => { setUploadProgress(progress); update({ progress }); }, undefined, controller.signal
      );
      if (controller.signal.aborted) break;
      if (!data.success || !data.asset) throw new Error(data.error || 'Video upload failed.');
      uploaded.push(data.asset); update({ done: true, progress: 100 });
        } catch (err) {
          if (controller.signal.aborted) break;
          const message = err instanceof Error ? err.message : 'Upload failed.';
          update({ error: message });
          if (files.length === 1) setUploadError(message);
        }
      }
      if (useClippingStore.getState().activeProject?.id === activeProject.id) {
        for (const asset of uploaded) addMediaAsset(asset, false);
        if (cameraMode !== 'single' && activeAsset) setAdditionalSources(previous => [...new Set([...previous, ...uploaded.filter(asset => asset.metadata.hasVideo).map(asset => asset.id)])].slice(0, 3));
        if (uploaded.length && (cameraMode === 'single' || !activeAsset)) selectAsset(uploaded.at(-1)!.id);
      }
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof UploadCancelledError)) {
        setUploadError(error instanceof Error ? error.message : 'Video upload failed.');
      }
    } finally {
      uploadRef.current = null;
      if (!controller.signal.aborted) setUploadProgress(null);
    }
  };
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current++; requestRef.current?.abort(); uploadRef.current?.abort(); brollRequest.current?.abort(); syncRequest.current?.abort(); }, []);
  const [hasRun, setHasRun] = useState(Boolean(savedDraft));

  // Player Audition State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingPreviewSeek = useRef<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewVolume, setPreviewVolume] = useState(1);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [activeAuditionClip, setActiveAuditionClip] = useState<AutoCutClipCandidate | null>(null);

  const targetDurationSeconds =
    durationPreset === 'custom' ? customDuration : Number(durationPreset);

  useEffect(() => {
    if (!draftKey || !hasRun) return;
    try {
      const draft = JSON.stringify({
        sourceCandidates,
        candidates,
        scenes,
        usingScenes,
        notice: analysisNotice,
        recipeNotice,
        hook,
        hookDuration,
        brollEdits,
        brollIgnored,
        brollFootage,
        naturalTransitions,
        showCaptions,
        cameraMode, cameraSync, masterCamera, cameraEdited, cameraSources: additionalSources,
        settings: { analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle, quality },
      });
      if (cameraMode !== 'single') localStorage.setItem(draftKey, draft);
      else localStorage.removeItem(draftKey);
      sessionStorage.setItem(draftKey, draft);
    } catch { /* Draft remains available in the current editor. */ }
  }, [draftKey, hasRun, sourceCandidates, candidates, scenes, usingScenes, analysisNotice, recipeNotice, analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle, quality, hook, hookDuration, brollEdits, brollIgnored, brollFootage, naturalTransitions, showCaptions, cameraMode, cameraSync, masterCamera, cameraEdited, additionalSources]);

  const previewAsset = activeProject?.mediaAssets.find(asset => asset.id === activeAuditionClip?.sourceVideoId) ?? activeAsset;
  const mediaWebUrl = previewAsset ? getMediaAssetWebUrl(previewAsset) : '';

  // Handle Audition Clip Playback
  const auditionClip = (clip: AutoCutClipCandidate, seekMs = clip.startMs) => {
    if (!videoRef.current) return;
    setActiveAuditionClip(clip);
    if (clip.sourceVideoId && clip.sourceVideoId !== previewAsset?.id) {
      pendingPreviewSeek.current = seekMs;
      return;
    }
    const startSec = seekMs / 1000;
    videoRef.current.currentTime = startSec;
    void videoRef.current.play().catch(() => {});
  };

  useEffect(() => {
    if (!visible) videoRef.current?.pause();
  }, [visible]);

  const handlePreviewTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (activeAuditionClip && video.currentTime >= activeAuditionClip.endMs / 1000) {
      video.pause();
      video.currentTime = activeAuditionClip.startMs / 1000;
    }
    setPreviewTime(video.currentTime);
  };

  const togglePreview = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement === previewRef.current) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void previewRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  // Toggle clip inclusion
  const toggleClipSelection = (clipId: string) => {
    setCandidates((prev) => {
      const updated = prev.map((c) =>
        c.id === clipId && !c.locked && !duplicateDecision(c, duplicateDecisions) ? { ...c, selected: !c.selected } : c
      );
      return updated;
    });
  };

  // Run AI Auto Cut
  const runAutoCut = async (method = analysisMethod) => {
    if (!activeProject || !activeAsset) return;
    setIsAnalyzing(true);
    setError(null);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const version = ++requestVersion.current;
    const jobId = crypto.randomUUID();
    let finished = false;
    const progressQuery = new URLSearchParams({ projectId: activeProject.id, jobId });
    const progressTimer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/clipping-studio/auto-cut?${progressQuery}`, { signal: controller.signal });
        if (!response.ok) return;
        const { progress } = await response.json();
        if (!finished && !controller.signal.aborted && version === requestVersion.current && typeof progress?.message === 'string') {
          setProgressStage(progress.message);
        }
      } catch { /* Progress polling can recover on the next tick. */ }
    }, 3000);
    setProgressStage('Measuring scene changes and audio activity. This may take a few minutes…');

    try {
      const analyzeSource = async (source: MediaAsset) => {
        const response = await fetch('/api/clipping-studio/auto-cut', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: source.localPath,
            projectId: activeProject.id,
            jobId,
            mediaAssetId: source.id,
            settings: {
              analysisMethod: method,
              mode,
              storyGenre: cameraMode === 'single' ? undefined : mode === 'custom' ? 'product' : mode === 'auto_highlight' ? 'vlog' : undefined,
              targetDurationSeconds,
              intensity,
              pacing,
              silenceRemoval,
              sceneSelection,
              transition,
              quality,
              recipeStyle: mode === 'cooking_recipe' ? recipeStyle : undefined,
            },
          }),
        });


        const data = await response.json();
        controller.signal.throwIfAborted();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to complete AI Auto Cut analysis.');
        }
        return data;
      };
      const data = await analyzeSource(activeAsset);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      if (mode === 'cooking_recipe') {
        const sources = [activeAsset, ...additionalSources.flatMap(id => activeProject.mediaAssets.find(asset => asset.id === id) ?? [])];
        const steps: AutoCutClipCandidate[] = [];
        const warnings = new Set<string>();
        const previousSteps = new Map(sourceCandidates.map(step => [step.id, step]));
        for (const source of sources) {
          let result;
          try { result = source === activeAsset ? data : await analyzeSource(source); }
          catch (err) {
            controller.signal.throwIfAborted();
            if (cameraMode === 'single') throw err;
            warnings.add(source.filename + ' could not be analyzed.');
            continue;
          }
          if (result.analysis?.warning) warnings.add(result.analysis.warning);
          const windows = AutoCutClipCandidateSchema.array().parse(result.analysis?.candidates ?? []);
          const thumbnails = new Map<string, string | undefined>((result.assembledClips ?? []).map((clip: AutoCutClipCandidate) =>
            [clip.id, clip.thumbnailBase64]));
          const sourceScenes = result.analysis?.scenes
            ? validateAutoCutScenes(result.analysis.scenes, source.id, source.metadata.durationMs)
            : [];
          for (const clip of windows.sort((a, b) => a.startMs - b.startMs)) {
            const id = `${source.id}:${clip.id}`;
            const previous = previousSteps.get(id);
            const shot = sourceScenes.find(scene => scene.startMs <= clip.startMs && scene.endMs >= clip.endMs);
            steps.push({ ...clip, id, sourceVideoId: source.id, recipeOrder: previous?.recipeOrder ?? steps.length,
              recipeImportance: previous?.recipeImportance ?? (shot?.shotType === 'black' ? 'excluded' : undefined),
              category: previous?.recipeLabelEdited ? previous.category : clip.category,
              cookingActivity: previous?.recipeLabelEdited ? previous.cookingActivity : clip.cookingActivity,
              recipeLabelEdited: previous?.recipeLabelEdited, thumbnailBase64: clip.thumbnailBase64 ??
                thumbnails.get(clip.id) ?? shot?.thumbnail });
          }
        }
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setScenes(reconcileAutoCutScenes(scenes, data.analysis?.scenes
          ? validateAutoCutScenes(data.analysis.scenes, activeAsset.id, activeAsset.metadata.durationMs) : []));
        setUsingScenes(false);
        if (cameraMode !== 'single' && cameraEdited) setSourceCandidates(steps);
        else if (cameraMode === 'sync') {
          setSourceCandidates(steps);
          setCandidates(assembleRecipe(steps.filter(clip => clip.sourceVideoId === activeAsset.id), {
            analysisMethod: method, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle, quality,
          }).assembledClips);
        } else applyRecipe(steps, method);
        setAnalysisNotice([...warnings].join(' '));
        setProgressStage('Analysis complete! Ready to review.');
        setHasRun(true);
        return;
      }

      setProgressStage('Analysis complete! Ready to review.');
      const detected = data.analysis?.scenes
        ? validateAutoCutScenes(data.analysis.scenes, activeAsset.id, activeAsset.metadata.durationMs)
        : [];
      const nextScenes = reconcileAutoCutScenes(scenes, detected);
      const windows = AutoCutClipCandidateSchema.array().parse(data.analysis?.candidates ?? [])
        .map(clip => ({ ...clip, sourceVideoId: activeAsset.id }));
      if (additionalSources.length) {
        const warnings = new Set<string>(data.analysis?.warning ? [data.analysis.warning] : []);
        for (const id of additionalSources) {
          const source = activeProject.mediaAssets.find(asset => asset.id === id);
          if (!source || source.id === activeAsset.id) continue;
          let result;
          try { result = await analyzeSource(source); }
          catch (err) {
            controller.signal.throwIfAborted();
            if (cameraMode === 'single') throw err;
            warnings.add(source.filename + ' could not be analyzed.');
            continue;
          }
          if (result.analysis?.warning) warnings.add(result.analysis.warning);
          windows.push(...AutoCutClipCandidateSchema.array().parse(result.analysis?.candidates ?? [])
            .map(clip => ({ ...clip, id: `${source.id}:${clip.id}`, sourceVideoId: source.id })));
        }
        if (controller.signal.aborted || version !== requestVersion.current) return;
        const pool = applyDuplicateDecisions(usingScenes && nextScenes.length ? [
          ...sceneCandidates(nextScenes, windows.filter(clip => clip.sourceVideoId === activeAsset.id)),
          ...windows.filter(clip => clip.sourceVideoId !== activeAsset.id),
        ] : windows, duplicateDecisions);
        const result = optimizeDurationAndAssemble(cameraMode === 'sync' ? pool.filter(clip => clip.sourceVideoId === activeAsset.id) : pool, {
          analysisMethod: method, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
        });
        const chosen = new Map(result.assembledClips.map(clip => [clip.id, clip]));
        setScenes(nextScenes);
        setSourceCandidates(windows);
        if (cameraMode === 'single' || !cameraEdited) setCandidates(cameraMode === 'sync' ? result.assembledClips : pool.map(clip => ({ ...(chosen.get(clip.id) ?? clip), selected: chosen.has(clip.id) })));
        setAnalysisNotice([...warnings].join(' '));
        setHasRun(true);
        return;
      }
      setScenes(nextScenes);
      setAnalysisNotice(data.analysis?.warning || 'Review the generated clips before export.');
      setSourceCandidates(windows);
      if (cameraMode !== 'single' && cameraEdited) { setHasRun(true); return; }
      if (usingScenes && nextScenes.length) {
        const pool = applyDuplicateDecisions(sceneCandidates(nextScenes, windows), duplicateDecisions);
        setCandidates(optimizeDurationAndAssemble(pool, {
          analysisMethod: method, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
        }).assembledClips);
        return;
      }
      const chosen = new Map<string, AutoCutClipCandidate>((data.assembledClips || []).map((c: AutoCutClipCandidate) => [c.id, { ...c, sourceVideoId: activeAsset.id }]));
      const windowIds = new Set(windows.map(clip => clip.id));
      setCandidates(applyDuplicateDecisions([
        ...windows.map(clip => ({ ...(chosen.get(clip.id) || clip), selected: chosen.has(clip.id) })),
        ...[...chosen.values()].filter(clip => !windowIds.has(clip.id)),
      ], duplicateDecisions));
      setHasRun(true);
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(err instanceof Error ? err.message : 'Auto Cut analysis failed. Please try again.');
    } finally {
      finished = true;
      window.clearInterval(progressTimer);
      if (version === requestVersion.current) setIsAnalyzing(false);
    }
  };

  const applyRecipe = (steps: AutoCutClipCandidate[], method = analysisMethod) => {
    const result = assembleRecipe(applyDuplicateDecisions(steps, duplicateDecisions), {
      analysisMethod: method, mode: 'cooking_recipe', targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle, quality,
    });
    setSourceCandidates(steps);
    setCandidates(result.assembledClips);
    setRecipeNotice([
      result.omittedSteps.length ? `Required or essential steps left out because of duration or overlapping footage: ${result.omittedSteps.join(', ')}.` : '',
      result.hasFinalDish ? '' : 'No final dish was confirmed in the included source footage.',
      steps.some(step => step.cookingActivity && step.cookingActivity !== 'other') ? '' : 'Recipe stages could not be verified. Review and label the source ranges manually.',
    ].filter(Boolean).join(' '));
  };

  // Bridge action: Add to Timeline
  const addToTimeline = () => {
    if (!activeProject || !activeAsset || !candidates.length) return;
    const selected = applyDuplicateDecisions(candidates, duplicateDecisions).filter((c) => c.selected);
    if (!selected.length) return;
    if (hook || brollEdits.length || selected.some(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset.id)) {
      void openInReelMaker();
      return;
    }

    const items = selected.map((c, idx) => ({
      name: c.category
        ? `${c.category} #${idx + 1}`
        : `Cut ${idx + 1} (${(c.durationMs / 1000).toFixed(1)}s)`,
      startMs: c.startMs,
      endMs: c.endMs,
      durationMs: c.durationMs,
    }));

    try { createAutoCutReel(activeAsset, selected, activeProject.name); }
    catch (err) { setError(err instanceof Error ? err.message : 'Invalid clip range'); return; }
    selectAsset(activeAsset.id);
    createClipsBulk(items);
    setActiveTab('timeline');
  };

  const authorizeBRoll = async (sources: MediaAsset[], signal?: AbortSignal, restore = false) => {
    if (!sources.length) return {};
    const batches = Array.from({ length: Math.ceil(sources.length / 30) }, (_, i) => sources.slice(i * 30, (i + 1) * 30));
    const authorized: Record<string, string> = Object.create(null);
    for (const batch of batches) {
      const response = await fetch('/api/clipping-studio/auto-cut/b-roll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ sources: batch.map(source => ({ id: source.id, filePath: source.localPath })), restore }),
      });
      if (!response.ok) throw new Error('Unable to verify B-roll media access. Try again.');
      const { assets } = await response.json() as { assets: { id: string; url: string }[] };
      for (const asset of assets) if (asset.url.startsWith('/api/files/')) authorized[asset.id] = asset.url;
    }
    return authorized;
  };

  const checkPlacedBRoll = async (signal?: AbortSignal) => {
    const ids = new Set(brollEdits.map(edit => edit.sourceId));
    const authorized = await authorizeBRoll(brollLibrary.filter(asset => ids.has(asset.id)), signal, true);
    if ([...ids].some(id => !Object.hasOwn(authorized, id))) {
      setBRollAuthorized(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id) || Object.hasOwn(authorized, id))));
      throw new Error('B-roll media access changed. Remove or replace the unavailable placement.');
    }
    return authorized;
  };

  const refreshBRoll = async (source?: MediaAsset | 'project') => {
    if (brollRequest.current) return;
    const controller = new AbortController();
    brollRequest.current = controller;
    setBRollBusy(true); setBRollError('');
    try {
      const authorized = await authorizeBRoll(source && source !== 'project' ? [source] : brollLibrary, controller.signal);
      if (!source) { setBRollAuthorized(authorized); return; }
      if (source === 'project') setBRollAuthorized(authorized);
      else setBRollAuthorized(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([id]) => id !== source.id)), ...authorized }));
      const reviewed = new Set(brollFootage.map(clip => clip.sourceVideoId));
      const search = source === 'project' ? brollLibrary.filter(asset => asset.projectId === activeProject?.id &&
        authorized[asset.id] && !reviewed.has(asset.id)).slice(0, 3) : [source];
      for (const asset of search) {
        if (!authorized[asset.id]) throw new Error('That source is no longer available.');
        const response = await fetch('/api/clipping-studio/auto-cut', {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: asset.localPath, projectId: asset.projectId, mediaAssetId: asset.id,
            settings: { analysisMethod, mode, targetDurationSeconds, silenceRemoval: 'disabled' } }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to analyze that B-roll source.');
        const windows = AutoCutClipCandidateSchema.array().parse(data.analysis?.candidates ?? []).map(clip => ({
          ...clip, id: `broll:${asset.id}:${clip.id}`, sourceVideoId: asset.id, thumbnailBase64: undefined,
        }));
        controller.signal.throwIfAborted();
        setBRollFootage(previous => [...previous.filter(clip => clip.sourceVideoId !== asset.id), ...windows]);
      }
    } catch (err) {
      if (!controller.signal.aborted) setBRollError(err instanceof Error ? err.message : 'Unable to check B-roll footage.');
    } finally {
      brollRequest.current = null;
      if (!controller.signal.aborted) setBRollBusy(false);
    }
  };

  const commitBRoll = async (next: BRollEdit[]) => {
    const added = next.find(edit => !brollEdits.includes(edit));
    if (!added) {
      setBRollEdits(next); setHookPreview(undefined); setBRollError('');
      return;
    }
    if (brollRequest.current) return;
    const source = brollLibrary.find(asset => asset.id === added.sourceId);
    if (!source) { setBRollError('This B-roll source is no longer available.'); return; }
    const controller = new AbortController();
    brollRequest.current = controller;
    setBRollBusy(true); setBRollError('');
    try {
      const authorized = await authorizeBRoll([source], controller.signal, true);
      controller.signal.throwIfAborted();
      setBRollAuthorized(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([id]) => id !== source.id)), ...authorized }));
      if (!Object.hasOwn(authorized, source.id)) throw new Error('This B-roll source is no longer available.');
      setBRollEdits(next); setHookPreview(undefined);
    } catch (err) {
      if (!controller.signal.aborted) setBRollError(err instanceof Error ? err.message : 'Unable to place B-roll.');
    } finally {
      brollRequest.current = null;
      if (!controller.signal.aborted) setBRollBusy(false);
    }
  };

  const buildReel = (opening?: AutoCutHook, authorizedUrls?: Record<string, string>) => {
    if (!activeProject || !activeAsset) throw new Error('Select a source video.');
    if (opening && duplicateDecision({ ...opening.clip, sourceVideoId: opening.clip.sourceVideoId ?? activeAsset.id }, duplicateDecisions) === 'exclude') {
      throw new Error('The opening hook overlaps an excluded range. Replace or disable it in Opening hook.');
    }
    const sequence = applyDuplicateDecisions(candidates, duplicateDecisions).map(candidate => ({ ...candidate,
      transitionToNext: duplicateDecisions.some(decision => decision.value === 'exclude' &&
        decision.sourceVideoId === (candidate.sourceVideoId ?? activeAsset.id) &&
        decision.startMs < candidate.endMs + 200 && decision.endMs > candidate.endMs) ? 'cut' as const : transition,
    }));
    if (cameraMode === 'single' && !sequence.some(clip => clip.recipeOrder !== undefined)) sequence.sort((a, b) => a.startMs - b.startMs);
    const hasSourceIds = Boolean(authorizedUrls || opening || sequence.some(clip => clip.sourceVideoId));
    const sourceSequence = hasSourceIds ? sequence.map(clip => ({ ...clip, sourceVideoId: clip.sourceVideoId ?? activeAsset.id })) : sequence;
    const sourceHook = opening ? { ...opening, clip: { ...opening.clip, sourceVideoId: opening.clip.sourceVideoId ?? activeAsset.id } } : undefined;
    const assets = authorizedUrls ? [...new Map([...brollLibrary, ...activeProject.mediaAssets].map(asset => [asset.id, asset])).values()] : activeProject.mediaAssets;
    if (cameraMode === 'sync' && !masterCamera && sourceSequence.some(clip => clip.selected && assets.find(asset => asset.id === clip.sourceVideoId)?.metadata.hasAudio)) {
      throw new Error('Choose master camera audio before opening a synchronized edit.');
    }
    return createAutoCutReel(hasSourceIds ? assets : activeAsset, sourceSequence, activeProject.name + ' — Auto Cut', sourceHook,
      authorizedUrls ? { edits: brollEdits, authorizedUrls } : undefined, naturalTransitions, showCaptions,
      cameraMode === 'sync' && masterCamera ? { masterId: masterCamera, sync: cameraSync, transcriptClips: sourceCandidates } : undefined);
  };

  // Save a distinct reel with the entire editable sequence, preserving previous projects.
  const openInReelMaker = async () => {
    if (!activeProject || !activeAsset || isOpening) return;
    setIsOpening(true); setError(null);
    const version = requestVersion.current;
    try {
      const authorized = brollEdits.length ? await checkPlacedBRoll() : undefined;
      if (version !== requestVersion.current) return;
      const project = buildReel(hook, authorized);
      const reel = await saveReel(project, { originProjectId: activeProject.id, originProjectName: activeProject.name });
      if (version === requestVersion.current) router.push('/reel-maker?savedReel=' + encodeURIComponent(reel.id));
    } catch (err: unknown) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Unable to open the sequence.');
    } finally { setIsOpening(false); }
  };

  const regenerateSelected = () => {
    if (candidates.some(clip => clip.selected && clip.speechProtected)) {
      setCandidates(optimizeDurationAndAssemble(applyDuplicateDecisions(candidates, duplicateDecisions), {
        analysisMethod, mode: 'podcast', targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
      }).assembledClips);
      return;
    }
    if (!usingScenes && sourceCandidates.some(clip => clip.recipeOrder !== undefined)) {
      applyRecipe(sourceCandidates);
      return;
    }
    const ids = new Set(candidates.filter(c => c.selected).map(c => c.id));
    const pool = usingScenes ? [...sceneCandidates(scenes, sourceCandidates.filter(clip =>
      !clip.sourceVideoId || clip.sourceVideoId === activeAsset?.id)),
    ...sourceCandidates.filter(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset?.id)] : sourceCandidates;
    const result = optimizeDurationAndAssemble(applyDuplicateDecisions(pool.map(c => ({ ...c, selected: c.locked || ids.has(c.id) })), duplicateDecisions), {
      analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
    });
    const chosen = new Map(result.assembledClips.map(c => [c.id, c]));
    setCandidates(pool.map(c => ({ ...(chosen.get(c.id) || c), selected: chosen.has(c.id) })));
  };

  const useIncludedScenes = () => {
    if (!activeAsset) return;
    const accepted = validateAutoCutScenes(scenes, activeAsset.id, activeAsset.metadata.durationMs);
    const pool = applyDuplicateDecisions([
      ...sceneCandidates(accepted, sourceCandidates.filter(clip => !clip.sourceVideoId || clip.sourceVideoId === activeAsset.id)),
      ...sourceCandidates.filter(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset.id),
    ], duplicateDecisions);
    const result = optimizeDurationAndAssemble(pool, {
      analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
    });
    setCandidates(result.assembledClips);
    setUsingScenes(true);
  };

  const speechMoments = useMemo(() => buildSpeechMoments(sourceCandidates.filter(clip => duplicateDecision(clip, duplicateDecisions) !== 'exclude')),
    [sourceCandidates, duplicateDecisions]);
  const editSpeechText = (moment: SpeechMoment, index: number, text: string) => {
    const original = moment.words[index];
    const update = (clips: AutoCutClipCandidate[]) => clips.map(clip => {
      if (clip.sourceVideoId !== moment.sourceVideoId || !clip.transcriptWords) return clip;
      return { ...clip, transcriptWords: clip.transcriptWords.map(word =>
        word.startMs === original.startMs && word.endMs === original.endMs && word.text === original.text
          ? { ...word, text } : word) };
    });
    setSourceCandidates(update);
    setCandidates(update);
  };
  const buildSpeechDraft = () => {
    const speech = speechMoments.filter(moment => moment.complete && !moment.repeat).map(moment => speechClip(moment));
    const draft = optimizeDurationAndAssemble(speech, {
      analysisMethod, mode: 'podcast', targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
    });
    if (!draft.assembledClips.length) {
      setError('No complete speech highlight fits this length. Increase the duration or choose a range in Speech & highlights.');
      return;
    }
    setError(null);
    setUsingScenes(false);
    setCandidates(draft.assembledClips);
  };
  const selectedCount = candidates.filter((c) => c.selected).length;
  const cameras = activeProject?.mediaAssets.filter(asset => asset.metadata.hasVideo && (asset.id === activeAsset?.id || additionalSources.includes(asset.id))) ?? [];
  const runCameraSync = async () => {
    if (!activeAsset || !activeProject || syncRequest.current) return;
    const controller = new AbortController();
    syncRequest.current = controller;
    setSyncing(true); setSyncError('');
    const describe = (asset: MediaAsset) => ({ id: asset.id, filePath: asset.localPath, durationMs: asset.metadata.durationMs });
    try {
      const response = await fetch('/api/clipping-studio/auto-cut/sync', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: activeProject.id,
          reference: describe(activeAsset), cameras: cameras.filter(asset => asset.id !== activeAsset.id).map(describe) }) });
      const result = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(result.error || 'Unable to synchronize cameras.');
      const sync = CameraSyncSchema.parse(result.sync);
      setCameraSync(sync);
      setMasterCamera(activeAsset.metadata.hasAudio ? activeAsset.id : '');
      if (result.unavailable?.length) setSyncError('Some cameras could not be matched. Verify their offsets manually or use separate takes.');
    } catch (err) { if (!controller.signal.aborted) setSyncError(err instanceof Error ? err.message : 'Camera sync failed.'); }
    finally { syncRequest.current = null; setSyncing(false); }
  };
  const brollTargets = applyDuplicateDecisions(candidates, duplicateDecisions).filter(clip => clip.selected && clip.durationMs >= 250)
    .map(clip => ({ ...clip, sourceVideoId: clip.sourceVideoId ?? activeAsset?.id }));
  const transitionTargets = applyDuplicateDecisions(candidates, duplicateDecisions).filter(clip => clip.selected)
    .map(clip => ({ ...clip, sourceVideoId: clip.sourceVideoId ?? activeAsset?.id }));
  if (!transitionTargets.some(clip => clip.recipeOrder !== undefined)) transitionTargets.sort((a, b) => a.startMs - b.startMs);
  const [transitionFeedback, setTransitionFeedback] = useState('');
  const previewTransition = async (index: number) => {
    const target = transitionTargets[index];
    if (!target || isOpening) return;
    setIsOpening(true); setTransitionFeedback('');
    try {
      const authorized = brollEdits.length ? await checkPlacedBRoll() : undefined;
      const project = buildReel(hook, authorized);
      const clip = project.timeline?.clips.find(item => item.trackId === 'video' &&
        item.assetId === 'source_' + target.sourceVideoId && item.sourceStartMs === target.startMs);
      if (!clip) throw new Error('The boundary changed after applying the hook or B-roll.');
      const decision = clip.naturalTransition;
      setTransitionFeedback(decision ? `${naturalTransitionNames[decision.kind]}${clip.fadeInMs ? ' · ' + clip.fadeInMs + ' ms' : ''} · ${decision.reason}` :
        'Hard Cut · This boundary belongs to a protected or edited range.');
      videoRef.current?.pause();
      setHookTime(Math.max(0, clip.startMs / 1000 - 0.65)); setHookPlaying(true); setHookPreview(project);
    } catch (err) { setTransitionFeedback(err instanceof Error ? err.message : 'Unable to preview this transition.'); }
    finally { setIsOpening(false); }
  };
  const rebuildWithQuality = () => {
    if (usingScenes) { useIncludedScenes(); return; }
    if (mode === 'cooking_recipe') { applyRecipe(sourceCandidates); return; }
    const pool = applyDuplicateDecisions(sourceCandidates.map(clip => ({ ...clip, selected: true })), duplicateDecisions);
    const { assembledClips } = optimizeDurationAndAssemble(pool, {
      analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, quality,
    });
    const chosen = new Map(assembledClips.map(clip => [clip.id, clip]));
    setCandidates(pool.map(clip => ({ ...(chosen.get(clip.id) ?? clip), selected: chosen.has(clip.id) })));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/[0.08] via-zinc-900/60 to-zinc-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Auto Cut Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Turn a video into a reel
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Choose a video and reel length. Generate a draft, then review and edit your clips in Reel Maker.
            </p>
          </div>

          {activeAsset && (
            <div className="flex items-center space-x-3 bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                MP4
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white truncate max-w-[180px]">
                  {activeAsset.filename}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {(activeAsset.metadata.durationSeconds || 0).toFixed(1)}s •{' '}
                  {activeAsset.metadata.aspectRatio}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Settings & Video Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Mode & Controls */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-5 space-y-4">
            <Select value={cameraMode} onValueChange={value => setCameraMode(value as typeof cameraMode)} disabled={isAnalyzing || isOpening || uploadProgress !== null}>
              <SelectTrigger aria-label="Auto Cut workflow"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="single">Single Video</SelectItem><SelectItem value="sync">Multi-Camera · Synchronized</SelectItem>
                <SelectItem value="takes">Multi-Camera · Separate Takes</SelectItem></SelectContent>
            </Select>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">1. Choose source video</h3>
            {activeAsset && activeProject ? (
              <Select
                value={activeAsset.id}
                disabled={isAnalyzing || isOpening || uploadProgress !== null}
                onValueChange={(val) => selectAsset(val)}
              >
                <SelectTrigger aria-label="Source video" className="w-full text-sm py-2.5 h-auto">
                  <SelectValue placeholder="Choose source video" />
                </SelectTrigger>
                <SelectContent>
                  {activeProject.mediaAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : <p className="text-sm text-zinc-400">Add a video to your project to get started.</p>}

            {activeAsset && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-zinc-300">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {(activeAsset.metadata?.durationSeconds || 0).toFixed(1)}s
                </span>
                {activeAsset.metadata?.width && activeAsset.metadata?.height && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-zinc-300">
                    <Film className="w-3 h-3 text-cyan-400" />
                    {activeAsset.metadata.width}x{activeAsset.metadata.height} ({activeAsset.metadata.aspectRatio || '9:16'})
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-zinc-300">
                  {activeAsset.metadata?.hasAudio ? (
                    <>
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      Audio track
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3 text-zinc-500" />
                      Silent track
                    </>
                  )}
                </span>
                {activeAsset.fileSizeBytes > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-zinc-300">
                    <FileVideo className="w-3 h-3 text-purple-400" />
                    {(activeAsset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <input ref={videoInputRef} type="file" accept="video/*,.mkv,.avi" hidden multiple={cameraMode !== 'single'}
                onChange={event => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  if (files.length) void uploadVideo(files);
                }}
              />
              {cameraMode !== 'single' && uploadRows.length > 0 && <ul className="space-y-1 text-xs">
                {uploadRows.map((row, index) => <li key={index}>{row.file.name} · {row.done ? 'Ready' : row.error ?? (uploadProgress === null ? 'Pending' : row.progress + '%')}</li>)}
                {uploadProgress !== null ? <li><Button type="button" size="sm" onClick={() => { uploadRef.current?.abort(); setUploadProgress(null); }}>Cancel batch upload</Button></li> :
                  uploadRows.some(row => !row.done) && <li><Button type="button" size="sm" onClick={() => { void uploadVideo(uploadRows.filter(row => !row.done).map(row => row.file)); }}>Retry pending files</Button></li>}
              </ul>}
              <Button
                type="button"
                variant="outline"
                disabled={isAnalyzing || isOpening || uploadProgress !== null}
                onClick={() => activeProject ? videoInputRef.current?.click() : setActiveTab('media')}
                className="inline-flex items-center gap-2 border-zinc-700 bg-zinc-950/80 hover:bg-zinc-800 hover:text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>{activeAsset ? 'Upload another video' : 'Add a video'}</span>
              </Button>
              {uploadProgress !== null && (
                <p role="status" className="text-xs text-amber-300 flex items-center gap-1.5 animate-pulse font-medium">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  {uploadProgress < 100 ? 'Uploading video (' + uploadProgress + '%)…' : 'Checking video…'}
                </p>
              )}
            </div>
            {uploadError && <p role="alert" className="text-xs text-red-300">{uploadError}</p>}

            {detectedCategory && (() => {
              const CategoryIcon = detectedCategory.icon;
              return (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CategoryIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-emerald-400">{detectedCategory.badge}</span>
                    </div>
                    <Badge variant="success" className="font-mono text-[10px]">
                      AI Detection
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {detectedCategory.description}
                  </p>
                  {mode !== detectedCategory.mode ? (
                    <Button
                      type="button"
                      variant="success"
                      disabled={isAnalyzing || isOpening}
                      onClick={() => setMode(detectedCategory.mode)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold text-zinc-950 shadow-md transition-all active:scale-[0.99] cursor-pointer"
                    >
                      <CategoryIcon className="w-4 h-4 shrink-0" />
                      <span className="truncate">Switch to {detectedCategory.category} Mode (Recommended)</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 ml-1 opacity-75" />
                    </Button>
                  ) : (
                    <div className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 py-2 px-4 text-xs font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{detectedCategory.category} Mode Active</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>

          {/* 2. Select AI Editing Mode */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                2. Select AI Editing Mode
              </h3>
              <Badge variant="warning" className="text-[11px] font-medium">
                {MODES.find((m) => m.id === mode)?.label}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {MODES.map((item) => {
                const IconComponent = item.icon;
                const isSelected = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isAnalyzing || isOpening}
                    onClick={() => setMode(item.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? item.bgActive
                        : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <IconComponent
                        className={`w-4 h-4 ${isSelected ? item.color : 'text-zinc-400'}`}
                      />
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-bold leading-tight ${
                        isSelected ? 'text-white' : 'text-zinc-300'
                      }`}
                    >
                      {cameraMode !== 'single' && item.id === 'custom' ? 'Product' :
                        cameraMode !== 'single' && item.id === 'auto_highlight' ? 'Vlog & Highlights' : item.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                      {cameraMode !== 'single' && item.id === 'custom' ? 'Show context, demonstration, and useful product detail.' : item.tagline}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeProject && <fieldset disabled={isAnalyzing || isOpening}>
              {activeProject.mediaAssets.filter(asset => asset.id !== activeAsset?.id && asset.metadata.hasVideo).length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-zinc-400 block">Include additional source videos (up to three):</span>
                  {activeProject.mediaAssets.filter(asset => asset.id !== activeAsset?.id && asset.metadata.hasVideo).map(asset => (
                    <label key={asset.id} className="flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={additionalSources.includes(asset.id)}
                        disabled={additionalSources.length >= 3 && !additionalSources.includes(asset.id)}
                        onChange={event => setAdditionalSources(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id))}
                        className="rounded border-zinc-700 text-amber-400"
                      />
                      Include {asset.filename}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>}
            {mode === 'cooking_recipe' && activeProject && (
              <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                <fieldset disabled={isAnalyzing || isOpening} className="space-y-3 text-xs text-zinc-300">
                  <label className="flex flex-wrap items-center gap-2 font-medium">
                    Recipe style
                    <div className="inline-block">
                      <Select
                        value={recipeStyle}
                        disabled={isAnalyzing || isOpening}
                        onValueChange={(val) => setRecipeStyle(val as RecipeStyle)}
                      >
                        <SelectTrigger aria-label="Recipe style" className="w-40 h-8 text-xs py-1">
                          <SelectValue placeholder="Recipe style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recipe">Recipe focused</SelectItem>
                          <SelectItem value="cinematic">Cinematic</SelectItem>
                          <SelectItem value="quick_tip">Quick tip</SelectItem>
                          <SelectItem value="step_by_step">Step by step</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </label>
                </fieldset>
              </div>
            )}
          </Card>

          {/* 3. Duration Presets */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                3. Choose reel length
              </h3>
              <Badge variant="warning" className="font-mono font-bold text-[11px]">
                {targetDurationSeconds}s Target
              </Badge>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {DURATION_PRESETS.map((preset) => {
                const isSelected = durationPreset === preset.value;
                return (
                  <button
                    key={String(preset.value)}
                    type="button"
                    disabled={isAnalyzing || isOpening}
                    aria-pressed={isSelected}
                    onClick={() => setDurationPreset(preset.value)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/20'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {durationPreset === 'custom' && (
              <div className="pt-2 flex items-center space-x-4">
                <input
                  type="range"
                  disabled={isAnalyzing || isOpening}
                  aria-label="Custom duration in seconds"
                  min="5"
                  max="300"
                  step="1"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="flex-1 accent-amber-400 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-white px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800">
                  {customDuration}s
                </span>
              </div>
            )}
          </Card>

          {/* Trigger Button & Status */}
          <div className="space-y-3">
            <Button
              type="button"
              disabled={isAnalyzing || isOpening || !activeAsset || uploadProgress !== null}
              onClick={() => void runAutoCut()}
              className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-sm shadow-xl shadow-amber-400/15 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>
                {isAnalyzing ? 'Creating your reel…' : 'Generate reel'}
              </span>
            </Button>

            {isAnalyzing && (
              <div role="status" className="space-y-1.5 rounded-xl border border-amber-400/20 bg-zinc-950 p-4 animate-pulse">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-amber-300">{progressStage}</span>
                  <span className="font-mono font-bold text-white">
                    Processing…
                  </span>
                </div>
              </div>
            )}

            {isAnalyzing && <Button type="button" onClick={() => { requestVersion.current++; requestRef.current?.abort(); setIsAnalyzing(false); setProgressStage('Cancelled'); }}>Cancel analysis</Button>}
            {hasRun && analysisNotice && <p role="status" className="text-xs text-zinc-400">{analysisNotice}</p>}
            {hasRun && achievedDurationMs < targetDurationSeconds * 1000 && <p className="text-xs text-amber-300" role="status">Selected footage is shorter than the target. Select more clips or reduce the target; footage will not be extended past its source.</p>}
            {hasRun && achievedDurationMs > targetDurationSeconds * 1000 && candidates.some(clip => clip.selected && clip.locked) &&
              <p className="text-xs text-amber-300" role="status">The draft exceeds the target duration. Locked ranges retain their full length.</p>}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Analysis Error</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{error}</p>
                  {analysisMethod === 'semantic' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setAnalysisMethod('scene_audio');
                      void runAutoCut('scene_audio');
                    }}>Use local analysis</Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Advanced AI Controls Accordion */}
          <Card className="p-5 space-y-4">
            <button
              type="button"
              aria-expanded={showAdvanced}
              aria-controls="autocut-advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Optional settings
                </h3>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {showAdvanced && (
              <div id="autocut-advanced" className="space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-2.5">
                  <label htmlFor="autocut-method" className="text-xs font-bold text-zinc-300">Analysis method</label>
                  <Select
                    value={analysisMethod}
                    disabled={isAnalyzing || isOpening}
                    onValueChange={(val) => setAnalysisMethod(val as 'semantic' | 'scene_audio')}
                  >
                    <SelectTrigger id="autocut-method" aria-label="Analysis method" className="w-full text-xs">
                      <SelectValue placeholder="Select analysis method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semantic">AI visual and speech analysis (configured provider)</SelectItem>
                      <SelectItem value="scene_audio">Scene and audio estimates (local)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-400 leading-relaxed">AI analysis sends sampled media to your configured provider. If Gemini reaches its limit, Auto Cut can continue with Ollama Cloud and configured Cloudflare speech recognition. Local estimates use FFmpeg.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/80">
                  {/* Editing Intensity */}
                  <div className="space-y-1.5">
                    <label htmlFor="autocut-intensity" className="text-[11px] font-semibold text-zinc-400">
                      Editing Intensity
                    </label>
                    <Select
                      value={intensity}
                      disabled={isAnalyzing || isOpening}
                      onValueChange={(val) => setIntensity(val as EditingIntensity)}
                    >
                      <SelectTrigger id="autocut-intensity" aria-label="Editing Intensity" className="w-full text-xs">
                        <SelectValue placeholder="Select intensity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Minimal (Subtle trims &amp; wide context)</SelectItem>
                        <SelectItem value="balanced">Balanced (Standard social pacing)</SelectItem>
                        <SelectItem value="aggressive">Aggressive (High punchiness &amp; jump cuts)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Video Pacing */}
                  <div className="space-y-1.5">
                    <label htmlFor="autocut-pacing" className="text-[11px] font-semibold text-zinc-400">
                      Video Pacing
                    </label>
                    <Select
                      value={pacing}
                      disabled={isAnalyzing || isOpening}
                      onValueChange={(val) => setPacing(val as VideoPacing)}
                    >
                      <SelectTrigger id="autocut-pacing" aria-label="Video Pacing" className="w-full text-xs">
                        <SelectValue placeholder="Select pacing" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow &amp; Deliberate (4s - 8s shots)</SelectItem>
                        <SelectItem value="normal">Normal (2.5s - 5s shots)</SelectItem>
                        <SelectItem value="fast">Fast (1.5s - 3s cuts)</SelectItem>
                        <SelectItem value="dynamic">Dynamic (Variable velocity)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Silence Removal */}
                  <div className="space-y-1.5">
                    <label htmlFor="autocut-silence" className="text-[11px] font-semibold text-zinc-400">
                      Silence Removal
                    </label>
                    <Select
                      value={silenceRemoval}
                      disabled={isAnalyzing || isOpening}
                      onValueChange={(val) => setSilenceRemoval(val as SilenceRemoval)}
                    >
                      <SelectTrigger id="autocut-silence" aria-label="Silence Removal" className="w-full text-xs">
                        <SelectValue placeholder="Select silence removal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Disabled (Preserve natural pauses)</SelectItem>
                        <SelectItem value="light">Light (Cut pauses &gt; 1.5s)</SelectItem>
                        <SelectItem value="moderate">Moderate (Cut pauses &gt; 0.6s)</SelectItem>
                        <SelectItem value="aggressive">Aggressive (Cut all micro-pauses)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="autocut-scene-selection" className="text-[11px] font-semibold text-zinc-400">Scene priority</label>
                    <Select
                      value={sceneSelection}
                      disabled={isAnalyzing || isOpening}
                      onValueChange={(val) => setSceneSelection(val as SceneSelection)}
                    >
                      <SelectTrigger id="autocut-scene-selection" aria-label="Scene priority" className="w-full text-xs">
                        <SelectValue placeholder="Select scene priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="visual">Scene changes</SelectItem>
                        <SelectItem value="speech">Audio activity (speech not verified)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>


                </div>
              </div>
            )}
          </Card>

        </div>

        {/* Right Column: Audition Player & Summary */}
        <div className="lg:col-span-5 space-y-6">
          {cameraMode !== 'single' && <AutoCutMulticamera assets={cameras} sync={cameraSync} master={masterCamera}
            evidence={sourceCandidates} onPreview={clip => auditionClip(clip)}
            onRecommend={() => {
              let changed = 0;
              const draft = candidates.flatMap(clip => {
                if (!clip.selected || clip.locked || clip.durationMs < 1500) return [clip];
                const normalized = { ...clip, sourceVideoId: clip.sourceVideoId ?? activeAsset?.id };
                const best = recommendCamera(normalized, cameras, sourceCandidates, cameraSync);
                if (!best) return [clip];
                changed++;
                return switchCameraRange(normalized, best.asset, cameraSync, 0);
              });
              if (!changed) { setSyncError('No alternate covers the full shot with a clear quality improvement.'); return; }
              setCandidates(draft); setCameraEdited(true); setSyncError('');
            }}
            onPreviewDraft={() => {
              if (isOpening) return;
              setIsOpening(true); setSyncError('');
              const version = requestVersion.current;
              void (brollEdits.length ? checkPlacedBRoll() : Promise.resolve(undefined)).then(authorized => {
                if (version !== requestVersion.current) return;
                const project = buildReel(hook, authorized);
                videoRef.current?.pause(); setHookTime(0); setHookPlaying(true); setHookPreview(project);
              }).catch(err => {
                if (version === requestVersion.current) setSyncError(err instanceof Error ? err.message : 'Cinematic preview unavailable.');
              }).finally(() => { if (version === requestVersion.current) setIsOpening(false); });
            }}
            clips={candidates.filter(clip => clip.selected).map(clip => ({ ...clip, sourceVideoId: clip.sourceVideoId ?? activeAsset?.id }))}
            synchronized={cameraMode === 'sync'} busy={syncing || isOpening} error={syncError} onSync={() => { void runCameraSync(); }}
            onCancel={() => syncRequest.current?.abort()} onMaster={setMasterCamera}
            onManual={(id, offsetMs) => {
              setCameraSync(previous => ({ ...previous, ...(activeAsset ? { [activeAsset.id]: { offsetMs: 0, confidence: 100, method: 'manual' as const } } : {}),
                [id]: { offsetMs, confidence: 100, method: 'manual' } })); setSyncError('');
            }}
            onSwitch={(clip, asset, offset) => {
              try {
                const replacement = switchCameraRange(clip, asset, cameraSync, offset);
                const last = replacement.at(-1)!;
                if (sourceCandidates.some(item => item.sourceVideoId === asset.id && item.transitionBlack?.some(range =>
                  range.startMs < last.endMs && range.endMs > last.startMs))) throw new Error('That alternate range contains detected black footage.');
                setCandidates(previous => previous.flatMap(item => item.id === clip.id ? replacement : [item])); setCameraEdited(true); setSyncError('');
              } catch (err) { setSyncError(err instanceof Error ? err.message : 'Unable to switch angles.'); }
            }}
            onMove={(id, direction) => { setCameraEdited(true); setCandidates(previous => {
              const selected = previous.filter(clip => clip.selected);
              const index = selected.findIndex(clip => clip.id === id), other = selected[index + direction];
              if (!other || other.locked || selected[index]?.locked) return previous;
              return previous.map(clip => clip.id === id ? other : clip.id === other.id ? selected[index] : clip);
            }); }} onLock={id => { setCameraEdited(true); setCandidates(previous => previous.map(clip => clip.id === id ? { ...clip, locked: !clip.locked } : clip)); }} />}
          {/* Audition Player */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Video Preview</span>
              {activeAuditionClip && (
                <Badge variant="warning" className="font-mono text-[10px] truncate max-w-[200px]">
                  {activeAuditionClip.category || 'Clip Audition'}
                </Badge>
              )}
            </div>

            <div ref={previewRef} className="overflow-hidden rounded-xl border border-zinc-800 bg-black fullscreen:flex fullscreen:flex-col fullscreen:justify-center">
              {mediaWebUrl ? (
                <>
                <video
                  ref={videoRef}
                  src={mediaWebUrl}
                  className="aspect-video w-full object-contain fullscreen:min-h-0 fullscreen:flex-1"
                  playsInline
                  preload="metadata"
                  aria-label="Source video preview"
                  onContextMenu={event => event.preventDefault()}
                  onTimeUpdate={handlePreviewTimeUpdate}
                  onLoadedMetadata={event => {
                    const video = event.currentTarget;
                    setPreviewDuration(Number.isFinite(video.duration) ? video.duration : 0);
                    if (activeAuditionClip) {
                      video.currentTime = (pendingPreviewSeek.current ?? activeAuditionClip.startMs) / 1000;
                      pendingPreviewSeek.current = null;
                      void video.play().catch(() => {});
                    }
                  }}
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={() => setPreviewPlaying(false)}
                  onVolumeChange={event => {
                    setPreviewVolume(event.currentTarget.volume);
                    setPreviewMuted(event.currentTarget.muted);
                  }}
                />
                <div className="space-y-1 border-t border-zinc-800 bg-zinc-950 px-3 py-2">
                  <Slider aria-label="Seek video" min={0} max={previewDuration || 1} step={0.01}
                    disabled={!previewDuration} value={[Math.min(previewTime, previewDuration)]}
                    onValueChange={([time]) => {
                      if (!videoRef.current) return;
                      if (activeAuditionClip && (time < activeAuditionClip.startMs / 1000 || time >= activeAuditionClip.endMs / 1000)) setActiveAuditionClip(null);
                      videoRef.current.currentTime = time;
                      setPreviewTime(time);
                    }} />
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={previewPlaying ? 'Pause preview' : 'Play preview'} onClick={togglePreview}>
                      {previewPlaying ? <Pause size={17} /> : <Play size={17} />}
                    </Button>
                    <span className="mr-auto text-xs tabular-nums text-zinc-300">
                      {formatPreviewTime(previewTime)} / {formatPreviewTime(previewDuration)}
                    </span>
                    <Button type="button" variant="ghost" size="icon" aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'} onClick={() => {
                      if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
                    }}>
                      {previewMuted || previewVolume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    </Button>
                    <Slider className="w-14 sm:w-20" aria-label="Preview volume" min={0} max={1} step={0.01}
                      value={[previewMuted ? 0 : previewVolume]} onValueChange={([volume]) => {
                        if (!videoRef.current) return;
                        videoRef.current.volume = volume;
                        videoRef.current.muted = false;
                      }} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
                      <Maximize size={17} />
                    </Button>
                  </div>
                </div>
                </>
              ) : (
                <div className="grid aspect-video place-items-center text-xs text-zinc-500">No active video loaded</div>
              )}

            </div>
            {activeAuditionClip && (
              <Button type="button" onClick={() => setActiveAuditionClip(null)} className="text-xs text-amber-300">
                Switch to full video
              </Button>
            )}
          </Card>

          {scenes.length > 0 && activeAsset && (
            <fieldset disabled={isAnalyzing || isOpening}>
            <AutoCutSceneReview scenes={scenes} durationMs={activeAsset.metadata.durationMs} playheadMs={Math.round(previewTime * 1000)}
              onChange={setScenes} onApply={useIncludedScenes}
              onPreview={scene => {
                const [clip] = sceneCandidates([{ ...scene, excluded: false }], []);
                auditionClip(clip);
              }} />
            </fieldset>
          )}

          {hasRun && cameraMode !== 'sync' && <fieldset disabled={isAnalyzing || isOpening}>
            <AutoCutTransitionReview clips={transitionTargets} config={naturalTransitions}
              onChange={next => { setNaturalTransitions(next); setTransitionFeedback(''); setHookPreview(undefined); }} onPreview={index => { void previewTransition(index); }} />
            {transitionFeedback && <p role="status" className="mt-2 text-xs text-zinc-300">{transitionFeedback}</p>}
          </fieldset>}

          {hasRun && <fieldset disabled={isAnalyzing || isOpening}>
            <AutoCutQualityReview clips={sourceCandidates} config={quality} mode={mode} clusters={duplicateClusters}
              sources={Object.fromEntries(activeProject?.mediaAssets.map(asset => [asset.id, asset.filename]) ?? [])}
              onChange={setQuality} onApply={rebuildWithQuality} onPreview={auditionClip} />
          </fieldset>}

          {hasRun && activeProject && <fieldset disabled={isAnalyzing || isOpening}>
            <AutoCutBRollReview targets={brollTargets}
              footage={[...sourceCandidates.filter(clip => !brollFootage.some(item => item.sourceVideoId === clip.sourceVideoId)), ...brollFootage]
                .filter(clip => duplicateDecision(clip, duplicateDecisions) !== 'exclude')}
              library={brollLibrary} authorized={brollAuthorized} edits={brollEdits} ignored={brollIgnored}
              projectId={activeProject.id} busy={brollBusy} error={brollError}
              onOpen={() => { void refreshBRoll(); }} onAnalyze={asset => { void refreshBRoll(asset); }}
              onSearchProject={() => { void refreshBRoll('project'); }}
              onChange={next => { void commitBRoll(next); }}
              onIgnore={key => setBRollIgnored(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])}
              onPreview={() => {
                if (brollRequest.current) return;
                const controller = new AbortController();
                brollRequest.current = controller;
                setBRollBusy(true); setBRollError('');
                void checkPlacedBRoll(controller.signal).then(authorized => {
                  controller.signal.throwIfAborted();
                  const project = buildReel(hook, authorized);
                  videoRef.current?.pause();
                  setHookTime(0); setHookPlaying(true); setHookPreview(project);
                }).catch(err => {
                  if (!controller.signal.aborted) setBRollError(err instanceof Error ? err.message : 'B-roll preview unavailable.');
                }).finally(() => {
                  brollRequest.current = null;
                  if (!controller.signal.aborted) setBRollBusy(false);
                });
              }} />
          </fieldset>}

          {hasRun && (activeAsset?.metadata.hasVideo || duplicateClusters.length > 0) && (
            <fieldset disabled={isAnalyzing || isOpening}>
              <AutoCutDuplicateReview clusters={duplicateClusters} decisions={duplicateDecisions}
                sources={Object.fromEntries(activeProject?.mediaAssets.map(asset => [asset.id, asset.filename]) ?? [])}
                onPreview={clip => auditionClip(clip)} onDecide={decideDuplicates}
                onRestore={decision => {
                  const next = duplicateDecisions.filter(item => item !== decision);
                  saveDuplicateDecisions(next);
                  setCandidates(previous => applyDuplicateDecisions([
                    ...previous,
                    ...sourceCandidates.filter(clip => duplicateDecision(clip, [decision]) !== undefined &&
                      !previous.some(item => item.id === clip.id)).map(clip => ({ ...clip, selected: false })),
                  ], next));
                }} />
            </fieldset>
          )}

          {sourceCandidates.some(clip => clip.recipeOrder !== undefined) && (
            <fieldset disabled={isAnalyzing || isOpening}>
              <AutoCutRecipeReview steps={sourceCandidates} notice={recipeNotice} onChange={setSourceCandidates}
                sourceNames={Object.fromEntries(activeProject?.mediaAssets.map(asset => [asset.id, asset.filename]) ?? [])}
                onApply={() => { setUsingScenes(false); applyRecipe(sourceCandidates); }} onPreview={auditionClip} />
            </fieldset>
          )}

          {(speechMoments.length > 0 || (hasRun && activeAsset?.metadata.hasAudio)) && (
            <fieldset disabled={isAnalyzing || isOpening}>
              <div className="mb-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" role="switch" checked={showCaptions}
                  onChange={event => { setShowCaptions(event.target.checked); setHookPreview(undefined); }} /> Show auto captions in Reel Maker</label>
                <p className="mt-1 text-zinc-400">{speechMoments.length ? 'Review or correct the source transcript below. Captions follow the edited timeline.' : 'No timed speech is available. Captions will be empty until timed speech is available.'}</p>
              </div>
              <AutoCutSpeechReview moments={speechMoments}
                onSeek={(moment, timeMs) => auditionClip(speechClip(moment), timeMs)}
                onEdit={editSpeechText}
                onApply={buildSpeechDraft}
                onAdd={clip => {
                  const source = clip.sourceVideoId ?? activeAsset?.id;
                  if (candidates.some(item => item.selected && item.id !== clip.id &&
                    (item.sourceVideoId ?? activeAsset?.id) === source &&
                    item.startMs < clip.endMs && clip.startMs < item.endMs)) {
                    throw new Error('Deselect the overlapping draft clip before adding this speech range.');
                  }
                  setCandidates(previous => [...previous.filter(item => item.id !== clip.id), clip]);
                }} />
            </fieldset>
          )}

          {hasRun && activeAsset?.metadata.hasVideo && (
            <fieldset disabled={isAnalyzing || isOpening} className="space-y-2">
              <AutoCutHookReview options={hookOptions} selected={hook} duration={hookDuration}
                onDuration={setHookDuration} onSelect={opening => { setHook(opening); setHookPreview(undefined); }}
                onPreview={opening => {
                  const project = buildReel(opening);
                  videoRef.current?.pause();
                  setHookTime(0);
                  setHookPlaying(true);
                  setHookPreview(project);
                }} />
            </fieldset>
          )}
          {hookPreview && visible && <div className="space-y-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setHookPreview(undefined)}>Close draft preview</Button>
            <div className="h-80"><TimelinePreview key={hookPreview.id} project={hookPreview} currentTime={hookTime}
              playing={hookPlaying} onTime={setHookTime} onPlaying={setHookPlaying} /></div>
          </div>}

          {/* Results Summary Box */}
          {hasRun && (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Your reel draft
                </span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {selectedCount} clips selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block mb-0.5">
                    Target Duration
                  </span>
                  <span className="text-sm font-black text-zinc-300 font-mono">
                    {targetDurationSeconds}s
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/70 border border-amber-400/20">
                  <span className="text-[10px] text-amber-400/80 block mb-0.5">
                    Selected length
                  </span>
                  <span className="text-sm font-black text-amber-400 font-mono">
                    {(achievedDurationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button
                  type="button"
                  onClick={addToTimeline}
                  disabled={selectedCount === 0 || isOpening || isAnalyzing}
                  className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Add to Timeline &amp; Clips</span>
                </Button>

                <Button
                  type="button"
                  onClick={openInReelMaker}
                  disabled={selectedCount === 0}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer border border-zinc-700"
                >
                  <Clapperboard className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isOpening ? 'Saving sequence…' : 'Open in timeline editor'}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generated Candidates Review List */}
      {candidates.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Review suggested clips</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-bold">
                  {candidates.length} candidates
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Inspect each moment before saving. Click on any clip to audition it in the player.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Button type="button" onClick={regenerateSelected} disabled={selectedCount === 0 || isAnalyzing}>Regenerate selected clips</Button>
              <Button
                type="button"
                onClick={() => {
                  const allSelected = candidates.every((c) => c.selected || duplicateDecision(c, duplicateDecisions));
                  setCandidates((prev) =>
                    prev.map((c) => c.locked || duplicateDecision(c, duplicateDecisions) ? c : { ...c, selected: !allSelected })
                  );
                }}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                {candidates.every((c) => c.selected || duplicateDecision(c, duplicateDecisions)) ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {candidates.map((candidate, idx) => {
              const isSelected = candidate.selected;
              const isAuditioning = activeAuditionClip?.id === candidate.id;

              return (
                <div
                  key={candidate.id}
                  className={`relative rounded-xl border p-4 transition-all space-y-3 ${
                    isSelected
                      ? 'border-zinc-700 bg-zinc-950/80 shadow-md'
                      : 'border-zinc-800/60 bg-zinc-950/40 opacity-70'
                  } ${isAuditioning ? 'ring-2 ring-amber-400' : ''}`}
                >
                  {/* Top Bar: Checkbox + Tag + Score */}
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={candidate.locked || Boolean(duplicateDecision(candidate, duplicateDecisions))}
                        onChange={() => toggleClipSelection(candidate.id)}
                        className="rounded border-zinc-700 text-amber-400 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white">
                        Moment #{idx + 1}
                      </span>
                    </label>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        {candidate.score}% Estimate
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail / Visual Box */}
                  <div className="relative aspect-video rounded-lg bg-zinc-900 overflow-hidden border border-zinc-800 group">
                    {candidate.thumbnailBase64 ? (
                      <img
                        src={candidate.thumbnailBase64}
                        alt={candidate.reason}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                        Visual Cut
                      </div>
                    )}

                    {/* Timecode overlay badge */}
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-200">
                      {(candidate.startMs / 1000).toFixed(1)}s -{' '}
                      {(candidate.endMs / 1000).toFixed(1)}s
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-amber-400 text-zinc-950 text-[10px] font-black font-mono">
                      {(candidate.durationMs / 1000).toFixed(1)}s
                    </div>

                    {/* Quick Audition Button */}
                    <button
                      type="button"
                      aria-label={`Preview moment ${idx + 1}`}
                      onClick={() => auditionClip(candidate)}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center text-zinc-950 shadow-lg">
                        <Play className="w-4 h-4 ml-0.5" />
                      </div>
                    </button>
                  </div>

                  {/* Reason & Category Info */}
                  <div className="space-y-1">
                    <div className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-300">
                      {candidate.category}
                    </div>
                    <p className="text-xs text-zinc-300 leading-snug">
                      {candidate.reason}
                    </p>
                  </div>

                  <Button type="button" variant="outline" size="sm"
                    aria-label={(isSelected ? 'Remove' : 'Add') + ' moment ' + (idx + 1) + (isSelected ? ' from reel' : ' to reel')}
                    disabled={isAnalyzing || isOpening || candidate.locked || Boolean(duplicateDecision(candidate, duplicateDecisions))}
                    onClick={() => toggleClipSelection(candidate.id)}>
                    {isSelected ? 'Remove from reel' : 'Add to reel'}
                  </Button>

                  {/* Action row */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => auditionClip(candidate)}
                      className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Audition Slice</span>
                    </button>

                    <span className="text-[10px] text-zinc-500 font-mono">
                      {candidate.analysisMethod === 'semantic' ? `AI confidence estimate: ${candidate.confidence}% — review` : 'Heuristic estimate — review manually'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
