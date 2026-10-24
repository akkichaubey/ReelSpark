import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_CONFIG } from '../src/lib/config';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { backupPrivateMedia, restorePrivateMedia } from '../src/lib/cloudflare/private-media';
import { cleanupUnusedMedia, deleteOwnedClippingProject } from '../src/lib/cloudflare/media-lifecycle';
import { createBlankClippingProject } from '../src/lib/clipping-studio/local-persistence';
import { saveClippingDocument, listClippingDocuments, deleteClippingDocument } from '../src/lib/cloudflare/project-documents';
import { canReadMedia } from '../src/lib/media-access';

async function main() {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice'),('bob');");
  for (const migration of ['0001_project_documents', '0002_private_media', '0003_media_lifecycle']) db.exec(await fs.readFile(`src/lib/cloudflare/migrations/${migration}.sql`, 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-lifecycle-'));
  const oldRoot = APP_CONFIG.storageRoot;
  const oldFetch = globalThis.fetch;
  const keys = ['CLOUD_PROJECT_METADATA_ENABLED', 'CLOUD_PRIVATE_MEDIA_ENABLED', 'CLOUD_MEDIA_LIFECYCLE_ENABLED', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'] as const;
  const env = new Map(keys.map(key => [key, process.env[key]]));
  const objects = new Map<string, Buffer>();
  APP_CONFIG.storageRoot = root;
  try {
    for (const key of keys) process.env[key] = key.startsWith('CLOUD_') ? 'true' : 'fixture';
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
    await fs.writeFile(filename, 'first version');
    await backupPrivateMedia('alice', filename, put, remove);
    await fs.writeFile(filename, 'second version');
    await backupPrivateMedia('alice', filename, put, remove);
    assert.equal(objects.size, 2);
    db.prepare('UPDATE media_cleanup_queue SET created_at = ?').run(new Date(Date.now() - 7200000).toISOString());
    const preview = await cleanupUnusedMedia(true, 10, remove);
    assert.equal(preview.candidates, 1);
    assert.equal(objects.size, 2, 'Dry-run must not delete');
    const failed = await cleanupUnusedMedia(false, 10, async () => { throw new Error('R2 offline'); });
    assert.equal(failed.failed, 1);
    assert.equal((await cleanupUnusedMedia(false, 10, remove)).removed, 1);
    assert.equal(objects.size, 1, 'Current catalog object must survive cleanup');
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
    await deleteOwnedClippingProject('alice', project.id); // Retry after local/cloud metadata are gone.
    assert.equal((await cleanupUnusedMedia(false, 10, remove)).removed, 1);
    assert.equal(objects.size, 0);
    process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED = 'false';
    await assert.rejects(cleanupUnusedMedia(), /not enabled/);
    console.log('PASS: superseded-object inventory, dry-run, active object protection, retry, owner/shared-reference protection, tombstone fencing and durable project deletion');
  } finally {
    db.close(); APP_CONFIG.storageRoot = oldRoot; globalThis.fetch = oldFetch;
    for (const key of keys) { const value = env.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
