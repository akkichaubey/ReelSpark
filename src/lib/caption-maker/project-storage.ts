import { CaptionProject } from './types';

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
    window.localStorage.setItem(LOCAL_STORAGE_PROJECT_KEY, JSON.stringify(toSave));
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
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
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
    window.localStorage.removeItem(LOCAL_STORAGE_PROJECT_KEY);
  } catch {}
}

/**
 * Retrieve all saved project version snapshots.
 */
export function getProjectSnapshots(): ProjectSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_SNAPSHOTS_KEY);
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
    window.localStorage.setItem(LOCAL_STORAGE_SNAPSHOTS_KEY, JSON.stringify(updated));
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
    window.localStorage.setItem(LOCAL_STORAGE_SNAPSHOTS_KEY, JSON.stringify(filtered));
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
    window.localStorage.removeItem(LOCAL_STORAGE_SNAPSHOTS_KEY);
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
    const parsed = JSON.parse(jsonString);
    const candidate: CaptionProject = parsed.project || parsed;

    if (!candidate.id || !candidate.outputSettings || !Array.isArray(candidate.transcript)) {
      return {
        success: false,
        error: 'Invalid project format. Missing id, outputSettings, or transcript words.',
      };
    }

    const importedProject: CaptionProject = {
      ...candidate,
      id: `proj_import_${Date.now()}`,
      title: `${candidate.title || 'Imported Reel'} (Imported)`,
      updatedAt: new Date().toISOString(),
    };

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
