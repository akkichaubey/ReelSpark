import { create } from 'zustand';
import {
  ClippingProject,
  MediaAsset,
  Clip,
  MergeRecipe,
  MergeRecipeItem,
  ExportJob,
  ExportSourceMapping,
  CreateExportJobRequest,
  MediaMetadata,
  MediaServiceHealthResponse,
  formatMsToTimestamp,
} from './contracts';
import { planMergeRecipe } from './merge-planner';
import {
  formatFilenameTemplate,
} from './export-planner';
import {
  createBlankClippingProject,
  loadProjectsLocally,
  saveProjectLocally,
  deleteProjectLocally,
  duplicateProjectLocally,
  saveCrashRecoverySnapshot,
  loadCrashRecoverySnapshot,
  clearCrashRecoverySnapshot,
} from './local-persistence';
import {
  getCloudflareStatus,
  syncProjectToCloudflare,
  loadProjectsFromCloudflare,
  getDeletedCloudProjectIds,
} from './cloudflare-sync';

export type CloudflareConfigStatus = ReturnType<typeof getCloudflareStatus>;
import { mediaServiceClient } from './media-service-client';

export type StudioTab = 'media' | 'timeline' | 'merge' | 'export';

interface ClippingStudioState {
  // Navigation & UI
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;

  // Projects
  projects: ClippingProject[];
  activeProject: ClippingProject | null;
  isLoading: boolean;
  saveStatus: 'saved' | 'saving' | 'error';
  lastSavedAt: string | null;

  // Phase 5: Undo / Redo & Crash Recovery
  undoStack: ClippingProject[];
  redoStack: ClippingProject[];
  canUndo: boolean;
  canRedo: boolean;
  hasCrashRecovery: boolean;
  undo: () => void;
  redo: () => void;
  restoreCrashRecovery: () => void;
  dismissCrashRecovery: () => void;
  syncToCloudflare: () => Promise<void>;

  // Service Status
  mediaServiceStatus: (MediaServiceHealthResponse & { source?: 'standalone' | 'internal' }) | null;
  cloudflareStatus: CloudflareConfigStatus | null;
  isCheckingHealth: boolean;

  // Media & Timeline Editing State (Phase 2)
  selectedAssetId: string | null;
  selectedClipId: string | null;
  selectedRecipeId: string | null;
  currentTimeMs: number;
  inPointMs: number;
  outPointMs: number;
  isPlaying: boolean;
  zoomLevel: number; // 1 to 5

  // Audition & Playback Coordination
  auditioningClipId: string | null;
  auditionRange: { startMs: number; endMs: number } | null;
  playbackCommand: {
    id: number;
    action: 'play' | 'pause' | 'audition_clip' | 'audition_range';
    startMs?: number;
    endMs?: number;
    clipId?: string;
  } | null;
  auditionClip: (clip: Clip) => void;
  auditionRangeAction: (startMs: number, endMs: number, clipId?: string) => void;
  startPlayback: () => void;
  stopPlayback: () => void;

  // Project Actions
  initializeStore: () => Promise<void>;
  checkServices: () => Promise<void>;
  createProject: (name: string, description?: string) => ClippingProject;
  selectProject: (projectId: string) => void;
  updateActiveProject: (updater: (prev: ClippingProject) => ClippingProject) => void;
  saveActiveProject: () => void;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => ClippingProject | null;
  renameProject: (projectId: string, newName: string) => void;

  // Media Asset Actions (Phase 2)
  addMediaAsset: (asset: MediaAsset) => void;
  removeMediaAsset: (assetId: string) => void;
  relinkMediaAsset: (assetId: string, newPath: string, newSize: number, newDurationMs: number) => void;
  selectAsset: (assetId: string) => void;

  // Playback & Timeline Controls (Phase 2)
  setCurrentTimeMs: (ms: number) => void;
  setInPoint: (ms?: number) => void;
  setOutPoint: (ms?: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoomLevel: (zoom: number) => void;

  // Clip Actions (Phase 2)
  createClipFromRange: (name?: string, notes?: string) => Clip | null;
  createClipsBulk: (items: { name: string; startMs: number; endMs: number; durationMs: number }[]) => Clip[];
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => Clip | null;
  selectClip: (clipId: string | null) => void;

  // Merge Recipe Actions (Phase 3)
  selectRecipe: (recipeId: string | null) => void;
  createRecipe: (name?: string, description?: string) => MergeRecipe;
  updateRecipe: (recipeId: string, updates: Partial<MergeRecipe>) => void;
  deleteRecipe: (recipeId: string) => void;
  duplicateRecipe: (recipeId: string) => MergeRecipe | null;
  addClipToRecipe: (recipeId: string, clipId: string) => void;
  removeClipFromRecipe: (recipeId: string, itemId: string) => void;
  moveRecipeItem: (recipeId: string, itemIndex: number, direction: 'up' | 'down') => void;
  reverseRecipeItems: (recipeId: string) => void;

  // Export Queue & Job Actions (Phase 4)
  selectedExportJobId: string | null;
  selectExportJob: (jobId: string | null) => void;
  submitClipExport: (clipId: string, options?: Partial<CreateExportJobRequest>) => Promise<ExportJob | null>;
  submitBatchClipsExport: (clipIds: string[], options?: Partial<CreateExportJobRequest>) => Promise<ExportJob[]>;
  submitRecipeExport: (recipeId: string, options?: Partial<CreateExportJobRequest>) => Promise<ExportJob | null>;
  cancelExportJob: (jobId: string) => Promise<boolean>;
  retryExportJob: (jobId: string) => Promise<boolean>;
  deleteExportJob: (jobId: string) => void;
  syncExportJobs: () => Promise<void>;
}

export const useClippingStore = create<ClippingStudioState>((set, get) => ({
  activeTab: 'media',
  setActiveTab: (tab) => set({ activeTab: tab }),

  projects: [],
  activeProject: null,
  isLoading: true,
  saveStatus: 'saved',
  lastSavedAt: null,

  mediaServiceStatus: null,
  cloudflareStatus: null,
  isCheckingHealth: false,

  // Phase 2 State
  selectedAssetId: null,
  selectedClipId: null,
  selectedRecipeId: null,
  currentTimeMs: 0,
  inPointMs: 0,
  outPointMs: 60000,
  isPlaying: false,
  zoomLevel: 1,

  auditioningClipId: null,
  auditionRange: null,
  playbackCommand: null,

  // Phase 4 State
  selectedExportJobId: null,
  selectExportJob: (jobId) => set({ selectedExportJobId: jobId }),

  // Phase 5 State
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  hasCrashRecovery: false,

  initializeStore: async () => {
    set({ isLoading: true });

    // 1. Check services
    const cloudflare = getCloudflareStatus();
    set({ cloudflareStatus: cloudflare });

    // 2. Load local projects
    const rawLocalProjects = loadProjectsLocally();
    // Never delete a user's project automatically based on its display name.
    const localProjects: ClippingProject[] = [...rawLocalProjects];

    try {
      const cloudProjects = await loadProjectsFromCloudflare();
      const deletedCloudIds = getDeletedCloudProjectIds();
      for (let index = localProjects.length - 1; index >= 0; index--) {
        if (deletedCloudIds.has(localProjects[index].id)) {
          deleteProjectLocally(localProjects[index].id);
          clearCrashRecoverySnapshot(localProjects[index].id);
          localProjects.splice(index, 1);
        }
      }
      for (const remote of cloudProjects) {
        const index = localProjects.findIndex(project => project.id === remote.id);
        if (index < 0) localProjects.push(remote);
        else if (Date.parse(remote.updatedAt) > Date.parse(localProjects[index].updatedAt)) localProjects[index] = remote;
      }
      set({ cloudflareStatus: getCloudflareStatus() });
    } catch (error) {
      console.warn('Cloud project metadata unavailable; retaining local cache.', error);
    }

    const currentActive = localProjects[0] || null;
    const firstAssetId = currentActive?.mediaAssets[0]?.id || null;
    const initialDuration = currentActive?.mediaAssets[0]?.metadata?.durationMs || 60000;

    set({
      projects: localProjects,
      activeProject: currentActive,
      selectedAssetId: firstAssetId,
      outPointMs: initialDuration,
      activeTab: 'media',
      isLoading: false,
    });

    // 3. Health check
    await get().checkServices();
  },

  checkServices: async () => {
    set({ isCheckingHealth: true });
    try {
      const health = await mediaServiceClient.checkHealth();
      set({ mediaServiceStatus: health, isCheckingHealth: false });
    } catch (err) {
      console.warn('[Clipping Store] Media service offline:', err);
      set({
        mediaServiceStatus: {
          status: 'ok',
          service: 'reelspark-media-service',
          version: '1.0.0',
          host: '127.0.0.1',
          port: 4000,
          uptimeSeconds: 0,
          ffmpeg: { available: false, path: 'ffmpeg', error: 'Service offline' },
          ffprobe: { available: false, path: 'ffprobe', error: 'Service offline' },
          source: 'standalone',
        },
        isCheckingHealth: false,
      });
    }
  },

  createProject: (name: string, description?: string) => {
    const newProj = createBlankClippingProject(name, description);
    saveProjectLocally(newProj);
    set((state) => ({
      projects: [newProj, ...state.projects],
      activeProject: newProj,
      selectedAssetId: null,
      selectedClipId: null,
      currentTimeMs: 0,
      inPointMs: 0,
      outPointMs: 60000,
      activeTab: 'media',
    }));
    return newProj;
  },

  selectProject: (projectId: string) => {
    const proj = get().projects.find((p) => p.id === projectId);
    if (proj) {
      const asset = proj.mediaAssets[0] || null;
      const recovery = loadCrashRecoverySnapshot(proj.id);
      const hasCrash = Boolean(recovery && recovery.snapshot && recovery.savedAt > proj.updatedAt);
      set({
        activeProject: proj,
        selectedAssetId: asset?.id || null,
        selectedClipId: null,
        currentTimeMs: 0,
        inPointMs: 0,
        outPointMs: asset?.metadata?.durationMs || 60000,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        hasCrashRecovery: hasCrash,
        activeTab: 'media',
      });
    }
  },

  updateActiveProject: (updater) => {
    const current = get().activeProject;
    if (!current) return;
    const updated = updater(current);

    const newUndoStack = [current, ...get().undoStack].slice(0, 30);

    saveProjectLocally(updated);
    saveCrashRecoverySnapshot(updated);

    set((state) => ({
      activeProject: updated,
      projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      undoStack: newUndoStack,
      redoStack: [],
      canUndo: true,
      canRedo: false,
      saveStatus: 'saved',
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  },

  undo: () => {
    const { activeProject, undoStack, redoStack } = get();
    if (!activeProject || undoStack.length === 0) return;

    const [previous, ...restUndo] = undoStack;
    const newRedoStack = [activeProject, ...redoStack].slice(0, 30);

    saveProjectLocally(previous);
    saveCrashRecoverySnapshot(previous);

    set((state) => ({
      activeProject: previous,
      projects: state.projects.map((p) => (p.id === previous.id ? previous : p)),
      undoStack: restUndo,
      redoStack: newRedoStack,
      canUndo: restUndo.length > 0,
      canRedo: true,
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  },

  redo: () => {
    const { activeProject, undoStack, redoStack } = get();
    if (!activeProject || redoStack.length === 0) return;

    const [next, ...restRedo] = redoStack;
    const newUndoStack = [activeProject, ...undoStack].slice(0, 30);

    saveProjectLocally(next);
    saveCrashRecoverySnapshot(next);

    set((state) => ({
      activeProject: next,
      projects: state.projects.map((p) => (p.id === next.id ? next : p)),
      undoStack: newUndoStack,
      redoStack: restRedo,
      canUndo: true,
      canRedo: restRedo.length > 0,
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  },

  restoreCrashRecovery: () => {
    const { activeProject } = get();
    if (!activeProject) return;
    const recovery = loadCrashRecoverySnapshot(activeProject.id);
    if (recovery && recovery.snapshot) {
      saveProjectLocally(recovery.snapshot);
      clearCrashRecoverySnapshot(activeProject.id);
      set((state) => ({
        activeProject: recovery.snapshot,
        projects: state.projects.map((p) => (p.id === recovery.snapshot.id ? recovery.snapshot : p)),
        hasCrashRecovery: false,
        lastSavedAt: new Date().toLocaleTimeString(),
      }));
    }
  },

  dismissCrashRecovery: () => {
    const { activeProject } = get();
    if (activeProject) {
      clearCrashRecoverySnapshot(activeProject.id);
    }
    set({ hasCrashRecovery: false });
  },

  syncToCloudflare: async () => {
    const { activeProject } = get();
    if (!activeProject) return;
    set({ saveStatus: 'saving' });
    const res = await syncProjectToCloudflare(activeProject);
    set({
      saveStatus: res.success ? 'saved' : 'error',
      lastSavedAt: new Date().toLocaleTimeString(),
    });
  },

  saveActiveProject: () => {
    const current = get().activeProject;
    if (!current) return;
    set({ saveStatus: 'saving' });
    const success = saveProjectLocally(current);
    set({
      saveStatus: success ? 'saved' : 'error',
      lastSavedAt: new Date().toLocaleTimeString(),
    });
  },

  deleteProject: async (projectId: string) => {
    try {
      const response = await fetch(`/api/clipping-studio/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) { set({ saveStatus: 'error' }); return; }
    } catch { set({ saveStatus: 'error' }); return; }
    deleteProjectLocally(projectId);
    clearCrashRecoverySnapshot(projectId);
    set((state) => {
      const remaining = state.projects.filter((p) => p.id !== projectId);
      const nextActive = state.activeProject?.id === projectId ? remaining[0] || null : state.activeProject;
      return {
        projects: remaining,
        activeProject: nextActive,
        selectedAssetId: nextActive?.mediaAssets[0]?.id || null,
        selectedClipId: null,
        activeTab: 'media',
      };
    });
  },

  duplicateProject: (projectId: string) => {
    const copy = duplicateProjectLocally(projectId);
    if (copy) {
      set((state) => ({
        projects: [copy, ...state.projects],
        activeProject: copy,
        selectedAssetId: copy.mediaAssets[0]?.id || null,
      }));
    }
    return copy;
  },

  renameProject: (projectId: string, newName: string) => {
    const proj = get().projects.find((p) => p.id === projectId);
    if (!proj) return;
    const updated = { ...proj, name: newName, updatedAt: new Date().toISOString() };
    saveProjectLocally(updated);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
      activeProject: state.activeProject?.id === projectId ? updated : state.activeProject,
    }));
  },

  // ---------------------------------------------------------------------------
  // Media Asset Actions
  // ---------------------------------------------------------------------------
  addMediaAsset: (asset: MediaAsset) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mediaAssets: [asset, ...prev.mediaAssets],
    }));

    set({
      selectedAssetId: asset.id,
      currentTimeMs: 0,
      inPointMs: 0,
      outPointMs: asset.metadata.durationMs,
    });
  },

  removeMediaAsset: (assetId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mediaAssets: prev.mediaAssets.filter((a) => a.id !== assetId),
      clips: prev.clips.filter((c) => c.mediaAssetId !== assetId),
    }));

    const current = get().activeProject;
    const remainingAsset = current?.mediaAssets.find((a) => a.id !== assetId) || null;
    set({
      selectedAssetId: remainingAsset?.id || null,
      currentTimeMs: 0,
      inPointMs: 0,
      outPointMs: remainingAsset?.metadata?.durationMs || 60000,
    });
  },

  relinkMediaAsset: (assetId: string, newPath: string, newSize: number, newDurationMs: number) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mediaAssets: prev.mediaAssets.map((a) => {
        if (a.id !== assetId) return a;
        return {
          ...a,
          localPath: newPath,
          fileSizeBytes: newSize,
          metadata: {
            ...a.metadata,
            durationMs: newDurationMs,
            durationSeconds: Math.round(newDurationMs / 1000),
            sizeBytes: newSize,
          },
        };
      }),
    }));
  },

  selectAsset: (assetId: string) => {
    const asset = get().activeProject?.mediaAssets.find((a) => a.id === assetId);
    if (asset) {
      set({
        selectedAssetId: assetId,
        currentTimeMs: 0,
        inPointMs: 0,
        outPointMs: asset.metadata.durationMs,
      });
    }
  },

  // ---------------------------------------------------------------------------
  // Playback & Timeline Controls
  // ---------------------------------------------------------------------------
  setCurrentTimeMs: (ms: number) => {
    const asset = get().activeProject?.mediaAssets.find((a) => a.id === get().selectedAssetId);
    const max = asset?.metadata?.durationMs || Infinity;
    const clamped = Math.max(0, Math.min(ms, max));
    set({ currentTimeMs: clamped });
  },

  setInPoint: (ms?: number) => {
    const targetMs = ms !== undefined ? ms : get().currentTimeMs;
    const outMs = get().outPointMs;
    // Guarantee In < Out
    if (targetMs < outMs) {
      set({ inPointMs: Math.max(0, targetMs) });
    } else {
      set({ inPointMs: Math.max(0, targetMs), outPointMs: targetMs + 1000 });
    }
  },

  setOutPoint: (ms?: number) => {
    const targetMs = ms !== undefined ? ms : get().currentTimeMs;
    const inMs = get().inPointMs;
    // Guarantee Out > In
    if (targetMs > inMs) {
      set({ outPointMs: targetMs });
    } else {
      set({ outPointMs: inMs + 1000 });
    }
  },

  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setZoomLevel: (zoom: number) => set({ zoomLevel: Math.max(1, Math.min(zoom, 5)) }),

  auditionClip: (clip: Clip) => {
    const state = get();
    // Toggle: if this clip is already playing, pause it
    if (state.auditioningClipId === clip.id && state.isPlaying) {
      set({
        isPlaying: false,
        auditioningClipId: null,
        auditionRange: null,
        playbackCommand: { id: Date.now(), action: 'pause' },
      });
      return;
    }

    // Switch media asset if this clip is from another asset
    if (state.selectedAssetId !== clip.mediaAssetId) {
      set({ selectedAssetId: clip.mediaAssetId });
    }

    set({
      selectedClipId: clip.id,
      inPointMs: clip.startMs,
      outPointMs: clip.endMs,
      currentTimeMs: clip.startMs,
      auditioningClipId: clip.id,
      auditionRange: { startMs: clip.startMs, endMs: clip.endMs },
      isPlaying: true,
      playbackCommand: {
        id: Date.now(),
        action: 'audition_clip',
        startMs: clip.startMs,
        endMs: clip.endMs,
        clipId: clip.id,
      },
    });
  },

  auditionRangeAction: (startMs: number, endMs: number, clipId?: string) => {
    const state = get();
    // Toggle: if this exact range is already playing, pause it
    if (
      state.isPlaying &&
      state.auditionRange &&
      state.auditionRange.startMs === startMs &&
      state.auditionRange.endMs === endMs
    ) {
      set({
        isPlaying: false,
        auditioningClipId: null,
        auditionRange: null,
        playbackCommand: { id: Date.now(), action: 'pause' },
      });
      return;
    }

    set({
      inPointMs: startMs,
      outPointMs: endMs,
      currentTimeMs: startMs,
      auditioningClipId: clipId || null,
      auditionRange: { startMs, endMs },
      isPlaying: true,
      playbackCommand: {
        id: Date.now(),
        action: 'audition_range',
        startMs,
        endMs,
        clipId,
      },
    });
  },

  startPlayback: () => {
    set({
      isPlaying: true,
      playbackCommand: { id: Date.now(), action: 'play' },
    });
  },

  stopPlayback: () => {
    set({
      isPlaying: false,
      auditioningClipId: null,
      auditionRange: null,
      playbackCommand: { id: Date.now(), action: 'pause' },
    });
  },

  // ---------------------------------------------------------------------------
  // Clip Actions
  // ---------------------------------------------------------------------------
  createClipFromRange: (name?: string, notes?: string) => {
    const project = get().activeProject;
    const assetId = get().selectedAssetId;
    if (!project || !assetId) return null;

    const inMs = get().inPointMs;
    const outMs = get().outPointMs;
    if (inMs >= outMs) return null;

    const now = new Date().toISOString();
    const clipId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const clipName = name?.trim() || `Clip ${project.clips.length + 1}`;

    const newClip: Clip = {
      id: clipId,
      projectId: project.id,
      mediaAssetId: assetId,
      name: clipName,
      startMs: inMs,
      endMs: outMs,
      durationMs: outMs - inMs,
      orderIndex: project.clips.length,
      notes: notes || '',
      createdAt: now,
      updatedAt: now,
    };

    get().updateActiveProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));

    set({ selectedClipId: newClip.id });
    return newClip;
  },

  createClipsBulk: (items) => {
    const project = get().activeProject;
    const assetId = get().selectedAssetId;
    if (!project || !assetId || items.length === 0) return [];

    const now = new Date().toISOString();
    let nextIndex = project.clips.length;

    const createdClips: Clip[] = items.map((item) => {
      const clipId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        id: clipId,
        projectId: project.id,
        mediaAssetId: assetId,
        name: item.name,
        startMs: item.startMs,
        endMs: item.endMs,
        durationMs: item.durationMs,
        orderIndex: nextIndex++,
        notes: '',
        createdAt: now,
        updatedAt: now,
      };
    });

    get().updateActiveProject((prev) => ({
      ...prev,
      clips: [...prev.clips, ...createdClips],
    }));

    if (createdClips.length > 0) {
      set({ selectedClipId: createdClips[0].id });
    }

    return createdClips;
  },

  updateClip: (clipId: string, updates: Partial<Clip>) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        if (c.id !== clipId) return c;
        const updated = { ...c, ...updates, updatedAt: new Date().toISOString() };
        if (updates.startMs !== undefined || updates.endMs !== undefined) {
          updated.durationMs = updated.endMs - updated.startMs;
        }
        return updated;
      }),
    }));
  },

  deleteClip: (clipId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== clipId),
    }));
    if (get().selectedClipId === clipId) {
      set({ selectedClipId: null });
    }
  },

  duplicateClip: (clipId: string) => {
    const project = get().activeProject;
    const original = project?.clips.find((c) => c.id === clipId);
    if (!project || !original) return null;

    const now = new Date().toISOString();
    const newClip: Clip = {
      ...original,
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${original.name} (Copy)`,
      orderIndex: project.clips.length,
      createdAt: now,
      updatedAt: now,
    };

    get().updateActiveProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));

    return newClip;
  },

  selectClip: (clipId: string | null) => {
    set({ selectedClipId: clipId });
    if (clipId) {
      const clip = get().activeProject?.clips.find((c) => c.id === clipId);
      if (clip) {
        set({
          inPointMs: clip.startMs,
          outPointMs: clip.endMs,
          currentTimeMs: clip.startMs,
        });
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Merge Recipe Actions (Phase 3)
  // ---------------------------------------------------------------------------
  selectRecipe: (recipeId: string | null) => {
    set({ selectedRecipeId: recipeId });
  },

  createRecipe: (name?: string, description?: string) => {
    const project = get().activeProject;
    const now = new Date().toISOString();
    const recipeId = `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const recipeName = name?.trim() || `Recipe ${project ? project.mergeRecipes.length + 1 : 1}`;

    const newRecipe: MergeRecipe = {
      id: recipeId,
      projectId: project ? project.id : '',
      name: recipeName,
      description: description || '',
      items: [],
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: true,
      createdAt: now,
      updatedAt: now,
    };

    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: [...prev.mergeRecipes, newRecipe],
    }));

    set({ selectedRecipeId: newRecipe.id });
    return newRecipe;
  },

  updateRecipe: (recipeId: string, updates: Partial<MergeRecipe>) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.map((r) => {
        if (r.id !== recipeId) return r;
        return {
          ...r,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  deleteRecipe: (recipeId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.filter((r) => r.id !== recipeId),
    }));

    if (get().selectedRecipeId === recipeId) {
      const remaining = get().activeProject?.mergeRecipes.filter((r) => r.id !== recipeId) || [];
      set({ selectedRecipeId: remaining[0]?.id || null });
    }
  },

  duplicateRecipe: (recipeId: string) => {
    const project = get().activeProject;
    const original = project?.mergeRecipes.find((r) => r.id === recipeId);
    if (!project || !original) return null;

    const now = new Date().toISOString();
    const newRecipeId = `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const duplicated: MergeRecipe = {
      ...original,
      id: newRecipeId,
      name: `${original.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      items: original.items.map((item) => ({
        ...item,
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        recipeId: newRecipeId,
      })),
    };

    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: [...prev.mergeRecipes, duplicated],
    }));

    set({ selectedRecipeId: duplicated.id });
    return duplicated;
  },

  addClipToRecipe: (recipeId: string, clipId: string) => {
    const project = get().activeProject;
    const clip = project?.clips.find((c) => c.id === clipId);
    if (!project || !clip) return;

    const itemId = `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.map((r) => {
        if (r.id !== recipeId) return r;
        const newItem: MergeRecipeItem = {
          id: itemId,
          recipeId,
          clipId,
          orderIndex: r.items.length,
          transition: 'none',
        };
        return {
          ...r,
          items: [...r.items, newItem],
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  removeClipFromRecipe: (recipeId: string, itemId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.map((r) => {
        if (r.id !== recipeId) return r;
        const filtered = r.items.filter((item) => item.id !== itemId);
        // Re-index remaining items sequentially
        const reindexed = filtered.map((item, idx) => ({ ...item, orderIndex: idx }));
        return {
          ...r,
          items: reindexed,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  moveRecipeItem: (recipeId: string, itemIndex: number, direction: 'up' | 'down') => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.map((r) => {
        if (r.id !== recipeId) return r;
        const items = [...r.items].sort((a, b) => a.orderIndex - b.orderIndex);
        const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;

        if (targetIndex < 0 || targetIndex >= items.length) return r;

        // Swap items
        const temp = items[itemIndex];
        items[itemIndex] = items[targetIndex];
        items[targetIndex] = temp;

        const reindexed = items.map((item, idx) => ({ ...item, orderIndex: idx }));
        return {
          ...r,
          items: reindexed,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  reverseRecipeItems: (recipeId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      mergeRecipes: prev.mergeRecipes.map((r) => {
        if (r.id !== recipeId) return r;
        const reversed = [...r.items].reverse().map((item, idx) => ({
          ...item,
          orderIndex: idx,
        }));
        return {
          ...r,
          items: reversed,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  // Export Queue Actions (Phase 4)
  submitClipExport: async (clipId: string, options = {}) => {
    const { activeProject } = get();
    if (!activeProject) return null;

    const clip = activeProject.clips.find((c) => c.id === clipId);
    if (!clip) return null;

    const mediaAsset = activeProject.mediaAssets.find((a) => a.id === clip.mediaAssetId);
    if (!mediaAsset) return null;

    const outputFormat = options.outputFormat || 'mp4';
    const outputType = options.outputType || 'video_and_audio';
    const qualityProfile = options.qualityProfile || 'high';
    const targetResolution = options.targetResolution || 'source';
    const normalizeAudio = options.normalizeAudio ?? false;

    const outDir = options.outputDir || `storage/clipping-studio/projects/${activeProject.id}/exports`;
    const baseName = formatFilenameTemplate(options.filenameTemplate || '{project}_{name}_{index}', {
      project: activeProject.name,
      name: clip.name,
      index: clip.orderIndex + 1,
      time: formatMsToTimestamp(clip.startMs, false),
      res: targetResolution !== 'source' ? targetResolution : undefined,
    });

    const outputPath = `${outDir}/${baseName}.${outputFormat}`;

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const sourceMapping: ExportSourceMapping = {
      id: `src_${Date.now()}_0`,
      exportJobId: jobId,
      clipId: clip.id,
      sourceAssetId: mediaAsset.id,
      startMs: clip.startMs,
      endMs: clip.endMs,
      sequenceIndex: 0,
    };

    const newJob: ExportJob = {
      id: jobId,
      projectId: activeProject.id,
      jobType: 'single_clip',
      targetId: clip.id,
      status: 'queued',
      progressPercent: 0,
      outputPath,
      outputSettings: {
        outputFormat,
        outputType,
        qualityProfile,
        targetResolution,
        normalizeAudio,
      },
      sourceMappings: [sourceMapping],
      createdAt: new Date().toISOString(),
    };

    // Save job into active project
    get().updateActiveProject((prev) => ({
      ...prev,
      exportJobs: [newJob, ...prev.exportJobs],
    }));

    // Trigger local media service
    try {
      const response = await fetch('/api/clipping-studio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          projectId: activeProject.id,
          jobType: 'single_clip',
          targetId: clip.id,
          sources: [{ localPath: mediaAsset.localPath, startMs: clip.startMs, endMs: clip.endMs, clipId: clip.id, sourceAssetId: mediaAsset.id }],
          filename: baseName,
          outputSettings: newJob.outputSettings,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Export rejected');
      Object.assign(newJob, result.job);
      get().updateActiveProject(prev => ({ ...prev, exportJobs: prev.exportJobs.map(job => job.id === jobId ? { ...job, ...result.job } : job) }));
    } catch (err) {
      get().updateActiveProject(prev => ({ ...prev, exportJobs: prev.exportJobs.map(job => job.id === jobId ? { ...job, status: 'failed', errorMessage: err instanceof Error ? err.message : 'Export failed' } : job) }));
      Object.assign(newJob, { status: 'failed', errorMessage: err instanceof Error ? err.message : 'Export failed' });
      console.warn('Failed to dispatch export job to API:', err);
    }

    return newJob;
  },

  submitBatchClipsExport: async (clipIds: string[], options = {}) => {
    const jobs: ExportJob[] = [];
    for (const clipId of clipIds) {
      const job = await get().submitClipExport(clipId, options);
      if (job) jobs.push(job);
    }
    return jobs;
  },

  submitRecipeExport: async (recipeId: string, options = {}) => {
    const { activeProject } = get();
    if (!activeProject) return null;

    const recipe = activeProject.mergeRecipes.find((r) => r.id === recipeId);
    if (!recipe || recipe.items.length === 0) return null;

    const plan = planMergeRecipe(recipe, activeProject.clips, activeProject.mediaAssets);
    if (!plan.isValid) return null;

    const outputFormat = options.outputFormat || recipe.outputFormat || 'mp4';
    const outDir = options.outputDir || `storage/clipping-studio/projects/${activeProject.id}/exports`;
    const baseName = formatFilenameTemplate(options.filenameTemplate || '{project}_{name}_merged', {
      project: activeProject.name,
      name: recipe.name,
      index: 1,
      time: formatMsToTimestamp(plan.totalDurationMs, false),
    });

    const outputPath = `${outDir}/${baseName}.${outputFormat}`;

    const jobId = `job_recipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const sourceMappings: ExportSourceMapping[] = plan.items.map((resolved, idx) => ({
      id: `src_${Date.now()}_${idx}`,
      exportJobId: jobId,
      clipId: resolved.clip.id,
      sourceAssetId: resolved.mediaAsset.id,
      startMs: resolved.clip.startMs,
      endMs: resolved.clip.endMs,
      sequenceIndex: idx,
    }));

    const newJob: ExportJob = {
      id: jobId,
      projectId: activeProject.id,
      jobType: 'merge_recipe',
      targetId: recipe.id,
      status: 'queued',
      progressPercent: 0,
      outputPath,
      outputSettings: {
        outputFormat,
        normalizeAudio: recipe.normalizeAudio,
        targetResolution: recipe.targetResolution,
      },
      sourceMappings,
      createdAt: new Date().toISOString(),
    };

    get().updateActiveProject((prev) => ({
      ...prev,
      exportJobs: [newJob, ...prev.exportJobs],
    }));

    try {
      const response = await fetch('/api/clipping-studio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          projectId: activeProject.id,
          jobType: 'merge_recipe',
          targetId: recipe.id,
          sources: plan.items.map(item => ({ localPath: item.mediaAsset.localPath, startMs: item.clip.startMs, endMs: item.clip.endMs, clipId: item.clip.id, sourceAssetId: item.mediaAsset.id, transition: item.item.transition })),
          filename: baseName,
          outputSettings: newJob.outputSettings,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Export rejected');
      Object.assign(newJob, result.job);
      get().updateActiveProject(prev => ({ ...prev, exportJobs: prev.exportJobs.map(job => job.id === jobId ? { ...job, ...result.job } : job) }));
    } catch (err) {
      get().updateActiveProject(prev => ({ ...prev, exportJobs: prev.exportJobs.map(job => job.id === jobId ? { ...job, status: 'failed', errorMessage: err instanceof Error ? err.message : 'Export failed' } : job) }));
      Object.assign(newJob, { status: 'failed', errorMessage: err instanceof Error ? err.message : 'Export failed' });
      console.warn('Failed to dispatch recipe export to API:', err);
    }

    return newJob;
  },

  cancelExportJob: async (jobId: string) => {
    try {
      const response = await fetch(`/api/clipping-studio/export/${jobId}?action=cancel`, { method: 'POST' });
      if (!response.ok || !(await response.json()).success) return false;
    } catch { return false; }

    get().updateActiveProject((prev) => ({
      ...prev,
      exportJobs: prev.exportJobs.map((j) => (j.id === jobId ? { ...j, status: 'cancelled' } : j)),
    }));
    return true;
  },

  retryExportJob: async (jobId: string) => {
    try {
      const response = await fetch(`/api/clipping-studio/export/${jobId}?action=retry`, { method: 'POST' });
      if (!response.ok || !(await response.json()).success) return false;
    } catch { return false; }

    get().updateActiveProject((prev) => ({
      ...prev,
      exportJobs: prev.exportJobs.map((j) => (j.id === jobId ? { ...j, status: 'queued', progressPercent: 0 } : j)),
    }));
    return true;
  },

  deleteExportJob: (jobId: string) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      exportJobs: prev.exportJobs.filter((j) => j.id !== jobId),
    }));
  },

  syncExportJobs: async () => {
    try {
      const res = await fetch('/api/clipping-studio/export');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          get().updateActiveProject((prev) => {
            const updatedJobs = prev.exportJobs.map((localJob) => {
              const remote = data.jobs.find((r: any) => r.id === localJob.id);
              if (!remote) return localJob;
              return {
                ...localJob,
                status: remote.status,
                outputPath: remote.outputPath ?? localJob.outputPath,
                progressPercent: remote.progressPercent ?? localJob.progressPercent,
                errorMessage: remote.errorMessage ?? localJob.errorMessage,
                completedAt: remote.completedAt ?? localJob.completedAt,
              };
            });
            return { ...prev, exportJobs: updatedJobs };
          });
        }
      }
    } catch {}
  },
}));
