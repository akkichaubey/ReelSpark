import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG } from '../config';
import { assertSafePath } from '../storage';
import { mediaUserNamespace } from '../media-access';
import { d1Query } from './d1';
import { deletePrivateObject } from './private-r2';
import { mediaLifecycleEnabled } from './media-lifecycle-state';
import { fromStorageReference } from './storage-references';

/** Caller must have verified the local project or its owner-scoped cloud document. */
export async function deleteOwnedClippingProject(ownerId: string, id: string): Promise<void> {
  if (!mediaLifecycleEnabled()) throw new Error('Cloud lifecycle is not enabled');
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid project ID');
  const prefix = `clipping-studio/projects/${id}/`;
  const now = new Date().toISOString();
  const existing = await d1Query<{ owner_user_id: string }>('SELECT owner_user_id FROM deleted_clipping_projects WHERE project_id = ?', [id]);
  const document = await d1Query<{ owner_user_id: string }>("SELECT owner_user_id FROM project_documents WHERE kind = 'clipping' AND id = ?", [id]);
  const priorOwner = existing.results[0]?.owner_user_id || document.results[0]?.owner_user_id;
  if (priorOwner && priorOwner !== ownerId) throw new Error('Project not found');
  if (!priorOwner) {
    try {
      const marker = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects', id, '.owner.json');
      const owner = JSON.parse(await fs.readFile(marker, 'utf8'));
      if (owner.userId !== ownerId) throw new Error('Project not found');
    } catch { throw new Error('Project not found'); }
  }
  const otherDocuments = await d1Query<{ payload: string }>("SELECT payload FROM project_documents WHERE kind = 'clipping' AND owner_user_id = ? AND id <> ?", [ownerId, id]);
  for (const row of otherDocuments.results) {
    const other = JSON.parse(row.payload);
    if (Array.isArray(other.mediaAssets) && other.mediaAssets.some((asset: { localPath?: string }) => asset.localPath && fromStorageReference(asset.localPath).replace(/\\/g, '/').includes(`/${prefix}`))) {
      throw new Error('Project media is referenced by another saved project');
    }
  }
  // Fence writes/restores first. All following steps are idempotent and retryable.
  await d1Query('INSERT INTO deleted_clipping_projects (project_id, owner_user_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO NOTHING', [id, ownerId, now]);
  const tombstone = await d1Query<{ owner_user_id: string }>('SELECT owner_user_id FROM deleted_clipping_projects WHERE project_id = ?', [id]);
  if (tombstone.results[0]?.owner_user_id !== ownerId) throw new Error('Project not found');
  // Include catalog objects created before the inventory migration, if any.
  await d1Query(`INSERT OR IGNORE INTO media_cleanup_queue (object_key, owner_user_id, created_at)
    SELECT object_key, owner_user_id, ? FROM private_media
    WHERE owner_user_id = ? AND substr(relative_path, 1, ?) = ?`, [now, ownerId, prefix.length, prefix]);
  await d1Query('DELETE FROM private_media WHERE owner_user_id = ? AND substr(relative_path, 1, ?) = ?', [ownerId, prefix.length, prefix]);
  await d1Query("DELETE FROM project_documents WHERE kind = 'clipping' AND id = ? AND owner_user_id = ?", [id, ownerId]);
  const base = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
  const directory = assertSafePath(path.join(base, id), base);
  try {
    const realBase = await fs.realpath(base);
    const realDirectory = assertSafePath(await fs.realpath(directory), realBase);
    if (path.relative(realBase, realDirectory) !== id) throw new Error('Unsafe project directory');
    const owner = JSON.parse(await fs.readFile(path.join(realDirectory, '.owner.json'), 'utf8'));
    if (owner.userId !== ownerId) throw new Error('Local project owner conflict');
    await fs.rm(realDirectory, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Bounded, explicit maintenance. No scheduler or background cloud deletion. */
export async function cleanupUnusedMedia(dryRun = true, limit = 10, remove = deletePrivateObject) {
  if (!mediaLifecycleEnabled()) throw new Error('Cloud lifecycle is not enabled');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Cleanup limit must be 1–10');
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const result = await d1Query<{ object_key: string; owner_user_id: string }>(
    `SELECT q.object_key, q.owner_user_id FROM media_cleanup_queue q
     WHERE q.created_at <= ? AND NOT EXISTS (SELECT 1 FROM private_media m WHERE m.object_key = q.object_key)
     ORDER BY q.created_at LIMIT ?`, [cutoff, limit]);
  let removed = 0;
  let failed = 0;
  for (const row of result.results) {
    if (!row.object_key.startsWith(`users/${mediaUserNamespace(row.owner_user_id)}/`)) { failed++; continue; }
    if (dryRun) continue;
    try {
      // Recheck immediately before deleting; active records must not be removed.
      const active = await d1Query('SELECT object_key FROM private_media WHERE object_key = ? LIMIT 1', [row.object_key]);
      if (!active.success) throw new Error('Catalog unavailable');
      if (active.results.length) continue;
      await remove(row.object_key);
      await d1Query('DELETE FROM media_cleanup_queue WHERE object_key = ? AND owner_user_id = ?', [row.object_key, row.owner_user_id]);
      removed++;
    } catch { failed++; }
  }
  return { dryRun, candidates: result.results.length, removed, failed };
}
