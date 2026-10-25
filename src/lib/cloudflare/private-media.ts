import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { APP_CONFIG } from '../config';
import { assertSafePath } from '../storage';
import { canReadMedia, mediaUserNamespace, recordMediaOwner } from '../media-access';
import { d1Query, getD1Status } from './d1';
import { deletePrivateObject, getPrivateObject, putPrivateObject } from './private-r2';
import { clippingProjectDeleted, mediaLifecycleEnabled } from './media-lifecycle-state';

type RecordRow = { object_key: string; size_bytes: number; sha256: string };
type ExistingRecord = RecordRow & { owner_user_id: string };
export const privateMediaEnabled = () => process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true';

const FREE_TIER_SAFE_LIMITS = {
  storageBytes: 8_000_000_000,
  classAOps: 800_000,
  classBOps: 8_000_000,
} as const;

export class PrivateMediaQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateMediaQuotaError';
  }
}

function boundedLimit(envName: string, defaultValue: number, maxValue = defaultValue): number {
  const configured = Number(process.env[envName]);
  if (!Number.isSafeInteger(configured) || configured < 0) return defaultValue;
  return Math.min(configured, maxValue);
}

export function privateMediaQuotaLimits() {
  return {
    storageBytes: boundedLimit('CLOUD_R2_STORAGE_LIMIT_BYTES', FREE_TIER_SAFE_LIMITS.storageBytes),
    classAOps: boundedLimit('CLOUD_R2_CLASS_A_LIMIT', FREE_TIER_SAFE_LIMITS.classAOps),
    classBOps: boundedLimit('CLOUD_R2_CLASS_B_LIMIT', FREE_TIER_SAFE_LIMITS.classBOps),
  };
}

async function reserveUploadStorage(userId: string, relative: string, size: number, objectKey: string): Promise<void> {
  const limit = privateMediaQuotaLimits().storageBytes;
  const result = await d1Query<{ relative_path: string }>(
    `INSERT INTO private_media_upload_reservations (relative_path, owner_user_id, reserved_bytes, pending_object_key, started_at)
     SELECT ?, ?, ?, ?, ?
     WHERE (SELECT COALESCE(SUM(size_bytes), 0) FROM private_media)
       - COALESCE((SELECT size_bytes FROM private_media WHERE relative_path = ? AND owner_user_id = ?), 0)
       + ?
       + (SELECT COALESCE(SUM(reserved_bytes), 0) FROM private_media_upload_reservations) <= ?
     ON CONFLICT(relative_path) DO NOTHING
     RETURNING relative_path`,
    [relative, userId, size, objectKey, new Date().toISOString(), relative, userId, size, limit],
  );
  if (!result.success) throw new Error('Private media quota could not be checked');
  if (result.results.length !== 1) {
    throw new PrivateMediaQuotaError('Private media storage is at its safe monthly free-tier limit. Remove unused media before uploading more.');
  }
}

async function releaseUploadStorage(relative: string): Promise<void> {
  try {
    await d1Query('DELETE FROM private_media_upload_reservations WHERE relative_path = ?', [relative]);
  } catch (error) {
    // The janitor removes stale reservations after crashes or D1 interruptions.
    console.error('[Private media] Could not release upload reservation', error);
  }
}

async function reserveOperation(kind: 'class_a_ops' | 'class_b_ops'): Promise<void> {
  const limits = privateMediaQuotaLimits();
  const column = kind;
  const limit = kind === 'class_a_ops' ? limits.classAOps : limits.classBOps;
  const initialA = kind === 'class_a_ops' ? 1 : 0;
  const initialB = kind === 'class_b_ops' ? 1 : 0;
  const result = await d1Query<{ [key: string]: number }>(
    `INSERT INTO cloud_media_usage (month_key, class_a_ops, class_b_ops)
     SELECT ?, ?, ? WHERE ? >= 1
     ON CONFLICT(month_key) DO UPDATE SET ${column} = cloud_media_usage.${column} + 1
     WHERE cloud_media_usage.${column} < ?
     RETURNING ${column}`,
    [new Date().toISOString().slice(0, 7), initialA, initialB, limit, limit],
  );
  if (!result.success) throw new Error('Private media operation quota could not be checked');
  if (result.results.length !== 1) {
    const label = kind === 'class_a_ops' ? 'upload' : 'media restore';
    throw new PrivateMediaQuotaError(`R2 ${label} is paused at ReelSpark’s safe monthly free-tier request limit. Try again next month.`);
  }
}

export async function reservePrivateMediaOperation(kind: 'class_a_ops' | 'class_b_ops'): Promise<void> {
  await reserveOperation(kind);
}

/** True only when a private media object has a completed, owner-verified R2 catalog record. */
export async function hasPrivateMediaBackup(userId: string, filename: string): Promise<boolean> {
  if (!privateMediaEnabled()) return false;
  requireDatabase();
  const relative = relativeMediaPath(filename);
  const result = await d1Query<{ object_key: string }>(
    'SELECT object_key FROM private_media WHERE relative_path = ? AND owner_user_id = ? LIMIT 1',
    [relative, userId],
  );
  if (!result.success) throw new Error('Private media catalog unavailable');
  const record = result.results[0];
  return Boolean(record?.object_key?.startsWith(`users/${mediaUserNamespace(userId)}/`));
}

async function ensureSafeDirectory(directory: string): Promise<void> {
  await fs.mkdir(APP_CONFIG.storageRoot, { recursive: true });
  const realRoot = await fs.realpath(APP_CONFIG.storageRoot);
  let existing = directory;
  while (true) {
    try { assertSafePath(await fs.realpath(existing), realRoot); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error('Invalid media directory');
      existing = parent;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  assertSafePath(await fs.realpath(directory), realRoot);
}

function relativeMediaPath(filename: string): string {
  const relative = path.relative(APP_CONFIG.storageRoot, assertSafePath(filename)).split(path.sep).join('/');
  const parts = relative.split('/');
  if (parts.some(part => !part || part.startsWith('.')) || !/\.(mp4|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg|flac|png|jpg|jpeg|webp|srt|ass|zip)$/i.test(relative)) throw new Error('Unsupported private media path');
  const isClipFinderProject = parts[0] === 'projects' && /^[a-zA-Z0-9_-]{1,160}$/.test(parts[1] || '');
  if (parts[0] !== 'caption-maker' && !isClipFinderProject && !(parts[0] === 'clipping-studio' && parts[1] === 'projects')) throw new Error('Media namespace is not supported for cloud recovery yet');
  return relative;
}

function requireDatabase() {
  if (!getD1Status().configured) throw new Error('Private media requires D1 configuration');
}

/** Explicitly enabled writes fail rather than falsely acknowledging a cloud backup. */
export async function backupPrivateMedia(userId: string, filename: string, put = putPrivateObject, remove = deletePrivateObject): Promise<boolean> {
  if (!privateMediaEnabled()) return false;
  requireDatabase();
  const relative = relativeMediaPath(filename);
  if (!(await canReadMedia(userId, filename))) throw new Error('Media ownership could not be verified');
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > 500 * 1024 * 1024) throw new Error('Private media exceeds supported size');
  const existing = await d1Query<ExistingRecord & { relative_path: string }>(
    'SELECT relative_path, object_key, size_bytes, sha256, owner_user_id FROM private_media WHERE relative_path = ? LIMIT 1',
    [relative],
  );
  if (!existing.success) throw new Error('Private media catalog unavailable');
  if (existing.results[0] && existing.results[0].owner_user_id !== userId) throw new Error('Media ownership could not be verified');
  const oldRecord = existing.results[0];
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  const objectKey = `users/${mediaUserNamespace(userId)}/${randomUUID()}`;
  await reserveUploadStorage(userId, relative, stat.size, objectKey);
  let uploadAttempted = false;
  let newObjectQueued = false;
  try {
    await reserveOperation('class_a_ops');
    if (mediaLifecycleEnabled()) {
      const queued = await d1Query('INSERT INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)', [objectKey, userId, new Date().toISOString()]);
      if (!queued.success) throw new Error('Could not queue private media upload cleanup');
      newObjectQueued = true;
      if (oldRecord && oldRecord.object_key !== objectKey) {
        const oldQueued = await d1Query('INSERT OR IGNORE INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)', [oldRecord.object_key, userId, new Date().toISOString()]);
        if (!oldQueued.success) throw new Error('Could not queue replaced private media cleanup');
      }
    }
    uploadAttempted = true;
    await put(objectKey, filename, stat.size);
    const result = await d1Query<{ relative_path: string }>(
    `INSERT INTO private_media (relative_path, owner_user_id, object_key, size_bytes, sha256, updated_at)
     ${mediaLifecycleEnabled() ? 'SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM deleted_clipping_projects WHERE project_id = ?)' : 'VALUES (?, ?, ?, ?, ?, ?)'}
     ON CONFLICT(relative_path) DO UPDATE SET object_key=excluded.object_key, size_bytes=excluded.size_bytes,
       sha256=excluded.sha256, updated_at=excluded.updated_at
     WHERE private_media.owner_user_id=excluded.owner_user_id RETURNING relative_path`,
    [relative, userId, objectKey, stat.size, hash.digest('hex'), new Date().toISOString(), ...(mediaLifecycleEnabled() ? [relative.startsWith('clipping-studio/projects/') ? relative.split('/')[2] : null] : [])]
  );
    if (!result.success || result.results.length !== 1) throw new Error('Private media catalog save failed');
    if (mediaLifecycleEnabled()) {
      // The key is now live in the catalog; remove its provisional GC entry.
      // If D1 is temporarily unavailable, the janitor will see the active catalog
      // reference and prune the stale queue entry without deleting the object.
      try {
        await d1Query('DELETE FROM media_cleanup_queue WHERE object_key = ? AND owner_user_id = ?', [objectKey, userId]);
      } catch (error) {
        console.warn('[Private media] Could not clear the successful upload cleanup marker; active media remains protected', error);
      }
    }
    if (oldRecord && oldRecord.object_key !== objectKey && !mediaLifecycleEnabled()) {
      try { await remove(oldRecord.object_key); }
      catch (error) { console.error('[Private media] Replaced object cleanup will be retried by the janitor', error); }
    }
  } catch (error) {
    // Never acknowledge an unregistered object as durable; the previous
    // catalog object stays active until the replacement is registered.
    if (uploadAttempted) {
      try {
        if (newObjectQueued) {
          // The lifecycle janitor will delete this key after its grace period.
        } else await remove(objectKey);
      } catch (error) { console.error('[Private media] Failed object rollback will be retried by the janitor', error); }
    }
    if (error instanceof PrivateMediaQuotaError) throw error;
    throw new Error('Private media catalog save failed; local file retained');
  } finally {
    await releaseUploadStorage(relative);
  }
  return true;
}

/** Remove an owned cloud copy safely; lifecycle mode queues the object before unlinking its catalog row. */
export async function deletePrivateMedia(userId: string, filename: string): Promise<void> {
  if (!privateMediaEnabled()) return;
  requireDatabase();
  const relative = relativeMediaPath(filename);
  const lookup = await d1Query<RecordRow & { owner_user_id: string }>(
    'SELECT object_key, size_bytes, sha256, owner_user_id FROM private_media WHERE relative_path = ? LIMIT 1',
    [relative],
  );
  if (!lookup.success) throw new Error('Private media catalog unavailable');
  const record = lookup.results[0];
  if (!record) return;
  if (record.owner_user_id !== userId || !record.object_key.startsWith(`users/${mediaUserNamespace(userId)}/`)) {
    throw new Error('Private media ownership could not be verified');
  }
  if (mediaLifecycleEnabled()) {
    const queued = await d1Query(
      'INSERT OR IGNORE INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)',
      [record.object_key, userId, new Date().toISOString()],
    );
    if (!queued.success) throw new Error('Could not queue private media cleanup');
    const removed = await d1Query('DELETE FROM private_media WHERE relative_path = ? AND owner_user_id = ?', [relative, userId]);
    if (!removed.success) throw new Error('Could not remove private media catalog entry');
    return;
  }
  await reserveOperation('class_a_ops');
  await deletePrivateObject(record.object_key);
  const removed = await d1Query('DELETE FROM private_media WHERE relative_path = ? AND owner_user_id = ?', [relative, userId]);
  if (!removed.success) throw new Error('Could not remove private media catalog entry');
}

/** Restore only a D1 record belonging to this session, then verify its bytes. */
export async function restorePrivateMedia(userId: string, filename: string, get = getPrivateObject): Promise<boolean> {
  if (!privateMediaEnabled()) return false;
  requireDatabase();
  const relative = relativeMediaPath(filename);
  if (relative.startsWith('clipping-studio/projects/') && await clippingProjectDeleted(relative.split('/')[2])) return false;
  const result = await d1Query<RecordRow>('SELECT object_key, size_bytes, sha256 FROM private_media WHERE relative_path = ? AND owner_user_id = ? LIMIT 1', [relative, userId]);
  if (!result.success) throw new Error('Private media catalog unavailable');
  const record = result.results[0];
  if (!record) return false;
  if (!record.object_key.startsWith(`users/${mediaUserNamespace(userId)}/`) || !Number.isSafeInteger(record.size_bytes) || record.size_bytes > 500 * 1024 * 1024 || record.size_bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error('Invalid private media record');
  const parts = relative.split('/');
  let ownerDir: string | undefined;
  if (parts[0] === 'projects') {
    const { loadProject } = await import('../storage');
    const project = await loadProject(parts[1]);
    if (!project || project.ownerUserId !== userId) throw new Error('Project media ownership could not be verified');
  } else if (parts[0] === 'clipping-studio') ownerDir = path.join(APP_CONFIG.storageRoot, ...parts.slice(0, 3));
  else if (/^asset_[a-zA-Z0-9_-]+$/.test(parts[1])) ownerDir = path.join(APP_CONFIG.storageRoot, ...parts.slice(0, 2));
  else if (!['clips', 'trimmed', 'renders'].includes(parts[1]) || parts[2] !== mediaUserNamespace(userId)) throw new Error('Invalid private media namespace');
  await ensureSafeDirectory(path.dirname(filename));
  // Check actual directory before opening any file, including symlink/junction escapes.
  assertSafePath(await fs.realpath(path.dirname(filename)), await fs.realpath(APP_CONFIG.storageRoot));
  if (ownerDir) {
    try { await recordMediaOwner(ownerDir, userId); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = JSON.parse(await fs.readFile(path.join(ownerDir, '.owner.json'), 'utf8'));
      if (owner.userId !== userId) throw new Error('Local media owner conflict');
    }
  }
  const temporary = path.join(path.dirname(filename), `.restore-${randomUUID()}`);
  const hash = createHash('sha256');
  let size = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    if (size > record.size_bytes) return callback(new Error('Private media size mismatch'));
    hash.update(chunk); callback(null, chunk);
  } });
  try {
    await reserveOperation('class_b_ops');
    await pipeline(await get(record.object_key), meter, createWriteStream(temporary, { flags: 'wx' }), { signal: AbortSignal.timeout(120000) });
    if (size !== record.size_bytes || hash.digest('hex') !== record.sha256) throw new Error('Private media integrity check failed');
    await fs.rename(temporary, filename);
    return true;
  } finally { await fs.rm(temporary, { force: true }); }
}
