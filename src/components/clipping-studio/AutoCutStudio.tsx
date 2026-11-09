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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AutoCutSceneReview } from './AutoCutSceneReview';
import { reconcileAutoCutScenes, sceneCandidates } from '@/lib/auto-cut/scenes';
import { assembleRecipe } from '@/lib/auto-cut/recipe';
import { AutoCutRecipeReview } from './AutoCutRecipeReview';
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
  return <AutoCutWorkspace key={workspaceKey} visible={visible} draftKey={draftKey} />;
};

function readDraft(key: string | null) {
  if (!key || typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!saved) return null;
    return {
      sourceCandidates: AutoCutClipCandidateSchema.array().parse(saved.sourceCandidates),
      candidates: AutoCutClipCandidateSchema.array().parse(saved.candidates),
      settings: AutoCutSettingsSchema.parse(saved.settings),
      scenes: AutoCutSceneSchema.array().parse(saved.scenes ?? []),
      usingScenes: saved.usingScenes === true,
      notice: typeof saved.notice === 'string' ? saved.notice : '',
      recipeNotice: typeof saved.recipeNotice === 'string' ? saved.recipeNotice : '',
    };
  } catch {
    return null;
  }
}

const AutoCutWorkspace: React.FC<{ visible: boolean; draftKey: string | null }> = ({ visible, draftKey }) => {
  const router = useRouter();
  const [savedDraft] = useState(() => readDraft(draftKey));
  const {
    activeProject,
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
  const [transition, setTransition] = useState<TransitionStyle>(savedDraft?.settings.transition ?? 'dynamic');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Results State
  const [sourceCandidates, setSourceCandidates] = useState<AutoCutClipCandidate[]>(savedDraft?.sourceCandidates ?? []);
  const [recipeStyle, setRecipeStyle] = useState<RecipeStyle>(savedDraft?.settings.recipeStyle ?? 'recipe');
  const [additionalSources, setAdditionalSources] = useState<string[]>(() =>
    [...new Set(savedDraft?.sourceCandidates.flatMap(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset?.id ? [clip.sourceVideoId] : []) ?? [])]);
  const [recipeNotice, setRecipeNotice] = useState(savedDraft?.recipeNotice ?? '');
  const [candidates, setCandidates] = useState<AutoCutClipCandidate[]>(savedDraft?.candidates ?? []);
  const [scenes, setScenes] = useState<AutoCutScene[]>(savedDraft?.scenes ?? []);
  const [usingScenes, setUsingScenes] = useState(savedDraft?.usingScenes ?? false);
  const achievedDurationMs = candidates.filter(c => c.selected).reduce((sum, c) => sum + c.durationMs, 0);
  const [isOpening, setIsOpening] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadVideo = async (file: File) => {
    if (!activeProject || uploadRef.current) return;
    const controller = new AbortController();
    uploadRef.current = controller;
    setUploadError(null);
    setUploadProgress(0);
    try {
      const data = await uploadFileWithProgress<{ success?: boolean; asset?: MediaAsset; error?: string }>(
        '/api/clipping-studio/projects/' + encodeURIComponent(activeProject.id) + '/media',
        file, setUploadProgress, undefined, controller.signal
      );
      if (controller.signal.aborted || useClippingStore.getState().activeProject?.id !== activeProject.id) return;
      if (!data.success || !data.asset) throw new Error(data.error || 'Video upload failed.');
      addMediaAsset(data.asset);
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
  useEffect(() => () => { requestVersion.current++; requestRef.current?.abort(); uploadRef.current?.abort(); }, []);
  const [hasRun, setHasRun] = useState(Boolean(savedDraft));

  // Player Audition State
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
      sessionStorage.setItem(draftKey, JSON.stringify({
        sourceCandidates,
        candidates,
        scenes,
        usingScenes,
        notice: analysisNotice,
        recipeNotice,
        settings: { analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle },
      }));
    } catch { /* Draft remains available in the current editor. */ }
  }, [draftKey, hasRun, sourceCandidates, candidates, scenes, usingScenes, analysisNotice, recipeNotice, analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle]);

  const previewAsset = activeProject?.mediaAssets.find(asset => asset.id === activeAuditionClip?.sourceVideoId) ?? activeAsset;
  const mediaWebUrl = previewAsset ? getMediaAssetWebUrl(previewAsset) : '';

  // Handle Audition Clip Playback
  const auditionClip = (clip: AutoCutClipCandidate) => {
    if (!videoRef.current) return;
    setActiveAuditionClip(clip);
    if (clip.sourceVideoId && clip.sourceVideoId !== previewAsset?.id) return;
    const startSec = clip.startMs / 1000;
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
        c.id === clipId ? { ...c, selected: !c.selected } : c
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
              targetDurationSeconds,
              intensity,
              pacing,
              silenceRemoval,
              sceneSelection,
              transition,
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
          const result = source === activeAsset ? data : await analyzeSource(source);
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
        applyRecipe(steps, method);
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
      setScenes(nextScenes);
      setAnalysisNotice(data.analysis?.warning || 'Review the generated clips before export.');
      setSourceCandidates(data.analysis?.candidates || []);
      if (usingScenes && nextScenes.length) {
        const pool = sceneCandidates(nextScenes, data.analysis?.candidates ?? []);
        setCandidates(optimizeDurationAndAssemble(pool, {
          analysisMethod: method, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition,
        }).assembledClips);
        return;
      }
      const chosen = new Map<string, AutoCutClipCandidate>((data.assembledClips || []).map((c: AutoCutClipCandidate) => [c.id, c]));
      setCandidates((data.analysis?.candidates || []).map((c: AutoCutClipCandidate) => ({ ...(chosen.get(c.id) || c), selected: chosen.has(c.id) })));
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
    const result = assembleRecipe(steps, {
      analysisMethod: method, mode: 'cooking_recipe', targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition, recipeStyle,
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
    const selected = candidates.filter((c) => c.selected);
    if (!selected.length) return;
    if (selected.some(clip => clip.sourceVideoId && clip.sourceVideoId !== activeAsset.id)) {
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

  // Save a distinct reel with the entire editable sequence, preserving previous projects.
  const openInReelMaker = async () => {
    if (!activeProject || !activeAsset || isOpening) return;
    setIsOpening(true); setError(null);
    const version = requestVersion.current;
    try {
      const sequence = candidates.map(candidate => ({ ...candidate, transitionToNext: transition }));
      const recipe = sequence.some(clip => clip.recipeOrder !== undefined);
      if (!recipe) sequence.sort((first, second) => first.startMs - second.startMs);
      const project = createAutoCutReel(recipe ? activeProject.mediaAssets : activeAsset, sequence, activeProject.name + ' — Auto Cut');
      const reel = await saveReel(project, { originProjectId: activeProject.id, originProjectName: activeProject.name });
      if (version === requestVersion.current) router.push('/reel-maker?savedReel=' + encodeURIComponent(reel.id));
    } catch (err: unknown) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Unable to open the sequence.');
    } finally { setIsOpening(false); }
  };

  const regenerateSelected = () => {
    if (!usingScenes && sourceCandidates.some(clip => clip.recipeOrder !== undefined)) {
      applyRecipe(sourceCandidates);
      return;
    }
    const ids = new Set(candidates.filter(c => c.selected).map(c => c.id));
    const pool = usingScenes ? sceneCandidates(scenes, sourceCandidates.filter(clip =>
      !clip.sourceVideoId || clip.sourceVideoId === activeAsset?.id)) : sourceCandidates;
    const result = optimizeDurationAndAssemble(pool.map(c => ({ ...c, selected: ids.has(c.id) })), {
      analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition,
    });
    const chosen = new Map(result.assembledClips.map(c => [c.id, c]));
    setCandidates(pool.map(c => ({ ...(chosen.get(c.id) || c), selected: chosen.has(c.id) })));
  };

  const useIncludedScenes = () => {
    if (!activeAsset) return;
    const accepted = validateAutoCutScenes(scenes, activeAsset.id, activeAsset.metadata.durationMs);
    const pool = sceneCandidates(accepted, sourceCandidates.filter(clip => !clip.sourceVideoId || clip.sourceVideoId === activeAsset.id));
    const result = optimizeDurationAndAssemble(pool, {
      analysisMethod, mode, targetDurationSeconds, intensity, pacing, silenceRemoval, sceneSelection, transition,
    });
    setCandidates(result.assembledClips);
    setUsingScenes(true);
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

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
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">1. Choose source video</h3>
            {activeAsset && activeProject ? (
              <select aria-label="Source video" value={activeAsset.id} disabled={isAnalyzing || isOpening || uploadProgress !== null}
                onChange={event => selectAsset(event.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">
                {activeProject.mediaAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
              </select>
            ) : <p className="text-sm text-zinc-400">Add a video to your project to get started.</p>}
            <input ref={videoInputRef} type="file" accept="video/*,.mkv,.avi" hidden
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void uploadVideo(file);
              }}
            />
            <Button type="button" variant="outline" disabled={isAnalyzing || isOpening || uploadProgress !== null}
              onClick={() => activeProject ? videoInputRef.current?.click() : setActiveTab('media')}>
              {activeAsset ? 'Upload another video' : 'Add a video'}
            </Button>
            {uploadProgress !== null && <p role="status" className="text-xs text-zinc-400">
              {uploadProgress < 100 ? 'Uploading video (' + uploadProgress + '%)…' : 'Checking video…'}
            </p>}
            {uploadError && <p role="alert" className="text-xs text-red-300">{uploadError}</p>}
            {mode === 'cooking_recipe' && activeProject && (
              <fieldset disabled={isAnalyzing || isOpening} className="space-y-2 text-xs text-zinc-300">
                <label className="flex flex-wrap items-center gap-2">Recipe style
                  <select value={recipeStyle} onChange={event => setRecipeStyle(event.target.value as RecipeStyle)}
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1">
                    <option value="recipe">Recipe focused</option><option value="cinematic">Cinematic</option>
                    <option value="quick_tip">Quick tip</option><option value="step_by_step">Step by step</option>
                  </select>
                </label>
                {activeProject.mediaAssets.filter(asset => asset.id !== activeAsset?.id && asset.metadata.hasVideo).map(asset => (
                  <label key={asset.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={additionalSources.includes(asset.id)}
                      disabled={additionalSources.length >= 3 && !additionalSources.includes(asset.id)}
                      onChange={event => setAdditionalSources(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id))} />
                    Include {asset.filename}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          {/* Duration Presets */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                2. Choose reel length
              </h3>
              <span className="text-[11px] font-mono font-bold text-amber-400">
                {targetDurationSeconds}s Target
              </span>
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
          </div>

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
            {error && (
              <div className="flex items-center space-x-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <div role="alert" className="space-y-2">
                  <p>{error}</p>
                  {analysisMethod === 'semantic' && <Button type="button" onClick={() => {
                    setAnalysisMethod('scene_audio');
                    void runAutoCut('scene_audio');
                  }}>Use local analysis</Button>}
                </div>
              </div>
            )}
          </div>
          {/* Advanced AI Controls Accordion */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
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
          {/* Mode Selector */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Editing style
              </h3>
              <span className="text-[11px] font-medium text-amber-400">
                {MODES.find((m) => m.id === mode)?.label}
              </span>
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
                      {item.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                      {item.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 p-5 space-y-2">
            <label htmlFor="autocut-method" className="text-xs font-bold text-zinc-300">Analysis method</label>
            <select id="autocut-method" value={analysisMethod} disabled={isAnalyzing || isOpening} onChange={e=>setAnalysisMethod(e.target.value as 'semantic' | 'scene_audio')} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white">
              <option value="semantic">AI visual and speech analysis (configured provider)</option>
              <option value="scene_audio">Scene and audio estimates (local)</option>
            </select>
            <p className="text-xs text-zinc-400">AI analysis sends sampled media to your configured provider. If Gemini reaches its limit, Auto Cut can continue with Ollama Cloud and configured Cloudflare speech recognition. Local estimates use FFmpeg.</p>
          </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/80">
                {/* Editing Intensity */}
                <div className="space-y-1.5">
                  <label htmlFor="autocut-intensity" className="text-[11px] font-semibold text-zinc-400">
                    Editing Intensity
                  </label>
                  <select disabled={isAnalyzing || isOpening}
                    id="autocut-intensity"
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value as EditingIntensity)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="minimal">Minimal (Subtle trims &amp; wide context)</option>
                    <option value="balanced">Balanced (Standard social pacing)</option>
                    <option value="aggressive">Aggressive (High punchiness &amp; jump cuts)</option>
                  </select>
                </div>

                {/* Video Pacing */}
                <div className="space-y-1.5">
                  <label htmlFor="autocut-pacing" className="text-[11px] font-semibold text-zinc-400">
                    Video Pacing
                  </label>
                  <select disabled={isAnalyzing || isOpening}
                    id="autocut-pacing"
                    value={pacing}
                    onChange={(e) => setPacing(e.target.value as VideoPacing)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="slow">Slow &amp; Deliberate (4s - 8s shots)</option>
                    <option value="normal">Normal (2.5s - 5s shots)</option>
                    <option value="fast">Fast (1.5s - 3s cuts)</option>
                    <option value="dynamic">Dynamic (Variable velocity)</option>
                  </select>
                </div>

                {/* Silence Removal */}
                <div className="space-y-1.5">
                  <label htmlFor="autocut-silence" className="text-[11px] font-semibold text-zinc-400">
                    Silence Removal
                  </label>
                  <select disabled={isAnalyzing || isOpening}
                    id="autocut-silence"
                    value={silenceRemoval}
                    onChange={(e) =>
                      setSilenceRemoval(e.target.value as SilenceRemoval)
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="disabled">Disabled (Preserve natural pauses)</option>
                    <option value="light">Light (Cut pauses &gt; 1.5s)</option>
                    <option value="moderate">Moderate (Cut pauses &gt; 0.6s)</option>
                    <option value="aggressive">Aggressive (Cut all micro-pauses)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="autocut-scene-selection" className="text-[11px] font-semibold text-zinc-400">Scene priority</label>
                  <select disabled={isAnalyzing || isOpening} id="autocut-scene-selection" value={sceneSelection} onChange={e => setSceneSelection(e.target.value as SceneSelection)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white">
                    <option value="balanced">Balanced</option><option value="visual">Scene changes</option><option value="speech">Audio activity (speech not verified)</option>
                  </select>
                </div>
                {/* Transitions */}
                <div className="space-y-1.5">
                  <label htmlFor="autocut-transition" className="text-[11px] font-semibold text-zinc-400">
                    Transitions
                  </label>
                  <select disabled={isAnalyzing || isOpening}
                    id="autocut-transition"
                    value={transition}
                    onChange={(e) =>
                      setTransition(e.target.value as TransitionStyle)
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="dynamic">Smart transitions</option>
                    <option value="smooth">Short crossfades where footage allows</option>
                    <option value="cut">Clean cuts</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Audition Player & Summary */}
        <div className="lg:col-span-5 space-y-6">
          {/* Audition Player */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Video Preview</span>
              {activeAuditionClip && (
                <span className="text-[10px] font-mono text-amber-400 truncate max-w-[200px]">
                  {activeAuditionClip.category || 'Clip Audition'}
                </span>
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
                      video.currentTime = activeAuditionClip.startMs / 1000;
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
          </div>

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

          {sourceCandidates.some(clip => clip.recipeOrder !== undefined) && (
            <fieldset disabled={isAnalyzing || isOpening}>
              <AutoCutRecipeReview steps={sourceCandidates} notice={recipeNotice} onChange={setSourceCandidates}
                sourceNames={Object.fromEntries(activeProject?.mediaAssets.map(asset => [asset.id, asset.filename]) ?? [])}
                onApply={() => { setUsingScenes(false); applyRecipe(sourceCandidates); }} onPreview={auditionClip} />
            </fieldset>
          )}

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
                  const allSelected = candidates.every((c) => c.selected);
                  setCandidates((prev) =>
                    prev.map((c) => ({ ...c, selected: !allSelected }))
                  );
                }}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                {candidates.every((c) => c.selected) ? 'Deselect All' : 'Select All'}
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
                    disabled={isAnalyzing || isOpening}
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
