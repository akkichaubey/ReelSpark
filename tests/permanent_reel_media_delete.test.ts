import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { APP_CONFIG } from '../src/lib/config';
import { recordMediaOwner } from '../src/lib/media-access';
import { registerStorageTask } from '../src/lib/storage-runtime';
import { DELETE } from '../src/app/api/caption-maker/media/route';

async function main() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reelspark-delete-media-'));
  const originalRoot=APP_CONFIG.storageRoot;
  const originalDemo=process.env.ALLOW_DEMO_LOGIN;
  const originalCloud=process.env.CLOUD_PRIVATE_MEDIA_ENABLED;
  APP_CONFIG.storageRoot=root;
  process.env.CLOUD_PRIVATE_MEDIA_ENABLED='false';
  const call=(fileUrl:string,origin='http://localhost')=>DELETE(new NextRequest('http://localhost/api/caption-maker/media',{
    method:'DELETE',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({fileUrl}),
  }));
  try {
    const directory=path.join(root,'caption-maker','asset_delete_fixture');
    await recordMediaOwner(directory,'usr_admin');
    await fs.writeFile(path.join(directory,'video.mp4'),'fixture video');
    await fs.writeFile(path.join(directory,'audio.wav'),'fixture extracted audio');
    const url='/api/files/caption-maker/asset_delete_fixture/video.mp4';
    process.env.ALLOW_DEMO_LOGIN='false';
    assert.equal((await call(url)).status,401);
    process.env.ALLOW_DEMO_LOGIN='true';
    assert.equal((await call(url,'https://outside.example')).status,403);
    assert.equal((await call('/sample-image.jpg')).status,400);
    assert.equal((await call('/api/files/caption-maker/asset_delete_fixture/.owner.json')).status,400);
    assert.equal((await call('/api/files/projects/manifest.json')).status,400);
    const other=path.join(root,'caption-maker','asset_other');
    await recordMediaOwner(other,'another-user');
    await fs.writeFile(path.join(other,'image.jpg'),'other media');
    assert.equal((await call('/api/files/caption-maker/asset_other/image.jpg')).status,403);
    const finish=registerStorageTask({id:'delete-test',ownerId:'usr_admin',kind:'render',paths:[directory]});
    assert.equal((await call(url)).status,409);
    finish();
    const response=await call(url);
    assert.equal(response.status,200);
    assert.equal((await response.json()).deletedUrls.length,2);
    await assert.rejects(fs.stat(path.join(directory,'video.mp4')), {code:'ENOENT'});
    await assert.rejects(fs.stat(path.join(directory,'audio.wav')), {code:'ENOENT'});
    assert.equal(await fs.readFile(path.join(other,'image.jpg'),'utf8'),'other media');
    console.log('PASS: permanent original/extracted-audio deletion; auth, origin, ownership, active-job and metadata protection');
  } finally {
    APP_CONFIG.storageRoot=originalRoot;
    if(originalDemo===undefined) delete process.env.ALLOW_DEMO_LOGIN; else process.env.ALLOW_DEMO_LOGIN=originalDemo;
    if(originalCloud===undefined) delete process.env.CLOUD_PRIVATE_MEDIA_ENABLED; else process.env.CLOUD_PRIVATE_MEDIA_ENABLED=originalCloud;
    // Only the test-created, resolved temporary directory is removed.
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    await fs.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
