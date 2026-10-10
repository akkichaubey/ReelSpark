import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from './config';
import { Project } from './types';

// Ensure base storage directories exist
export function initStorage(): void {
  const dirs = [APP_CONFIG.storageRoot, APP_CONFIG.projectsDir, APP_CONFIG.tempDir];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Sanitize filename to prevent directory traversal and invalid Windows/Linux characters.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Safely ensure that a requested path stays inside the base storage directory.
 * Throws an error if path traversal is detected.
 */
export function assertSafePath(targetPath: string, basePath = APP_CONFIG.storageRoot): string {
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(targetPath);
  if (!normalizedTarget.startsWith(normalizedBase)) {
    throw new Error('Access denied: Path traversal detected');
  }
  return normalizedTarget;
}

export interface ProjectDirectories {
  rootDir: string;
  originalDir: string;
  transcriptsDir: string;
  candidatesDir: string;
  renderedDir: string;
  srtDir: string;
  zipsDir: string;
  manifestFile: string;
}

/**
 * Get and create structured directories for a given project ID.
 */
export function getProjectDirs(projectId: string): ProjectDirectories {
  initStorage();
  const safeId = sanitizeFilename(projectId);
  const rootDir = assertSafePath(path.join(APP_CONFIG.projectsDir, safeId), APP_CONFIG.projectsDir);

  const originalDir = path.join(rootDir, 'original');
  const transcriptsDir = path.join(rootDir, 'transcripts');
  const candidatesDir = path.join(rootDir, 'candidates');
  const renderedDir = path.join(rootDir, 'rendered');
  const srtDir = path.join(rootDir, 'srt');
  const zipsDir = path.join(rootDir, 'zips');
  const manifestFile = path.join(rootDir, 'manifest.json');

  for (const d of [rootDir, originalDir, transcriptsDir, candidatesDir, renderedDir, srtDir, zipsDir]) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  return {
    rootDir,
    originalDir,
    transcriptsDir,
    candidatesDir,
    renderedDir,
    srtDir,
    zipsDir,
    manifestFile,
  };
}

/**
 * Save project state to manifest.json atomically.
 */
export async function saveProject(project: Project): Promise<void> {
  const dirs = getProjectDirs(project.id);
  project.updatedAt = new Date().toISOString();
  const tempFile = `${dirs.manifestFile}.tmp`;
  await fs.promises.writeFile(tempFile, JSON.stringify(project, null, 2), 'utf8');
  await fs.promises.rename(tempFile, dirs.manifestFile);
}

/**
 * Load project manifest.
 */
export async function loadProject(projectId: string): Promise<Project | null> {
  try {
    const dirs = getProjectDirs(projectId);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dirs.manifestFile)) {
      return null;
    }
    const data = await fs.promises.readFile(/*turbopackIgnore: true*/ dirs.manifestFile, 'utf8');
    return JSON.parse(data) as Project;
  } catch (err) {
    console.error(`Failed to load project ${projectId}:`, err);
    return null;
  }
}

/**
 * List all existing projects.
 */
export async function listProjects(): Promise<Project[]> {
  initStorage();
  const entries = await fs.promises.readdir(APP_CONFIG.projectsDir, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.join(APP_CONFIG.projectsDir, entry.name, 'manifest.json');
      if (fs.existsSync(/*turbopackIgnore: true*/ manifestPath)) {
        try {
          const content = await fs.promises.readFile(/*turbopackIgnore: true*/ manifestPath, 'utf8');
          projects.push(JSON.parse(content) as Project);
        } catch {
          // ignore corrupted manifest
        }
      }
    }
  }

  // Sort descending by updated date
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Delete a project and its entire directory.
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    const dirs = getProjectDirs(projectId);
    if (fs.existsSync(dirs.rootDir)) {
      await fs.promises.rm(dirs.rootDir, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Failed to delete project ${projectId}:`, err);
    return false;
  }
}

/**
 * Clean up temporary files older than maxAgeHours.
 */
export async function cleanupTempFiles(maxAgeHours = 6): Promise<number> {
  initStorage();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  let deletedCount = 0;

  try {
    const files = await fs.promises.readdir(APP_CONFIG.tempDir);
    for (const file of files) {
      const filePath = path.join(APP_CONFIG.tempDir, file);
      const stat = await fs.promises.stat(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.promises.rm(filePath, { recursive: true, force: true });
        deletedCount++;
      }
    }
  } catch (err) {
    console.error('Error during temp cleanup:', err);
  }

  return deletedCount;
}
