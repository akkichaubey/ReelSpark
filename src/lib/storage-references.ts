import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG } from './config';
import { assertSafePath, resolveStoragePath } from './storage';

const REFERENCE_DIR = '.metadata/media-references';
const OWNER_HASH = (ownerId: string) => createHash('sha256').update(ownerId).digest('hex');

export function normalizeManagedStorageReference(input: string): string {
  if (!input || input.length > 4096) throw new Error('Invalid media reference');
  const portable = input.startsWith('reelspark-storage:') ? input.slice('reelspark-storage:'.length) : input;
  const candidate = path.isAbsolute(portable) ? assertSafePath(path.resolve(portable), APP_CONFIG.storageRoot) : resolveStoragePath(portable);
  return path.relative(APP_CONFIG.storageRoot, candidate).split(path.sep).join('/');
}

function referenceOwnerDirectory(ownerId: string): string {
  return assertSafePath(path.join(APP_CONFIG.storageRoot, REFERENCE_DIR, OWNER_HASH(ownerId)), APP_CONFIG.storageRoot);
}

export async function saveStorageReferences(
  ownerId: string,
  clientId: string,
  references: string[],
  projectReferences: Record<string, string[]> = {},
  projectInventoryComplete = false,
): Promise<void> {
  const directory = referenceOwnerDirectory(ownerId);
  const safeClientId = createHash('sha256').update(clientId).digest('hex');
  await fs.mkdir(directory, { recursive: true });
  const target = assertSafePath(path.join(directory, `${safeClientId}.json`), directory);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const payload = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    references: [...new Set(references)],
    projectReferences: Object.fromEntries(Object.entries(projectReferences).map(([key, paths]) => [key, [...new Set(paths)]])),
    projectInventoryComplete,
  });
  await fs.writeFile(temporary, payload, { flag: 'wx' });
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    // Windows does not replace an existing file with rename in every filesystem.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export interface StorageReferenceSnapshot {
  references: Set<string>;
  projectReferences: Map<string, Set<string>>;
  projectInventoryValid: boolean;
  ownersWithSyncedReferences: Set<string>;
  valid: boolean;
}

/** Invalid/incomplete reference inventories disable destructive orphan collection for this pass. */
export async function loadStorageReferenceSnapshot(): Promise<StorageReferenceSnapshot> {
  const references = new Set<string>();
  const projectReferences = new Map<string, Set<string>>();
  let projectInventoryValid = true;
  let hasInventoryRecord = false;
  const ownersWithSyncedReferences = new Set<string>();
  let valid = true;
  const directory = path.join(APP_CONFIG.storageRoot, REFERENCE_DIR);
  let ownerDirs: string[];
  try { ownerDirs = await fs.readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { references, projectReferences, projectInventoryValid: false, ownersWithSyncedReferences, valid };
    throw error;
  }

  for (const ownerHash of ownerDirs) {
    if (!/^[a-f0-9]{64}$/.test(ownerHash)) { valid = false; continue; }
    const ownerPath = path.join(directory, ownerHash);
    const entries = await fs.readdir(ownerPath, { withFileTypes: true }).catch(() => []);
    const files = entries.filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name));
    if (files.length) ownersWithSyncedReferences.add(ownerHash);
    for (const entry of files) {
      try {
        hasInventoryRecord = true;
        const record = JSON.parse(await fs.readFile(path.join(ownerPath, entry.name), 'utf8')) as {
          version?: number; references?: unknown; projectReferences?: unknown; projectInventoryComplete?: boolean;
        };
        if (record.version !== 1 || !Array.isArray(record.references) || record.references.some((item) => typeof item !== 'string')) {
          valid = false;
          continue;
        }
        if (record.projectInventoryComplete !== true) projectInventoryValid = false;
        for (const item of record.references) references.add(normalizeManagedStorageReference(item));
        if (record.projectReferences !== undefined) {
          if (!record.projectReferences || typeof record.projectReferences !== 'object' || Array.isArray(record.projectReferences)) {
            valid = false;
            continue;
          }
          for (const [key, value] of Object.entries(record.projectReferences as Record<string, unknown>)) {
            if (!/^(caption-maker|clipping-studio):[a-zA-Z0-9_-]{1,160}$/.test(key) || !Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
              valid = false;
              continue;
            }
            const target = projectReferences.get(key) ?? new Set<string>();
            for (const item of value) target.add(normalizeManagedStorageReference(item));
            projectReferences.set(key, target);
          }
        }
      } catch {
        valid = false;
      }
    }
  }
  if (!hasInventoryRecord) projectInventoryValid = false;
  return { references, projectReferences, projectInventoryValid, ownersWithSyncedReferences, valid };
}

export function ownerHashForStorageReferences(ownerId: string): string {
  return OWNER_HASH(ownerId);
}

export function isStoragePathReferencedByAnotherProject(
  snapshot: StorageReferenceSnapshot,
  scope: 'caption-maker' | 'clipping-studio',
  projectId: string,
  targetDirectory: string,
): boolean {
  if (!snapshot.projectInventoryValid) return true;
  const target = path.resolve(targetDirectory);
  for (const [projectKey, references] of snapshot.projectReferences) {
    if (projectKey === `${scope}:${projectId}`) continue;
    for (const reference of references) {
      const candidate = path.resolve(APP_CONFIG.storageRoot, ...reference.split('/'));
      const relative = path.relative(target, candidate);
      if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) return true;
    }
  }
  return false;
}

export function storageReferenceDirectory(): string {
  return assertSafePath(path.join(APP_CONFIG.storageRoot, REFERENCE_DIR), APP_CONFIG.storageRoot);
}
