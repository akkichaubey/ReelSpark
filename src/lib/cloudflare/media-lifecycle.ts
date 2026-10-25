import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG } from '../config';
import { assertSafePath } from '../storage';
import { mediaUserNamespace } from '../media-access';
import { d1Query } from './d1';
import { deletePrivateObject, listPrivateObjects } from './private-r2';
import { reservePrivateMediaOperation } from './private-media';
import { mediaLifecycleEnabled } from './media-lifecycle-state';
import { fromStorageReference } from './storage-references';

/** Fence Clip Finder project recovery, delete its catalog records, and queue R2 cleanup. */
export async function deleteOwnedClipFinderProject(ownerId: string, id: string): Promise<void> {
  if (!ownerId || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid project identity');
  const prefix = `projects/${id}/`;
  const existing = await d1Query<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM project_documents WHERE kind = 'clip-finder' AND id = ? LIMIT 1", [id],
  );
  if (!existing.success) throw new Error('Project catalog unavailable');
  if (existing.results[0]?.owner_user_id && existing.results[0].owner_user_id !== ownerId) throw new Error('Project not found');

  const otherDocuments = await d1Query<{ payload: string }>(
    "SELECT payload FROM project_documents WHERE kind = 'clip-finder' AND owner_user_id = ? AND id <> ?", [ownerId, id],
  );
  if (!otherDocuments.success) throw new Error('Project references could not be checked');
  const mentionsTarget = (value: unknown): boolean => {
    if (typeof value === 'string') {
      const normalized = value.replace(/\\\\/g, '/');
      return normalized.includes(`/${prefix}`) || normalized.startsWith(prefix) || normalized.includes(`/api/files/${prefix}`) || normalized.includes(`reelspark-storage:${prefix}`);
    }
    if (Array.isArray(value)) return value.some(mentionsTarget);
    if (value && typeof value === 'object') return Object.values(value).some(mentionsTarget);
    return false;
  };
  for (const row of otherDocuments.results) {
    if (mentionsTarget(JSON.parse(row.payload))) throw new Error('Project media is referenced by another saved project');
  }

  const now = new Date().toISOString();
  const tombstone = await d1Query(
    'INSERT INTO deleted_clip_finder_projects (project_id, owner_user_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO NOTHING',
    [id, ownerId, now],
  );
  if (!tombstone.success) throw new Error('Could not protect project deletion state');
  const fenced = await d1Query<{ owner_user_id: string }>('SELECT owner_user_id FROM deleted_clip_finder_projects WHERE project_id = ? LIMIT 1', [id]);
  if (!fenced.success || fenced.results[0]?.owner_user_id !== ownerId) throw new Error('Project deletion ownership could not be verified');

  const media = await d1Query<{ object_key: string; owner_user_id: string }>(
    'SELECT object_key, owner_user_id FROM private_media WHERE owner_user_id = ? AND substr(relative_path, 1, ?) = ?',
    [ownerId, prefix.length, prefix],
  );
  if (!media.success) throw new Error('Project media catalog unavailable');
  if (mediaLifecycleEnabled()) {
    for (const item of media.results) {
      if (!item.object_key.startsWith(`users/${mediaUserNamespace(ownerId)}/`)) throw new Error('Project media ownership could not be verified');
      const queued = await d1Query('INSERT OR IGNORE INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)', [item.object_key, ownerId, now]);
      if (!queued.success) throw new Error('Could not queue project media cleanup');
    }
  } else {
    for (const item of media.results) {
      if (!item.object_key.startsWith(`users/${mediaUserNamespace(ownerId)}/`)) throw new Error('Project media ownership could not be verified');
      await reservePrivateMediaOperation('class_a_ops');
      await deletePrivateObject(item.object_key);
    }
  }
  const removedCatalog = await d1Query(
    'DELETE FROM private_media WHERE owner_user_id = ? AND substr(relative_path, 1, ?) = ?', [ownerId, prefix.length, prefix],
  );
  if (!removedCatalog.success) throw new Error('Could not remove project media catalog entries');
  const removedDocument = await d1Query("DELETE FROM project_documents WHERE kind = 'clip-finder' AND id = ? AND owner_user_id = ?", [id, ownerId]);
  if (!removedDocument.success) throw new Error('Could not remove project metadata');
}

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
export async function cleanupUnusedMedia(
  dryRun = true,
  limit = 10,
  remove = deletePrivateObject,
  list = listPrivateObjects,
) {
  if (!mediaLifecycleEnabled()) throw new Error('Cloud lifecycle is not enabled');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Cleanup limit must be 1–10');
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const result = await d1Query<{ object_key: string; owner_user_id: string }>(
    `SELECT q.object_key, q.owner_user_id FROM media_cleanup_queue q
     WHERE q.created_at <= ? AND NOT EXISTS (
       SELECT 1 FROM private_media_upload_reservations r WHERE r.pending_object_key = q.object_key
     )
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
      if (active.results.length) {
        // Retire an upload's provisional marker without ever deleting live media.
        await d1Query('DELETE FROM media_cleanup_queue WHERE object_key = ? AND owner_user_id = ?', [row.object_key, row.owner_user_id]);
        continue;
      }
      await reservePrivateMediaOperation('class_a_ops');
      await remove(row.object_key);
      await d1Query('DELETE FROM media_cleanup_queue WHERE object_key = ? AND owner_user_id = ?', [row.object_key, row.owner_user_id]);
      removed++;
    } catch { failed++; }
  }

  // Reconcile old/untracked app objects left by a process crash or pre-catalog
  // deployment. Only exact random app keys past retention are eligible.
  let orphanCandidates = 0;
  const retentionDays = Number(process.env.STORAGE_ORPHAN_RETENTION_DAYS);
  const retentionMs = Math.max(1, Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30) * 24 * 60 * 60 * 1000;
  try {
    const cursorResult = await d1Query<{ cursor: string | null }>(
      "SELECT cursor FROM media_cleanup_state WHERE state_key = 'r2-orphan-scan' LIMIT 1",
    );
    if (!cursorResult.success) throw new Error('R2 orphan scan state unavailable');
    const cursor = cursorResult.results[0]?.cursor || undefined;
    await reservePrivateMediaOperation('class_a_ops');
    const page = await list(cursor, 1000);
    const savedCursor = await d1Query(
      `INSERT INTO media_cleanup_state (state_key, cursor, updated_at) VALUES ('r2-orphan-scan', ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
      [page.continuationToken || null, new Date().toISOString()],
    );
    if (!savedCursor.success) throw new Error('R2 orphan scan cursor could not be saved');
    const eligible = page.objects.filter(item => /^users\/[a-f0-9]{64}\/[a-f0-9-]{36}$/i.test(item.key) &&
      item.lastModified instanceof Date && Date.now() - item.lastModified.getTime() >= retentionMs).slice(0, limit);
    for (const item of eligible) {
      const refs = await d1Query(
        `SELECT 1 FROM private_media WHERE object_key = ?
         UNION ALL SELECT 1 FROM private_media_upload_reservations WHERE pending_object_key = ? LIMIT 1`,
        [item.key, item.key],
      );
      if (!refs.success) throw new Error('Private media reference check failed');
      if (refs.results.length) continue;
      orphanCandidates++;
      if (dryRun) continue;
      // Repeat the reference check immediately before physical deletion.
      const finalRefs = await d1Query(
        `SELECT 1 FROM private_media WHERE object_key = ?
         UNION ALL SELECT 1 FROM private_media_upload_reservations WHERE pending_object_key = ? LIMIT 1`,
        [item.key, item.key],
      );
      if (!finalRefs.success || finalRefs.results.length) { if (!finalRefs.success) failed++; continue; }
      await reservePrivateMediaOperation('class_a_ops');
      await remove(item.key);
      removed++;
    }
  } catch (error) {
    failed++;
    console.warn('[Private media] Orphan R2 reconciliation deferred:', error instanceof Error ? error.message : error);
  }
  return { dryRun, candidates: result.results.length + orphanCandidates, removed, failed };
}
