import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from './config';
import { assertSafePath, initStorage, loadProject, resolveStoragePath } from './storage';
import { getActiveStorageTasks, isStoragePathActive } from './storage-runtime';
import { loadStorageReferenceSnapshot, normalizeManagedStorageReference, ownerHashForStorageReferences } from './storage-references';
import { deletePrivateMedia, privateMediaEnabled } from './cloudflare/private-media';
import { d1Query, getD1Status } from './cloudflare/d1';
import { mediaLifecycleEnabled } from './cloudflare/media-lifecycle-state';
import { cleanupUnusedMedia } from './cloudflare/media-lifecycle';

const TEMP_NAMES = [/^\.incoming-/, /^\.restore-/, /^\.previous-/, /^\.render-/, /^temp_merged_/, /^temp_sfx_/, /^\.partial-/];
const PRIVATE_MEDIA_EXTENSIONS = /\.(mp4|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg|flac|png|jpg|jpeg|webp|srt|ass|zip)$/i;
const runtimeState = globalThis as typeof globalThis & {
  reelsparkStorageMaintenanceRunning?: boolean;
  reelsparkStorageMaintenanceScheduled?: boolean;
  reelsparkStorageMaintenanceLastRun?: StorageMaintenanceResult;
};

export interface StorageMaintenanceResult {
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  local: { filesDeleted: number; directoriesDeleted: number; bytesDeleted: number; failed: number; skippedActive: number; referencesValid: boolean };
  external: { removed: number; failed: number; candidates: number; enabled: boolean };
  reservations: { cleared: number; failed: number; candidates: number; skippedActive: number };
  usage: StorageUsage;
}

export interface StorageUsage {
  totalBytes: number;
  totalFiles: number;
  truncated: boolean;
  categories: Record<string, { bytes: number; files: number }>;
  activeTasks: number;
  measuredAt: string;
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

const cleanupEnabled = () => process.env.STORAGE_CLEANUP_ENABLED !== 'false';
const tempRetentionMs = () => envInteger('STORAGE_TEMP_RETENTION_HOURS', 24, 1, 24 * 30) * 60 * 60 * 1000;
const orphanRetentionMs = () => envInteger('STORAGE_ORPHAN_RETENTION_DAYS', 30, 1, 3650) * 24 * 60 * 60 * 1000;
const intervalMs = () => envInteger('STORAGE_CLEANUP_INTERVAL_MINUTES', 60, 5, 24 * 60) * 60 * 1000;

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function hasReference(snapshot: Set<string>, filename: string): boolean {
  const normalized = path.relative(APP_CONFIG.storageRoot, filename).split(path.sep).join('/');
  for (const reference of snapshot) {
    if (reference === normalized) return true;
    const resolved = path.resolve(APP_CONFIG.storageRoot, ...reference.split('/'));
    if (isWithin(filename, resolved)) return true;
  }
  return false;
}

async function removeWithRetry(target: string, recursive: boolean): Promise<void> {
  const safe = assertSafePath(target, APP_CONFIG.storageRoot);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.rm(safe, { force: true, recursive, maxRetries: 2, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function cleanupStaleQuotaReservations(dryRun: boolean): Promise<StorageMaintenanceResult['reservations']> {
  const result: StorageMaintenanceResult['reservations'] = { cleared: 0, failed: 0, candidates: 0, skippedActive: 0 };
  if (!privateMediaEnabled() || !getD1Status().configured) return result;
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  try {
    const stale = await d1Query<{ relative_path: string; started_at: string }>(
      'SELECT relative_path, started_at FROM private_media_upload_reservations WHERE started_at <= ? ORDER BY started_at LIMIT 500',
      [cutoff],
    );
    result.candidates = stale.results.length;
    for (const row of stale.results) {
      let activePath: string;
      try { activePath = resolveStoragePath(row.relative_path); }
      catch { result.failed++; continue; }
      if (isStoragePathActive(activePath)) { result.skippedActive++; continue; }
      if (dryRun) continue;
      try {
        const removed = await d1Query(
          'DELETE FROM private_media_upload_reservations WHERE relative_path = ? AND started_at = ?',
          [row.relative_path, row.started_at],
        );
        result.cleared += removed.meta?.changes ?? 0;
      } catch { result.failed++; }
    }
  } catch (error) {
    result.failed++;
    console.warn('[Storage maintenance] stale quota reservations retained for retry:', error instanceof Error ? error.message : error);
  }
  return result;
}

async function directoryBytes(directory: string): Promise<{ bytes: number; files: number; newestMtime: number }> {
  let bytes = 0;
  let files = 0;
  let newestMtime = 0;
  const queue = [directory];
  while (queue.length) {
    const current = queue.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { queue.push(target); continue; }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(target).catch(() => null);
      if (!stat) continue;
      bytes += stat.size;
      files++;
      newestMtime = Math.max(newestMtime, stat.mtimeMs);
    }
  }
  return { bytes, files, newestMtime };
}

async function deletePrivateCopiesInDirectory(ownerId: string, directory: string): Promise<void> {
  const queue = [directory];
  while (queue.length) {
    const current = queue.pop()!;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(target);
      else if (entry.isFile() && PRIVATE_MEDIA_EXTENSIONS.test(entry.name)) await deletePrivateMedia(ownerId, target);
    }
  }
}

async function recoverInterruptedProjects(cutoff: number): Promise<number> {
  let recovered = 0;
  const entries = await fs.readdir(APP_CONFIG.projectsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,160}$/.test(entry.name)) continue;
    const manifestPath = path.join(APP_CONFIG.projectsDir, entry.name, 'manifest.json');
    try {
      const project = await loadProject(entry.name);
      if (!project || isStoragePathActive(path.dirname(manifestPath))) continue;
      const updated = Date.parse(project.updatedAt || '');
      if (!Number.isFinite(updated) || updated > cutoff) continue;
      let changed = false;
      if (project.status === 'UPLOADING') {
        project.status = project.localVideoPath ? 'QUEUED' : 'QUEUED';
        project.progress = 0;
        project.statusMessage = 'Previous upload was interrupted. Upload the source file again to continue.';
        changed = true;
      }
      if (project.status === 'RENDERING') {
        project.status = 'QUEUED';
        project.statusMessage = 'Previous render was interrupted by a server restart. Retry rendering when ready.';
        changed = true;
      }
      for (const candidate of project.candidates || []) {
        if (candidate.renderStatus === 'rendering') {
          candidate.renderStatus = 'failed';
          candidate.renderError = 'Previous render was interrupted by a server restart. Retry this clip.';
          changed = true;
        }
      }
      if (!changed) continue;
      const temporary = `${manifestPath}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(project, null, 2), { flag: 'wx' });
      await fs.rename(temporary, manifestPath).catch(async (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
        await fs.rm(manifestPath, { force: true });
        await fs.rename(temporary, manifestPath);
      });
      recovered++;
    } catch (error) {
      console.warn('[Storage maintenance] Could not recover project state:', entry.name, error instanceof Error ? error.message : error);
    }
  }
  return recovered;
}

async function removeExpiredKnownTemps(
  cutoff: number,
  dryRun: boolean,
  snapshot: Awaited<ReturnType<typeof loadStorageReferenceSnapshot>>,
): Promise<{ filesDeleted: number; bytesDeleted: number; failed: number; skippedActive: number }> {
  let filesDeleted = 0;
  let bytesDeleted = 0;
  let failed = 0;
  let skippedActive = 0;
  const queue = [APP_CONFIG.storageRoot];
  const ignored = new Set(['.metadata']);
  let scannedEntries = 0;
  while (queue.length && scannedEntries < 100_000) {
    const current = queue.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (scannedEntries >= 100_000) break;
      scannedEntries++;
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      const relative = path.relative(APP_CONFIG.storageRoot, target).split(path.sep)[0];
      if (ignored.has(relative)) continue;
      if (entry.isDirectory()) { queue.push(target); continue; }
      if (!entry.isFile() || !TEMP_NAMES.some((pattern) => pattern.test(entry.name))) continue;
      if (isStoragePathActive(target)) { skippedActive++; continue; }
      const stat = await fs.stat(target).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      try {
        if (entry.name.startsWith('.partial-') && entry.name.endsWith('.json')) {
          let marker: { ownerId?: string; target?: string } | undefined;
          try { marker = JSON.parse(await fs.readFile(target, 'utf8')); } catch { /* Corrupt markers never authorize deletion. */ }
          if (marker?.ownerId && marker.target && snapshot.valid) {
            const managedTarget = resolveStoragePath(marker.target);
            if (!isStoragePathActive(managedTarget) && !hasReference(snapshot.references, managedTarget)) {
              const { canReadMedia } = await import('./media-access');
              if (await canReadMedia(marker.ownerId, managedTarget)) {
                if (!dryRun) {
                  await deletePrivateMedia(marker.ownerId, managedTarget);
                  const targetStat = await fs.stat(managedTarget).catch(() => null);
                  await removeWithRetry(managedTarget, false);
                  if (targetStat) { filesDeleted++; bytesDeleted += targetStat.size; }
                }
              }
            }
          }
        }
        if (!dryRun) await removeWithRetry(target, false);
        filesDeleted++;
        bytesDeleted += stat.size;
      } catch (error) {
        failed++;
        console.warn('[Storage maintenance] Temp cleanup will retry next run:', target, error instanceof Error ? error.message : error);
      }
    }
  }
  if (queue.length) console.warn('[Storage maintenance] Temporary-file scan reached its 100,000-entry safety limit; remaining paths will be checked on the next run.');
  return { filesDeleted, bytesDeleted, failed, skippedActive };
}

async function removeOrphanCaptionAssets(cutoff: number, snapshot: Awaited<ReturnType<typeof loadStorageReferenceSnapshot>>, dryRun: boolean): Promise<{ filesDeleted: number; directoriesDeleted: number; bytesDeleted: number; failed: number }> {
  const result = { filesDeleted: 0, directoriesDeleted: 0, bytesDeleted: 0, failed: 0 };
  const captionRoot = path.join(APP_CONFIG.storageRoot, 'caption-maker');
  const entries = await fs.readdir(captionRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^asset_[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
    const directory = path.join(captionRoot, entry.name);
    if (isStoragePathActive(directory)) continue;
    const ownerFile = path.join(directory, '.owner.json');
    let ownerId: string;
    try { ownerId = JSON.parse(await fs.readFile(ownerFile, 'utf8')).userId; }
    catch { continue; } // Unknown ownership is retained for manual review.
    const abandonedMarker = path.join(directory, '.abandoned-upload.json');
    const marker = await fs.stat(abandonedMarker).catch(() => null);
    if (marker && marker.mtimeMs <= cutoff) {
      try {
        const usage = await directoryBytes(directory);
        if (!dryRun) {
          await deletePrivateCopiesInDirectory(ownerId, directory);
          await removeWithRetry(directory, true);
        }
        result.directoriesDeleted++;
        result.filesDeleted += usage.files;
        result.bytesDeleted += usage.bytes;
      } catch (error) {
        result.failed++;
        console.warn('[Storage maintenance] Abandoned upload cleanup will retry:', directory, error instanceof Error ? error.message : error);
      }
      continue;
    }
    if (!snapshot.valid || !snapshot.projectInventoryValid) continue;
    if (!snapshot.ownersWithSyncedReferences.has(ownerHashForStorageReferences(ownerId))) continue;
    const usage = await directoryBytes(directory);
    if (!usage.files || usage.newestMtime > cutoff || hasReference(snapshot.references, directory)) continue;
    if (usage.newestMtime > Date.now() - orphanRetentionMs()) continue;
    try {
      if (!dryRun) await removeWithRetry(directory, true);
      result.directoriesDeleted++;
      result.filesDeleted += usage.files;
      result.bytesDeleted += usage.bytes;
    } catch (error) {
      result.failed++;
      console.warn('[Storage maintenance] Orphan media cleanup will retry:', directory, error instanceof Error ? error.message : error);
    }
  }
  return result;
}

async function removeOrphanCaptionRenders(cutoff: number, snapshot: Awaited<ReturnType<typeof loadStorageReferenceSnapshot>>, dryRun: boolean): Promise<{ filesDeleted: number; directoriesDeleted: number; bytesDeleted: number; failed: number }> {
  const result = { filesDeleted: 0, directoriesDeleted: 0, bytesDeleted: 0, failed: 0 };
  if (!snapshot.valid || !snapshot.projectInventoryValid) return result;
  const captionRoot = path.join(APP_CONFIG.storageRoot, 'caption-maker');
  const roots = ['renders', 'clips', 'trimmed'].map((name) => path.join(captionRoot, name));
  for (const root of roots) {
    const users = await fs.readdir(/*turbopackIgnore: true*/ root, { withFileTypes: true }).catch(() => []);
    for (const user of users) {
      if (!user.isDirectory() || !/^[a-f0-9]{64}$/.test(user.name)) continue;
      if (!snapshot.ownersWithSyncedReferences.has(user.name)) continue;
      const userDir = path.join(root, user.name);
      let ownerId: string;
      try { ownerId = JSON.parse(await fs.readFile(path.join(userDir, '.owner.json'), 'utf8')).userId; }
      catch { continue; }
      if (ownerHashForStorageReferences(ownerId) !== user.name) continue;
      const children = await fs.readdir(userDir, { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        if (child.isSymbolicLink() || child.name.startsWith('.')) continue;
        const target = path.join(userDir, child.name);
        if (isStoragePathActive(target) || hasReference(snapshot.references, target)) continue;
        const usage = child.isDirectory() ? await directoryBytes(target) : await fs.stat(target).then((stat) => ({ bytes: stat.size, files: 1, newestMtime: stat.mtimeMs })).catch(() => null);
        if (!usage || !usage.files || usage.newestMtime > cutoff || usage.newestMtime > Date.now() - orphanRetentionMs()) continue;
        try {
          if (!dryRun) {
            if (child.isDirectory()) await deletePrivateCopiesInDirectory(ownerId, target);
            else if (PRIVATE_MEDIA_EXTENSIONS.test(child.name)) await deletePrivateMedia(ownerId, target);
            await removeWithRetry(target, child.isDirectory());
          }
          if (child.isDirectory()) result.directoriesDeleted++;
          result.filesDeleted += usage.files;
          result.bytesDeleted += usage.bytes;
        } catch (error) {
          result.failed++;
          console.warn('[Storage maintenance] Orphan render cleanup will retry:', target, error instanceof Error ? error.message : error);
        }
      }
    }
  }
  return result;
}

async function removeOrphanClippingExports(
  cutoff: number,
  snapshot: Awaited<ReturnType<typeof loadStorageReferenceSnapshot>>,
  dryRun: boolean,
): Promise<{ filesDeleted: number; directoriesDeleted: number; bytesDeleted: number; failed: number; skippedActive: number }> {
  const result = { filesDeleted: 0, directoriesDeleted: 0, bytesDeleted: 0, failed: 0, skippedActive: 0 };
  if (!snapshot.valid || !snapshot.projectInventoryValid) return result;
  const root = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
  const projects = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const project of projects) {
    if (!project.isDirectory() || !/^[a-zA-Z0-9_-]{1,160}$/.test(project.name)) continue;
    const projectDir = path.join(root, project.name);
    let ownerId: string;
    try { ownerId = JSON.parse(await fs.readFile(path.join(projectDir, '.owner.json'), 'utf8')).userId; }
    catch { continue; }
    if (!snapshot.ownersWithSyncedReferences.has(ownerHashForStorageReferences(ownerId))) continue;
    const exportRoot = path.join(projectDir, 'exports');
    const exports = await fs.readdir(exportRoot, { withFileTypes: true }).catch(() => []);
    for (const exportDir of exports) {
      if (!exportDir.isDirectory() || !/^export-[a-zA-Z0-9_-]+$/.test(exportDir.name)) continue;
      const target = path.join(exportRoot, exportDir.name);
      if (isStoragePathActive(target)) { result.skippedActive++; continue; }
      const usage = await directoryBytes(target);
      if (!usage.files || usage.newestMtime > cutoff || hasReference(snapshot.references, target)) continue;
      try {
        if (!dryRun) {
          await deletePrivateCopiesInDirectory(ownerId, target);
          await removeWithRetry(target, true);
        }
        result.directoriesDeleted++;
        result.filesDeleted += usage.files;
        result.bytesDeleted += usage.bytes;
      } catch (error) {
        result.failed++;
        console.warn('[Storage maintenance] Orphan clipping export cleanup will retry:', target, error instanceof Error ? error.message : error);
      }
    }
  }
  return result;
}

async function collectUsage(): Promise<StorageUsage> {
  const categories: StorageUsage['categories'] = {};
  let totalBytes = 0;
  let totalFiles = 0;
  let truncated = false;
  let scannedEntries = 0;
  const queue = [APP_CONFIG.storageRoot];
  while (queue.length && totalFiles < 100_000 && scannedEntries < 250_000) {
    const current = queue.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (scannedEntries >= 250_000) break;
      scannedEntries++;
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) { queue.push(target); continue; }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(target).catch(() => null);
      if (!stat) continue;
      const segments = path.relative(APP_CONFIG.storageRoot, target).split(path.sep);
      const [first, second, third, fourth] = segments;
      let category = 'other';
      if (first === 'projects') category = 'clip-finder-projects';
      else if (first === 'caption-maker' && /^asset_/.test(second || '')) category = 'caption-maker-uploads';
      else if (first === 'caption-maker' && second === 'renders') category = 'caption-maker-renders';
      else if (first === 'caption-maker' && ['clips', 'trimmed'].includes(second || '')) category = 'caption-maker-derived-media';
      else if (first === 'caption-maker') category = 'caption-maker-other';
      else if (first === 'clipping-studio' && second === 'projects' && third && fourth === 'media') category = 'clipping-studio-uploads';
      else if (first === 'clipping-studio' && second === 'projects' && third && fourth === 'exports') category = 'clipping-studio-renders';
      else if (first === 'clipping-studio') category = 'clipping-studio-other';
      else if (first === 'temp') category = 'temporary';
      else if (first === '.metadata') category = 'metadata';
      const currentCategory = categories[category] ??= { bytes: 0, files: 0 };
      currentCategory.bytes += stat.size;
      currentCategory.files++;
      totalBytes += stat.size;
      totalFiles++;
      if (totalFiles >= 100_000) { truncated = true; break; }
    }
  }
  if (queue.length) truncated = true;
  return { totalBytes, totalFiles, truncated, categories, activeTasks: getActiveStorageTasks().length, measuredAt: new Date().toISOString() };
}

async function withMaintenanceLock<T>(callback: () => Promise<T>): Promise<T | null> {
  const metadataDir = path.join(APP_CONFIG.storageRoot, '.metadata');
  await fs.mkdir(metadataDir, { recursive: true });
  const lockPath = path.join(metadataDir, 'storage-maintenance.lock');
  const staleAfter = Math.max(intervalMs() * 2, 60 * 60 * 1000);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    try { handle = await fs.open(lockPath, 'wx'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (!stat || Date.now() - stat.mtimeMs <= staleAfter) return null;
      await fs.rm(lockPath, { force: true });
      handle = await fs.open(lockPath, 'wx');
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    heartbeat = setInterval(() => {
      const now = new Date();
      void fs.utimes(lockPath, now, now).catch(() => undefined);
    }, Math.min(5 * 60 * 1000, Math.max(60_000, Math.floor(staleAfter / 3))));
    heartbeat.unref?.();
    return await callback();
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await handle?.close().catch(() => undefined);
    if (handle) await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

export async function getStorageUsage(): Promise<StorageUsage> {
  initStorage();
  return collectUsage();
}

export async function runStorageMaintenance(dryRun = false): Promise<StorageMaintenanceResult> {
  const startedAt = new Date().toISOString();
  initStorage();
  const locked = await withMaintenanceLock(async () => {
    const cutoff = Date.now() - tempRetentionMs();
    const recoveryCutoff = Date.now() - Math.max(tempRetentionMs(), 6 * 60 * 60 * 1000);
    const snapshot = await loadStorageReferenceSnapshot();
    const temp = await removeExpiredKnownTemps(cutoff, dryRun, snapshot);
    const captionAssets = await removeOrphanCaptionAssets(Date.now() - orphanRetentionMs(), snapshot, dryRun);
    const captionRenders = await removeOrphanCaptionRenders(Date.now() - orphanRetentionMs(), snapshot, dryRun);
    const clippingExports = await removeOrphanClippingExports(Date.now() - orphanRetentionMs(), snapshot, dryRun);
    const tempEntries = await fs.readdir(APP_CONFIG.tempDir, { withFileTypes: true }).catch(() => []);
    for (const entry of tempEntries) {
      const target = assertSafePath(path.join(APP_CONFIG.tempDir, entry.name), APP_CONFIG.tempDir);
      if (isStoragePathActive(target)) { temp.skippedActive++; continue; }
      const stat = await fs.stat(target).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      try {
        if (!dryRun) await removeWithRetry(target, entry.isDirectory());
        temp.filesDeleted += entry.isFile() ? 1 : 0;
        temp.bytesDeleted += entry.isFile() ? stat.size : (await directoryBytes(target)).bytes;
      } catch (error) {
        temp.failed++;
        console.warn('[Storage maintenance] storage/temp cleanup will retry:', target, error instanceof Error ? error.message : error);
      }
    }
    const recoveredProjects = dryRun ? 0 : await recoverInterruptedProjects(recoveryCutoff);
    const reservations = await cleanupStaleQuotaReservations(dryRun);
    let external = { removed: 0, failed: 0, candidates: 0, enabled: false };
    if (mediaLifecycleEnabled()) {
      external.enabled = true;
      try { external = { ...(await cleanupUnusedMedia(dryRun, 10)), enabled: true }; }
      catch (error) { external.failed++; console.warn('[Storage maintenance] R2 cleanup retained queued objects for retry:', error instanceof Error ? error.message : error); }
    }
    const local = {
      filesDeleted: temp.filesDeleted + captionAssets.filesDeleted + captionRenders.filesDeleted + clippingExports.filesDeleted,
      directoriesDeleted: captionAssets.directoriesDeleted + captionRenders.directoriesDeleted + clippingExports.directoriesDeleted,
      bytesDeleted: temp.bytesDeleted + captionAssets.bytesDeleted + captionRenders.bytesDeleted + clippingExports.bytesDeleted,
      failed: temp.failed + captionAssets.failed + captionRenders.failed + clippingExports.failed,
      skippedActive: temp.skippedActive + clippingExports.skippedActive,
      referencesValid: snapshot.valid,
    };
    const usage = await collectUsage();
    const result: StorageMaintenanceResult = {
      startedAt,
      completedAt: new Date().toISOString(),
      dryRun,
      local,
      external,
      reservations,
      usage,
    };
    console.info('[Storage maintenance]', JSON.stringify({ ...result, recoveredProjects, references: snapshot.references.size }));
    return result;
  });

  if (!locked) {
    const usage = await collectUsage();
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      dryRun,
      local: { filesDeleted: 0, directoriesDeleted: 0, bytesDeleted: 0, failed: 0, skippedActive: getActiveStorageTasks().length, referencesValid: false },
      external: { removed: 0, failed: 0, candidates: 0, enabled: mediaLifecycleEnabled() },
      reservations: { cleared: 0, failed: 0, candidates: 0, skippedActive: 0 },
      usage,
    };
  }
  runtimeState.reelsparkStorageMaintenanceLastRun = locked;
  return locked;
}

export function startStorageMaintenanceScheduler(): void {
  if (runtimeState.reelsparkStorageMaintenanceScheduled || !cleanupEnabled()) return;
  runtimeState.reelsparkStorageMaintenanceScheduled = true;
  const scheduleRun = () => {
    if (runtimeState.reelsparkStorageMaintenanceRunning) return;
    runtimeState.reelsparkStorageMaintenanceRunning = true;
    void runStorageMaintenance(false)
      .catch((error) => console.error('[Storage maintenance] Scheduled run failed; files retained for retry:', error instanceof Error ? error.message : error))
      .finally(() => { runtimeState.reelsparkStorageMaintenanceRunning = false; });
  };
  const startup = setTimeout(scheduleRun, 30_000);
  startup.unref?.();
  const interval = setInterval(scheduleRun, intervalMs());
  interval.unref?.();
  console.info(`[Storage maintenance] Scheduler enabled; interval=${Math.round(intervalMs() / 60_000)}m tempRetention=${Math.round(tempRetentionMs() / 3_600_000)}h orphanRetention=${Math.round(orphanRetentionMs() / 86_400_000)}d`);
}
