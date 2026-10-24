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
export const privateMediaEnabled = () => process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true';

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
  if (parts[0] !== 'caption-maker' && !(parts[0] === 'clipping-studio' && parts[1] === 'projects')) throw new Error('Media namespace is not supported for cloud recovery yet');
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
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  const objectKey = `users/${mediaUserNamespace(userId)}/${randomUUID()}`;
  if (mediaLifecycleEnabled()) {
    await d1Query('INSERT INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)', [objectKey, userId, new Date().toISOString()]);
  }
  await put(objectKey, filename, stat.size);
  try {
    const result = await d1Query<{ relative_path: string }>(
    `INSERT INTO private_media (relative_path, owner_user_id, object_key, size_bytes, sha256, updated_at)
     ${mediaLifecycleEnabled() ? 'SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM deleted_clipping_projects WHERE project_id = ?)' : 'VALUES (?, ?, ?, ?, ?, ?)'}
     ON CONFLICT(relative_path) DO UPDATE SET object_key=excluded.object_key, size_bytes=excluded.size_bytes,
       sha256=excluded.sha256, updated_at=excluded.updated_at
     WHERE private_media.owner_user_id=excluded.owner_user_id RETURNING relative_path`,
    [relative, userId, objectKey, stat.size, hash.digest('hex'), new Date().toISOString(), ...(mediaLifecycleEnabled() ? [relative.startsWith('clipping-studio/projects/') ? relative.split('/')[2] : null] : [])]
  );
    if (!result.success || result.results.length !== 1) throw new Error('Private media catalog save failed');
  } catch {
    // Never acknowledge an unregistered object as durable. Only this new,
    // random-key upload is eligible for rollback; existing media is untouched.
    try { await remove(objectKey); } catch { /* Orphan cleanup needs a later retry. */ }
    throw new Error('Private media catalog save failed; local file retained');
  }
  return true;
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
  if (parts[0] === 'clipping-studio') ownerDir = path.join(APP_CONFIG.storageRoot, ...parts.slice(0, 3));
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
    await pipeline(await get(record.object_key), meter, createWriteStream(temporary, { flags: 'wx' }), { signal: AbortSignal.timeout(120000) });
    if (size !== record.size_bytes || hash.digest('hex') !== record.sha256) throw new Error('Private media integrity check failed');
    await fs.rename(temporary, filename);
    return true;
  } finally { await fs.rm(temporary, { force: true }); }
}
