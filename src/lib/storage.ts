import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from './config';
import { Project } from './types';
import { cancelStorageTasksUnder, isStoragePathActive } from './storage-runtime';

export class StorageInUseError extends Error {
  constructor(message = 'Project files are still in use by an active upload or processing task. Retry deletion in a moment.') {
    super(message);
    this.name = 'StorageInUseError';
  }
}

export class ProjectMediaReferencedError extends Error {
  constructor() {
    super('Project media is referenced by another saved project. The project was retained to protect shared files.');
    this.name = 'ProjectMediaReferencedError';
  }
}

function containsPathInsideProject(value: unknown, targetDirectory: string): boolean {
  if (typeof value === 'string') {
    let candidate: string | undefined;
    try {
      if (value.startsWith('/api/files/')) candidate = path.join(APP_CONFIG.storageRoot, decodeURIComponent(value.slice('/api/files/'.length).split(/[?#]/)[0]));
      else if (value.startsWith('reelspark-storage:')) candidate = path.resolve(APP_CONFIG.storageRoot, value.slice('reelspark-storage:'.length));
      else if (path.isAbsolute(value)) candidate = value;
      if (!candidate) return false;
      const safe = assertSafePath(path.resolve(candidate), APP_CONFIG.storageRoot);
      const relative = path.relative(targetDirectory, safe);
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    } catch { return false; }
  }
  if (Array.isArray(value)) return value.some((item) => containsPathInsideProject(item, targetDirectory));
  if (value && typeof value === 'object') return Object.entries(value).some(([key, child]) =>
    /(?:path|url)$/i.test(key) && containsPathInsideProject(child, targetDirectory) || containsPathInsideProject(child, targetDirectory));
  return false;
}

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
  const relative = path.relative(normalizedBase, normalizedTarget);
  // `startsWith()` is unsafe here: `storage-other` also starts with `storage`.
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Access denied: Path traversal detected');
  }
  return normalizedTarget;
}

/** Resolve a client-provided storage-relative path without allowing absolute paths. */
export function resolveStoragePath(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Access denied: expected a storage-relative path');
  }
  return assertSafePath(path.join(APP_CONFIG.storageRoot, relativePath), APP_CONFIG.storageRoot);
}

/** Verify an existing path belongs to local ReelSpark storage. */
export function assertStorageFile(filePath: string): string {
  return assertSafePath(filePath, APP_CONFIG.storageRoot);
}

export interface ProjectDirectories {
  rootDir: string;
  originalDir: string;
  transcriptsDir: string;
  candidatesDir: string;
  renderedDir: string;
  srtDir: string;
  zipsDir: string;
  clipsDir: string;
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
  const clipsDir = path.join(rootDir, 'clips');
  const manifestFile = path.join(rootDir, 'manifest.json');

  for (const d of [rootDir, originalDir, transcriptsDir, candidatesDir, renderedDir, srtDir, zipsDir, clipsDir]) {
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
    clipsDir,
    manifestFile,
  };
}

/**
 * Save project state to manifest.json atomically.
 */
export async function saveProject(project: Project): Promise<void> {
  const dirs = getProjectDirs(project.id);
  project.updatedAt = new Date().toISOString();
  const projectDocuments = await import('./cloudflare/project-documents');
  if (projectDocuments.projectCloudEnabled()) {
    if (!project.ownerUserId) throw new Error('Project owner is required for cloud persistence');
    await projectDocuments.saveClipFinderDocument(project.ownerUserId, project);
  }
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
    const projectDocuments = await import('./cloudflare/project-documents');
    if (projectDocuments.projectCloudEnabled()) {
      const cloudProject = await projectDocuments.loadClipFinderDocument(projectId);
      if (cloudProject) {
        const tempFile = `${dirs.manifestFile}.tmp`;
        await fs.promises.writeFile(tempFile, JSON.stringify(cloudProject, null, 2), 'utf8');
        await fs.promises.rename(tempFile, dirs.manifestFile);
        return cloudProject;
      }
      if (!(await projectDocuments.clipFinderProjectDeleted(projectId)) && fs.existsSync(dirs.manifestFile)) {
        const localProject = JSON.parse(await fs.promises.readFile(dirs.manifestFile, 'utf8')) as Project;
        if (localProject.id === projectId && localProject.ownerUserId) {
          // One-time migration for projects created before cloud metadata was
          // enabled. Back up existing deliverables before committing metadata.
          if (process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true') {
            const { backupPrivateMedia } = await import('./cloudflare/private-media');
            const paths = [localProject.localVideoPath, ...localProject.candidates.flatMap(candidate => [candidate.renderedVideoPath, candidate.renderedSrtPath])];
            for (const filename of new Set(paths.filter((value): value is string => Boolean(value)))) {
              if (fs.existsSync(filename) && fs.statSync(filename).isFile()) await backupPrivateMedia(localProject.ownerUserId, filename);
            }
          }
          await projectDocuments.saveClipFinderDocument(localProject.ownerUserId, localProject);
          return localProject;
        }
      }
      // A configured cloud catalog is authoritative; stale local manifests must
      // not resurrect a project that was deleted or is owned by another user.
      return null;
    }
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
export async function listProjects(ownerUserId?: string): Promise<Project[]> {
  initStorage();
  const projectDocuments = await import('./cloudflare/project-documents');
  if (projectDocuments.projectCloudEnabled()) {
    return projectDocuments.listClipFinderDocuments(ownerUserId);
  }
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
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(projectId)) throw new Error('Invalid project ID');
  const projectRoot = assertSafePath(path.join(APP_CONFIG.projectsDir, sanitizeFilename(projectId)), APP_CONFIG.projectsDir);
  const project = await loadProject(projectId);
  if (!project) return false;

  const projects = await listProjects();
  if (projects.some((project) => project.id !== projectId && containsPathInsideProject(project, projectRoot))) {
    throw new ProjectMediaReferencedError();
  }

  await cancelStorageTasksUnder(projectRoot);
  if (isStoragePathActive(projectRoot)) throw new StorageInUseError();

  const projectDocuments = await import('./cloudflare/project-documents');
  if (projectDocuments.projectCloudEnabled()) {
    if (!project.ownerUserId) throw new Error('Project owner is required for cloud deletion');
    const { deleteOwnedClipFinderProject } = await import('./cloudflare/media-lifecycle');
    await deleteOwnedClipFinderProject(project.ownerUserId, projectId);
  }

  if (!fs.existsSync(projectRoot)) {
    console.info('[Storage] Deleted cloud project', projectId);
    return true;
  }

  const realProjectsDir = await fs.promises.realpath(APP_CONFIG.projectsDir);
  const realProjectDir = assertSafePath(await fs.promises.realpath(projectRoot), realProjectsDir);
  if (path.dirname(realProjectDir) !== realProjectsDir || path.basename(realProjectDir) !== projectId) {
    throw new Error('Unsafe project directory; files were retained');
  }
  await fs.promises.rm(realProjectDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  console.info('[Storage] Deleted project directory', projectId);
  return true;
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
