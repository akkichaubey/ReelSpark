import { accountCache } from '@/lib/account-cache';
import { CaptionProject } from './types';
import { cleanBundledSampleProject } from './clean-sample-project';
import { createEmptyCaptionProject } from './sample-data';
import { groupTranscriptWords } from './caption-grouping';
import { validateTimeline } from '@/lib/timeline/model';

export const LOCAL_STORAGE_PROJECT_KEY = 'reel_caption_project_v2';
export const LOCAL_STORAGE_SNAPSHOTS_KEY = 'reel_project_snapshots_v1';
export const MAX_SNAPSHOTS = 10;

export interface ProjectSnapshot {
  id: string;
  timestamp: number;
  label: string;
  wordCount: number;
  duration: number;
  aspectRatio: string;
  project: CaptionProject;
}

/**
 * Save current project state to LocalStorage with timestamp.
 */
export function saveProjectToLocalStorage(project: CaptionProject): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const toSave: CaptionProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
    accountCache.setItem(LOCAL_STORAGE_PROJECT_KEY, JSON.stringify(toSave));
    return true;
  } catch (err) {
    console.warn('Failed to save project to localStorage:', err);
    return false;
  }
}

/**
 * Load project state from LocalStorage.
 */
export function loadProjectFromLocalStorage(): CaptionProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = accountCache.getItem(LOCAL_STORAGE_PROJECT_KEY);
    if (!raw) return null;
    return cleanBundledSampleProject(JSON.parse(raw));
  } catch (err) {
    console.warn('Failed to load project from localStorage:', err);
    return null;
  }
}

/**
 * Clear current project from LocalStorage.
 */
export function clearProjectFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    accountCache.removeItem(LOCAL_STORAGE_PROJECT_KEY);
  } catch {}
}

/**
 * Retrieve all saved project version snapshots.
 */
export function getProjectSnapshots(): ProjectSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = accountCache.getItem(LOCAL_STORAGE_SNAPSHOTS_KEY);
    if (!raw) return [];
    const list: ProjectSnapshot[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Failed to parse project snapshots:', err);
    return [];
  }
}

/**
 * Save a new timestamped version snapshot (keeps up to MAX_SNAPSHOTS).
 */
export function saveProjectSnapshot(
  project: CaptionProject,
  label = 'Autosave Snapshot'
): ProjectSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const snapshots = getProjectSnapshots();
    const newSnapshot: ProjectSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      label,
      wordCount: project.transcript ? project.transcript.length : 0,
      duration: project.audio?.duration ?? 0,
      aspectRatio: project.outputSettings?.aspectRatio || '9:16',
      project: JSON.parse(JSON.stringify(project)), // deep copy
    };

    // Prepend latest snapshot and trim to MAX_SNAPSHOTS
    const updated = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    accountCache.setItem(LOCAL_STORAGE_SNAPSHOTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to create project snapshot:', err);
    return getProjectSnapshots();
  }
}

/**
 * Restore a project from a snapshot ID.
 */
export function restoreProjectSnapshot(snapshotId: string): CaptionProject | null {
  const snapshots = getProjectSnapshots();
  const found = snapshots.find((s) => s.id === snapshotId);
  if (!found) return null;
  return JSON.parse(JSON.stringify(found.project));
}

/**
 * Delete a specific snapshot by ID.
 */
export function deleteProjectSnapshot(snapshotId: string): ProjectSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const snapshots = getProjectSnapshots();
    const filtered = snapshots.filter((s) => s.id !== snapshotId);
    accountCache.setItem(LOCAL_STORAGE_SNAPSHOTS_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    console.warn('Failed to delete snapshot:', err);
    return getProjectSnapshots();
  }
}

/**
 * Clear all version snapshots.
 */
export function clearAllSnapshots(): void {
  if (typeof window === 'undefined') return;
  try {
    accountCache.removeItem(LOCAL_STORAGE_SNAPSHOTS_KEY);
  } catch {}
}

/**
 * Duplicate a project with a fresh unique ID and updated timestamp.
 */
export function duplicateProject(project: CaptionProject, newTitle?: string): CaptionProject {
  const clone: CaptionProject = JSON.parse(JSON.stringify(project));
  const timestamp = Date.now();
  clone.id = `proj_${timestamp}`;
  clone.title = newTitle || `${project.title || 'Untitled'} (Copy)`;
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = new Date().toISOString();
  clone.renderedVideoPath = undefined;
  clone.renderedVideoUrl = undefined;
  clone.renderedSrtPath = undefined;
  clone.renderedSrtUrl = undefined;
  return clone;
}

/**
 * Export project as a downloadable .reelproj JSON string.
 */
export function exportProjectAsJson(project: CaptionProject): string {
  const exportPayload = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Import and validate a .reelproj JSON string.
 */
export function importProjectFromJson(jsonString: string): {
  success: boolean;
  project?: CaptionProject;
  error?: string;
} {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
    const candidate = record(parsed) && 'project' in parsed ? parsed.project : parsed;
    if (!record(candidate) || typeof candidate.id !== 'string' || !candidate.id ||
      !record(candidate.outputSettings) || !Array.isArray(candidate.transcript)) {
      return {
        success: false,
        error: 'Invalid project format. Missing id, outputSettings, or transcript words.',
      };
    }

    const validWord = (word: unknown) => record(word) && typeof word.text === 'string' &&
      typeof word.start === 'number' && Number.isFinite(word.start) &&
      typeof word.end === 'number' && Number.isFinite(word.end) && word.end >= word.start;
    if (!candidate.transcript.every(validWord)) return { success: false, error: 'Invalid transcript word timing or text.' };
    if (candidate.captionStyle != null && !record(candidate.captionStyle)) return { success: false, error: 'Invalid caption style.' };
    if (candidate.captionGroups !== undefined && (!Array.isArray(candidate.captionGroups) || !candidate.captionGroups.every(group =>
      record(group) && typeof group.start === 'number' && Number.isFinite(group.start) &&
      typeof group.end === 'number' && Number.isFinite(group.end) && group.end >= group.start &&
      Array.isArray(group.words) && group.words.every(validWord)))) {
      return { success: false, error: 'Invalid caption groups or word timing.' };
    }
    for (const key of ['image', 'audio', 'bgMusic']) {
      const asset = candidate[key];
      if (asset != null && (!record(asset) || typeof asset.fileUrl !== 'string')) return { success: false, error: `Invalid ${key} media asset.` };
    }

    // Older portable projects may omit newer settings. Fill only missing
    // defaults; keep all supplied metadata, word timing, styles and media URLs.
    const defaults = createEmptyCaptionProject();
    const source = candidate as unknown as CaptionProject;
    const importedProject: CaptionProject = {
      ...defaults,
      ...source,
      outputSettings: { ...defaults.outputSettings, ...source.outputSettings },
      captionStyle: { ...defaults.captionStyle, ...source.captionStyle },
      captionGroups: source.captionGroups ?? groupTranscriptWords(source.transcript),
      id: `proj_import_${Date.now()}`,
      title: `${source.title || 'Imported Reel'} (Imported)`,
      updatedAt: new Date().toISOString(),
    };
    if (![importedProject.outputSettings.width, importedProject.outputSettings.height, importedProject.outputSettings.fps]
      .every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      return { success: false, error: 'Invalid canvas dimensions or frame rate.' };
    }
    if (importedProject.timeline) {
      const error = validateTimeline(importedProject.timeline)[0];
      if (error) return { success: false, error };
    }

    return {
      success: true,
      project: importedProject,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to parse project file: ${err.message}`,
    };
  }
}

/**
 * Check if a crash recovery snapshot exists that is newer than current project state.
 */
export function detectCrashRecovery(currentProject: CaptionProject): {
  hasRecovery: boolean;
  recoverySnapshot?: ProjectSnapshot;
} {
  const snapshots = getProjectSnapshots();
  if (snapshots.length === 0) return { hasRecovery: false };

  const latest = snapshots[0];
  const currentUpdated = currentProject.updatedAt ? new Date(currentProject.updatedAt).getTime() : 0;

  // If latest snapshot is at least 3 seconds newer than current project state and has content
  if (latest.timestamp > currentUpdated + 3000 && latest.wordCount > 0) {
    return {
      hasRecovery: true,
      recoverySnapshot: latest,
    };
  }

  return { hasRecovery: false };
}
