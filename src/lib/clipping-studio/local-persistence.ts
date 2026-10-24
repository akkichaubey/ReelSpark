import { accountCache } from '@/lib/account-cache';
import {
  ClippingProject,
  ClippingProjectSchema,
} from './contracts';

const STORAGE_KEY_PREFIX = 'reelspark_clipping_project_';
const INDEX_KEY = 'reelspark_clipping_projects_index';

/**
 * Creates a new blank project with stable ID and timestamps
 */
export function createBlankClippingProject(name: string, description?: string): ClippingProject {
  const now = new Date().toISOString();
  const id = `clip_proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: name.trim() || 'Untitled Clipping Project',
    description: description || '',
    mediaAssets: [],
    clips: [],
    mergeRecipes: [],
    exportJobs: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Saves project locally. Works in browser accountCache.
 */
export function saveProjectLocally(project: ClippingProject): boolean {
  if (typeof window === 'undefined') return false;

  const validation = ClippingProjectSchema.safeParse(project);
  if (!validation.success) {
    console.warn('[Clipping Persistence] Invalid project model:', validation.error);
  }

  const updatedProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  try {
    // Save project data
    accountCache.setItem(
      `${STORAGE_KEY_PREFIX}${project.id}`,
      JSON.stringify(updatedProject)
    );

    // Update index
    const index = loadProjectIndex();
    if (!index.includes(project.id)) {
      index.unshift(project.id);
      saveProjectIndex(index);
    }
    return true;
  } catch (err) {
    console.error('[Clipping Persistence] Failed to save project locally:', err);
    return false;
  }
}

/**
 * Loads project index array of IDs
 */
export function loadProjectIndex(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = accountCache.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjectIndex(index: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    accountCache.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.error('[Clipping Persistence] Failed to save project index:', err);
  }
}

/**
 * Loads all projects stored locally
 */
export function loadProjectsLocally(): ClippingProject[] {
  if (typeof window === 'undefined') return [];

  const index = loadProjectIndex();
  const projects: ClippingProject[] = [];

  for (const id of index) {
    const proj = loadProjectByIdLocally(id);
    if (proj) {
      projects.push(proj);
    }
  }

  return projects;
}

/**
 * Loads a single project by ID
 */
export function loadProjectByIdLocally(id: string): ClippingProject | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = accountCache.getItem(`${STORAGE_KEY_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as ClippingProject;
  } catch (err) {
    console.error(`[Clipping Persistence] Failed to load project ${id}:`, err);
    return null;
  }
}

/**
 * Deletes a project locally
 */
export function deleteProjectLocally(id: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    accountCache.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
    const index = loadProjectIndex().filter((item) => item !== id);
    saveProjectIndex(index);
    return true;
  } catch (err) {
    console.error(`[Clipping Persistence] Failed to delete project ${id}:`, err);
    return false;
  }
}

/**
 * Duplicates a project with a new ID and timestamps
 */
export function duplicateProjectLocally(id: string, newName?: string): ClippingProject | null {
  const original = loadProjectByIdLocally(id);
  if (!original) return null;

  const now = new Date().toISOString();
  const newId = `clip_proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const duplicated: ClippingProject = {
    ...original,
    id: newId,
    name: newName || `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    // Regenerate IDs for clips and recipes to maintain integrity
    clips: original.clips.map((c) => ({
      ...c,
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: newId,
    })),
    mergeRecipes: original.mergeRecipes.map((r) => ({
      ...r,
      id: `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: newId,
    })),
    exportJobs: [], // Reset export jobs for new copy
  };

  saveProjectLocally(duplicated);
  return duplicated;
}

const CRASH_KEY_PREFIX = 'reelspark_clipping_crash_snapshot_';

/**
 * Saves a crash recovery snapshot in case of unexpected refresh or crash
 */
export function saveCrashRecoverySnapshot(project: ClippingProject): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      snapshot: project,
      savedAt: new Date().toISOString(),
    };
    accountCache.setItem(`${CRASH_KEY_PREFIX}${project.id}`, JSON.stringify(payload));
  } catch (err) {
    // Non-fatal if localStorage is full
  }
}

/**
 * Loads crash recovery snapshot if available and newer than saved project
 */
export function loadCrashRecoverySnapshot(projectId: string): { snapshot: ClippingProject; savedAt: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = accountCache.getItem(`${CRASH_KEY_PREFIX}${projectId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clears crash recovery snapshot
 */
export function clearCrashRecoverySnapshot(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    accountCache.removeItem(`${CRASH_KEY_PREFIX}${projectId}`);
  } catch {}
}

/**
 * Checks if a crash recovery snapshot exists
 */
export function checkHasCrashRecoverySnapshot(projectId: string): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(accountCache.getItem(`${CRASH_KEY_PREFIX}${projectId}`));
}
