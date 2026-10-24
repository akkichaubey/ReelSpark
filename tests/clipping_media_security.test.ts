import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { APP_CONFIG } from '../src/lib/config';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { canReadMedia } from '../src/lib/media-access';
import { POST as transcribe } from '../src/app/api/caption-maker/transcribe/route';
import { POST as trim } from '../src/app/api/caption-maker/trim-fillers/route';
import { POST as probe } from '../src/app/api/clipping-studio/probe/route';
import { POST as bridge } from '../src/app/api/clipping-studio/bridge-caption/route';
import { POST as importMedia, PUT as relink } from '../src/app/api/clipping-studio/projects/[id]/media/route';
import { DELETE as deleteProject } from '../src/app/api/clipping-studio/projects/[id]/route';
import { POST as exportJob, GET as listJobs } from '../src/app/api/clipping-studio/export/route';

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-clipping-security-'));
  const oldRoot = APP_CONFIG.storageRoot;
  const oldDemo = process.env.ALLOW_DEMO_LOGIN;
  const oldRemote = process.env.REELSPARK_ALLOW_REMOTE;
  APP_CONFIG.storageRoot = root;
  const request = (body: unknown = {}, method = 'POST', origin?: string) => new NextRequest('http://localhost/api/test', {
    method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }),
  });
  const context = { params: Promise.resolve({ id: 'alice-project' }) };
  try {
    process.env.ALLOW_DEMO_LOGIN = 'false';
    for (const handler of [transcribe, trim, probe, bridge, exportJob]) assert.equal((await handler(request())).status, 401);
    assert.equal((await listJobs(request({}, 'GET'))).status, 401);
    assert.equal((await importMedia(request(), context)).status, 401);
    assert.equal((await relink(request({}, 'PUT'), context)).status, 401);
    assert.equal((await deleteProject(request({}, 'DELETE'), context)).status, 401);

    const alice = await clippingProjectAccess('usr_admin', 'alice-project', true);
    assert.ok(alice);
    assert.equal(await clippingProjectAccess('bob', 'alice-project', true), null);
    assert.equal(await clippingProjectAccess('usr_admin', '..', true), null);
    const legacy = path.join(root, 'clipping-studio', 'projects', 'legacy');
    await fs.mkdir(legacy);
    assert.equal(await clippingProjectAccess('usr_admin', 'legacy', true), null);
    const ownMedia = path.join(alice, 'owned.mp3');
    await fs.writeFile(ownMedia, 'private audio');
    assert.equal(await canReadMedia('usr_admin', ownMedia), true);
    assert.equal(await canReadMedia('bob', ownMedia), false);

    const bob = await clippingProjectAccess('bob', 'bob-project', true);
    assert.ok(bob);
    const otherMedia = path.join(bob, 'other.mp3');
    await fs.writeFile(otherMedia, 'other audio');
    process.env.ALLOW_DEMO_LOGIN = 'true';
    assert.equal((await trim(request({ storagePath: ownMedia, fillerSegments: [] }))).status, 200);
    assert.equal((await trim(request({ storagePath: otherMedia, fillerSegments: [] }))).status, 404);
    assert.equal((await transcribe(request({ storagePath: otherMedia }))).status, 404);
    assert.equal((await probe(request({ filePath: otherMedia }))).status, 404);
    assert.equal((await bridge(request({ sourcePath: otherMedia, clipId: 'clip', startMs: 0, endMs: 1000 }))).status, 404);
    assert.equal((await relink(request({ assetId: 'a', newPath: otherMedia }, 'PUT'), context)).status, 404);
    assert.equal((await deleteProject(request({}, 'DELETE'), { params: Promise.resolve({ id: 'bob-project' }) })).status, 404);
    assert.equal((await probe(request({}, 'POST', 'https://attacker.example'))).status, 403);
    process.env.REELSPARK_ALLOW_REMOTE = 'true';
    assert.equal((await exportJob(request({ args: ['unsafe'] }))).status, 400);
    console.log('PASS: anonymous guards, project ownership/legacy/traversal denial, cross-user read/relink/delete denial, owned trim, CSRF and public raw-export gate');
  } finally {
    APP_CONFIG.storageRoot = oldRoot;
    if (oldDemo === undefined) delete process.env.ALLOW_DEMO_LOGIN; else process.env.ALLOW_DEMO_LOGIN = oldDemo;
    if (oldRemote === undefined) delete process.env.REELSPARK_ALLOW_REMOTE; else process.env.REELSPARK_ALLOW_REMOTE = oldRemote;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
