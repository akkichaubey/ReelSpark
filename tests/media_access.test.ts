import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { APP_CONFIG } from '../src/lib/config';
import { canReadMedia, mediaUserNamespace, recordMediaOwner } from '../src/lib/media-access';
import { GET } from '../src/app/api/files/[...path]/route';
import { POST as upload } from '../src/app/api/caption-maker/upload/route';

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-media-access-'));
  const previousRoot = APP_CONFIG.storageRoot;
  const previousDemo = process.env.ALLOW_DEMO_LOGIN;
  APP_CONFIG.storageRoot = root;
  try {
    const directory = path.join(root, 'caption-maker', 'asset_fixture');
    await fs.mkdir(directory, { recursive: true });
    await recordMediaOwner(directory, 'usr_admin');
    await assert.rejects(recordMediaOwner(directory, 'bob'), /different account/);
    const media = path.join(directory, 'sample.mp3');
    await fs.writeFile(media, '0123456789');
    assert.equal(await canReadMedia('usr_admin', media), true);
    assert.equal(await canReadMedia('bob', media), false);
    assert.equal(await canReadMedia('usr_admin', path.join(directory, '.owner.json')), false);
    assert.equal(await canReadMedia('usr_admin', path.join(root, '..', 'outside')), false);

    const project = path.join(root, 'projects', 'p');
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(path.join(project, 'manifest.json'), JSON.stringify({ ownerUserId: 'alice' }));
    await fs.writeFile(path.join(project, 'movie.mp4'), 'video');
    assert.equal(await canReadMedia('alice', path.join(project, 'movie.mp4')), true);
    assert.equal(await canReadMedia('bob', path.join(project, 'movie.mp4')), false);
    const output = path.join(root, 'caption-maker', 'renders', mediaUserNamespace('alice'), 'reel', 'video.mp4');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, 'render');
    assert.equal(await canReadMedia('alice', output), true);
    assert.equal(await canReadMedia('bob', output), false);

    const context = { params: Promise.resolve({ path: ['caption-maker', 'asset_fixture', 'sample.mp3'] }) };
    const url = 'http://localhost/api/files/caption-maker/asset_fixture/sample.mp3';
    process.env.ALLOW_DEMO_LOGIN = 'false';
    assert.equal((await GET(new NextRequest(url), context)).status, 401);
    assert.equal((await upload(new NextRequest('http://localhost/api/caption-maker/upload', { method: 'POST' }))).status, 401);
    process.env.ALLOW_DEMO_LOGIN = 'true';
    const partial = await GET(new NextRequest(url, { headers: { range: 'bytes=2-4' } }), context);
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), '234');
    assert.equal(partial.headers.get('cache-control'), 'private, no-store');
    const suffix = await GET(new NextRequest(url, { headers: { range: 'bytes=-3' } }), context);
    assert.equal(await suffix.text(), '789');
    for (const range of ['bytes=20-', 'bytes=4-2', 'bytes=-0', 'bytes=1-2,4-5', 'garbage']) {
      assert.equal((await GET(new NextRequest(url, { headers: { range } }), context)).status, 416);
    }
    const blocked = await upload(new NextRequest('http://localhost/api/caption-maker/upload', {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    }));
    assert.equal(blocked.status, 403);
    console.log('PASS: owner isolation, immutable ownership, project/render namespaces, anonymous upload/download, origin checks and range handling');
  } finally {
    APP_CONFIG.storageRoot = previousRoot;
    if (previousDemo === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = previousDemo;
    // Delete only this test's generated fixture directory.
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
