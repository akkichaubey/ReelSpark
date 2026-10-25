import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { APP_CONFIG } from '../src/lib/config';
import { backupPrivateMedia, restorePrivateMedia } from '../src/lib/cloudflare/private-media';
import { cleanupUnusedMedia } from '../src/lib/cloudflare/media-lifecycle';
import { recordMediaOwner, canReadMedia } from '../src/lib/media-access';

async function main() {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'alice\'), (\'bob\');');
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0002_private_media.sql', 'utf8'));
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0003_media_lifecycle.sql', 'utf8'));
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0005_private_media_quotas.sql', 'utf8'));
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0006_reservation_object_fencing.sql', 'utf8'));
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0007_clip_finder_deletion_fence.sql', 'utf8'));
  db.exec(await fs.readFile('src/lib/cloudflare/migrations/0008_media_cleanup_scan_cursor.sql', 'utf8'));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-private-media-'));
  const root = path.join(fixture, 'storage');
  const oldRoot = APP_CONFIG.storageRoot;
  const oldFetch = globalThis.fetch;
  const keys = ['CLOUD_PRIVATE_MEDIA_ENABLED', 'CLOUD_MEDIA_LIFECYCLE_ENABLED', 'CLOUD_R2_STORAGE_LIMIT_BYTES', 'CLOUD_R2_CLASS_A_LIMIT', 'CLOUD_R2_CLASS_B_LIMIT', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'] as const;
  const env = new Map(keys.map(key => [key, process.env[key]]));
  const objects = new Map<string, Buffer>();
  APP_CONFIG.storageRoot = root;
  try {
    for (const key of keys) process.env[key] = key === 'CLOUD_PRIVATE_MEDIA_ENABLED' || key === 'CLOUD_MEDIA_LIFECYCLE_ENABLED' ? 'true' : 'fixture';
    globalThis.fetch = async (_input, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      return Response.json({ success: true, result: [{ success: true, results: db.prepare(sql).all(...params) }] });
    };
    const assetDir = path.join(root, 'caption-maker', 'asset_fixture');
    await fs.mkdir(assetDir, { recursive: true });
    await recordMediaOwner(assetDir, 'alice');
    const filename = path.join(assetDir, 'original.mp3');
    await fs.writeFile(filename, 'private synthetic audio');
    const put = async (key: string, source: string) => { objects.set(key, await fs.readFile(source)); };
    const noObjects = async () => ({ objects: [] as Array<{ key: string; lastModified?: Date }> });
    let downloads = 0;
    const get = async (key: string) => { downloads++; assert.ok(objects.has(key)); return Readable.from([objects.get(key)!]); };
    assert.equal(await backupPrivateMedia('alice', filename, put), true);
    await assert.rejects(backupPrivateMedia('bob', filename, put), /ownership/);
    // Simulate loss of the complete local processing cache, not just the file.
    await fs.rm(root, { recursive: true, force: true });
    assert.equal(await restorePrivateMedia('bob', filename, get), false);
    assert.equal(downloads, 0);
    assert.equal(await restorePrivateMedia('alice', filename, get), true);
    assert.equal(await fs.readFile(filename, 'utf8'), 'private synthetic audio');
    assert.equal(await canReadMedia('alice', filename), true);
    assert.equal(await canReadMedia('bob', filename), false);
    await fs.unlink(filename);
    await assert.rejects(restorePrivateMedia('alice', filename, async () => Readable.from(['corrupt'])), /integrity/);
    assert.equal((await fs.readdir(assetDir)).some(name => name.startsWith('.restore-')), false);
    await assert.rejects(restorePrivateMedia('alice', path.join(root, '..', 'escape.mp3'), get), /traversal/);
    globalThis.fetch = async () => { throw new Error('Catalog unavailable'); };
    await assert.rejects(restorePrivateMedia('alice', filename, get), /Catalog unavailable/);
    await fs.writeFile(filename, 'local file must survive a failed backup');
    let rollback = false;
    globalThis.fetch = async (_input, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      if (/INSERT INTO private_media\s*\(/.test(String(sql))) throw new Error('Catalog unavailable');
      return Response.json({ success: true, result: [{ success: true, results: db.prepare(sql).all(...params) }] });
    };
    await assert.rejects(backupPrivateMedia('alice', filename, put, async key => { rollback = objects.delete(key); }), /catalog save failed/);
    assert.equal(rollback, false); // Lifecycle mode queues the failed object for delayed cleanup.
    db.prepare('UPDATE media_cleanup_queue SET created_at = ?').run(new Date(Date.now() - 7200000).toISOString());
    assert.equal((await cleanupUnusedMedia(false, 10, async key => { rollback = objects.delete(key); }, noObjects)).removed, 1);
    assert.equal(rollback, true);
    assert.equal(await fs.readFile(filename, 'utf8'), 'local file must survive a failed backup');
    globalThis.fetch = async (_input, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      return Response.json({ success: true, result: [{ success: true, results: db.prepare(sql).all(...params) }] });
    };
    process.env.CLOUD_R2_CLASS_A_LIMIT = '0';
    let quotaPutCalled = false;
    await assert.rejects(backupPrivateMedia('alice', filename, async () => { quotaPutCalled = true; }), /safe monthly free-tier request limit/);
    assert.equal(quotaPutCalled, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM private_media_upload_reservations').get().count, 0);
    process.env.CLOUD_R2_CLASS_A_LIMIT = '800000';
    process.env.CLOUD_R2_STORAGE_LIMIT_BYTES = '0';
    const secondFilename = path.join(assetDir, 'over-limit.mp3');
    await fs.writeFile(secondFilename, 'synthetic over-limit audio');
    await assert.rejects(backupPrivateMedia('alice', secondFilename, async () => { quotaPutCalled = true; }), /safe monthly free-tier limit/);
    assert.equal(quotaPutCalled, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM private_media_upload_reservations').get().count, 0);
    await fs.rm(secondFilename, { force: true });
    process.env.CLOUD_R2_STORAGE_LIMIT_BYTES = '8000000000';
    process.env.CLOUD_R2_CLASS_B_LIMIT = '0';
    const downloadsBeforeLimit = downloads;
    await assert.rejects(restorePrivateMedia('alice', filename, get), /safe monthly free-tier request limit/);
    assert.equal(downloads, downloadsBeforeLimit);
    process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'false';
    assert.equal(await backupPrivateMedia('alice', filename, put), false);
    assert.equal(await restorePrivateMedia('alice', filename, get), false);
    console.log('PASS: private backup, user isolation, cache recovery, checksum/traversal protection, failed upload rollback, quota enforcement and disabled mode');
  } finally {
    db.close(); APP_CONFIG.storageRoot = oldRoot; globalThis.fetch = oldFetch;
    for (const key of keys) { const value = env.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
