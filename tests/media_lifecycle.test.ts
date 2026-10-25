import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { APP_CONFIG } from '../src/lib/config';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { backupPrivateMedia, restorePrivateMedia } from '../src/lib/cloudflare/private-media';
import { cleanupUnusedMedia, deleteOwnedClipFinderProject, deleteOwnedClippingProject } from '../src/lib/cloudflare/media-lifecycle';
import { createBlankClippingProject } from '../src/lib/clipping-studio/local-persistence';
import { saveClippingDocument, listClippingDocuments, deleteClippingDocument } from '../src/lib/cloudflare/project-documents';
import { canReadMedia, mediaUserNamespace } from '../src/lib/media-access';
import { deleteProject, getProjectDirs, listProjects, loadProject, saveProject } from '../src/lib/storage';
import type { Project } from '../src/lib/types';

async function main() {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice'),('bob');");
  for (const migration of ['0001_project_documents', '0002_private_media', '0003_media_lifecycle', '0005_private_media_quotas', '0006_reservation_object_fencing', '0007_clip_finder_deletion_fence', '0008_media_cleanup_scan_cursor']) db.exec(await fs.readFile(`src/lib/cloudflare/migrations/${migration}.sql`, 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-lifecycle-'));
  const oldRoot = APP_CONFIG.storageRoot;
  const oldProjectsDir = APP_CONFIG.projectsDir;
  const oldTempDir = APP_CONFIG.tempDir;
  const oldFetch = globalThis.fetch;
  const keys = ['CLOUD_PROJECT_METADATA_ENABLED', 'CLOUD_PRIVATE_MEDIA_ENABLED', 'CLOUD_MEDIA_LIFECYCLE_ENABLED', 'CLOUD_R2_STORAGE_LIMIT_BYTES', 'CLOUD_R2_CLASS_A_LIMIT', 'CLOUD_R2_CLASS_B_LIMIT', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'] as const;
  const env = new Map(keys.map(key => [key, process.env[key]]));
  const objects = new Map<string, Buffer>();
  APP_CONFIG.storageRoot = root;
  APP_CONFIG.projectsDir = path.join(root, 'projects');
  APP_CONFIG.tempDir = path.join(root, 'temp');
  try {
    for (const key of keys) {
      if (key === 'CLOUD_PROJECT_METADATA_ENABLED' || key === 'CLOUD_PRIVATE_MEDIA_ENABLED' || key === 'CLOUD_MEDIA_LIFECYCLE_ENABLED') process.env[key] = 'true';
      else if (key.startsWith('CLOUD_R2_')) process.env[key] = key === 'CLOUD_R2_STORAGE_LIMIT_BYTES' ? '8000000000' : key === 'CLOUD_R2_CLASS_A_LIMIT' ? '800000' : '8000000';
      else process.env[key] = 'fixture';
    }
    globalThis.fetch = async (_input, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      return Response.json({ success: true, result: [{ success: true, results: db.prepare(sql).all(...params) }] });
    };
    const project = { ...createBlankClippingProject('Private project'), id: 'project' };
    const directory = await clippingProjectAccess('alice', project.id, true);
    assert.ok(directory);
    await saveClippingDocument('alice', project);
    const filename = path.join(directory, 'source.mp3');
    const put = async (key: string, file: string) => { objects.set(key, await fs.readFile(file)); };
    const remove = async (key: string) => { objects.delete(key); };
    const get = async (key: string) => { assert.ok(objects.has(key)); return Readable.from([objects.get(key)!]); };
    const noObjects = async () => ({ objects: [] as Array<{ key: string; lastModified?: Date }> });
    await fs.writeFile(filename, 'first version');
    await backupPrivateMedia('alice', filename, put, remove);
    await fs.writeFile(filename, 'second version');
    await backupPrivateMedia('alice', filename, put, remove);
    assert.equal(objects.size, 2);
    db.prepare('UPDATE media_cleanup_queue SET created_at = ?').run(new Date(Date.now() - 7200000).toISOString());
    const preview = await cleanupUnusedMedia(true, 10, remove, noObjects);
    assert.equal(preview.candidates, 1);
    assert.equal(objects.size, 2, 'Dry-run must not delete');
    const failed = await cleanupUnusedMedia(false, 10, async () => { throw new Error('R2 offline'); }, noObjects);
    assert.equal(failed.failed, 1);
    assert.equal((await cleanupUnusedMedia(false, 10, remove, noObjects)).removed, 1);
    assert.equal(objects.size, 1, 'Current catalog object must survive cleanup');
    const protectedKey = `users/${mediaUserNamespace('alice')}/active-upload`;
    objects.set(protectedKey, Buffer.from('active upload'));
    db.prepare('INSERT INTO media_cleanup_queue (object_key, owner_user_id, created_at) VALUES (?, ?, ?)').run(protectedKey, 'alice', new Date(Date.now() - 7200000).toISOString());
    db.prepare('INSERT INTO private_media_upload_reservations (relative_path, owner_user_id, reserved_bytes, pending_object_key, started_at) VALUES (?, ?, ?, ?, ?)').run('caption-maker/active-upload.mp3', 'alice', 13, protectedKey, new Date().toISOString());
    assert.equal((await cleanupUnusedMedia(false, 10, remove, noObjects)).candidates, 0, 'An active upload reservation must fence R2 cleanup');
    assert.equal(objects.has(protectedKey), true);
    db.prepare('DELETE FROM private_media_upload_reservations WHERE relative_path = ?').run('caption-maker/active-upload.mp3');
    assert.equal((await cleanupUnusedMedia(false, 10, remove, noObjects)).removed, 1, 'Abandoned queued uploads become cleanable after their reservation is gone');
    objects.delete(protectedKey);
    await assert.rejects(deleteOwnedClippingProject('bob', project.id), /Project not found/);
    assert.equal(await canReadMedia('alice', filename), true);
    const shared = { ...createBlankClippingProject('References original'), id: 'shared', mediaAssets: [{
      id: 'asset', projectId: 'shared', filename: 'source.mp3', localPath: filename, fileSizeBytes: 14,
      createdAt: new Date().toISOString(), metadata: { durationSeconds: 1, durationMs: 1000, sizeBytes: 14, formatName: 'mp3', aspectRatio: 'Audio', hasVideo: false, hasAudio: true },
    }] };
    await saveClippingDocument('alice', shared);
    await assert.rejects(deleteOwnedClippingProject('alice', project.id), /referenced by another/);
    await deleteClippingDocument('alice', shared.id);
    await deleteOwnedClippingProject('alice', project.id);
    assert.equal((await listClippingDocuments('alice')).length, 0);
    assert.equal(await clippingProjectAccess('alice', project.id, true), null);
    assert.equal(await restorePrivateMedia('alice', filename, async () => { throw new Error('Must not download'); }), false);
    await assert.rejects(saveClippingDocument('alice', project), /ownership conflict/);
    await assert.rejects(backupPrivateMedia('alice', filename, put, remove), /ownership/);

    const clipFinderProject: Project = {
      ownerUserId: 'alice', id: 'persistent_clip_finder', title: 'Persistent project', sourceType: 'upload' as const,
      status: 'COMPLETED' as const, progress: 100, statusMessage: 'Ready',
      settings: { durationLimit: '60' as const, aspectRatio: 'original' as const, normalizeAudio: true, burnSubtitles: false,
        subtitleStyle: { fontSize: 32, fontColor: '#FFFFFF', outlineColor: '#000000', outlineWidth: 2, verticalPosition: 'bottom' as const, alignment: 'center' as const } },
      timelineCoverage: { analyzedSeconds: 0, totalSeconds: 0, coveragePercent: 0, ranges: [] }, transcript: [], candidates: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const projectDirs = getProjectDirs(clipFinderProject.id);
    const sourceVideo = path.join(projectDirs.originalDir, 'source.mp4');
    await fs.writeFile(sourceVideo, 'persistent synthetic video');
    clipFinderProject.localVideoPath = sourceVideo;
    await saveProject(clipFinderProject);
    await backupPrivateMedia('alice', sourceVideo, put, remove);
    assert.equal((await listProjects('alice')).some(item => item.id === clipFinderProject.id), true);
    await fs.rm(projectDirs.rootDir, { recursive: true, force: true });
    const recoveredProject = await loadProject(clipFinderProject.id);
    assert.equal(recoveredProject?.ownerUserId, 'alice', 'D1 restores the project manifest after ephemeral disk loss');
    assert.equal(await restorePrivateMedia('alice', sourceVideo, get), true, 'The original upload is recovered from private R2');
    assert.equal(await fs.readFile(sourceVideo, 'utf8'), 'persistent synthetic video');
    assert.equal(await restorePrivateMedia('bob', sourceVideo, get), false, 'Another user cannot restore project media');
    assert.equal(await deleteProject(clipFinderProject.id), true);
    assert.equal((await listProjects('alice')).some(item => item.id === clipFinderProject.id), false);
    assert.equal(await loadProject(clipFinderProject.id), null, 'Deletion fence prevents stale local project resurrection');
    db.prepare('UPDATE media_cleanup_queue SET created_at = ?').run(new Date(Date.now() - 7200000).toISOString());
    await cleanupUnusedMedia(false, 10, remove, noObjects);
    assert.equal(objects.size, 0, 'Deleting a project queues its cloud source for cleanup');

    await deleteOwnedClippingProject('alice', project.id); // Retry after local/cloud metadata are gone.
    db.prepare('UPDATE media_cleanup_queue SET created_at = ?').run(new Date(Date.now() - 7200000).toISOString());
    assert.equal((await cleanupUnusedMedia(false, 10, remove, noObjects)).removed, 0);
    assert.equal(objects.size, 0);
    const orphanKey = `users/${mediaUserNamespace('alice')}/11111111-1111-4111-8111-111111111111`;
    objects.set(orphanKey, Buffer.from('untracked orphan'));
    const orphanReport = await cleanupUnusedMedia(false, 10, remove, async () => ({
      objects: [{ key: orphanKey, lastModified: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }],
    }));
    assert.equal(orphanReport.removed, 1, 'Old, unreferenced private R2 objects are reconciled');
    assert.equal(objects.has(orphanKey), false);
    process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED = 'false';
    await assert.rejects(cleanupUnusedMedia(), /not enabled/);
    console.log('PASS: superseded-object inventory, dry-run, active object protection, retry, owner/shared-reference protection, tombstone fencing and durable project deletion');
  } finally {
    db.close(); APP_CONFIG.storageRoot = oldRoot; APP_CONFIG.projectsDir = oldProjectsDir; APP_CONFIG.tempDir = oldTempDir; globalThis.fetch = oldFetch;
    for (const key of keys) { const value = env.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
