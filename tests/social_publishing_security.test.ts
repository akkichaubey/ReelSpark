import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Node 24 provides SQLite; the project's existing Node 20 declaration package does not describe it.
const { DatabaseSync } = createRequire(path.join(process.cwd(), 'package.json'))('node:sqlite');

async function main() {
  Object.assign(process.env, { STORAGE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'reelspark-security-')), NODE_ENV: 'test' });
  delete process.env.CLOUDFLARE_API_TOKEN;
  const { APP_CONFIG, getFfmpegPath } = await import('../src/lib/config');
  const { mediaUserNamespace } = await import('../src/lib/media-access');
  const { createOAuthState, consumeOAuthState, safeOAuthReturnTo } = await import('../src/lib/social-intelligence/oauth-state');
  const { getPresignedVideoUrl, verifyMediaIngest } = await import('../src/lib/social-intelligence/media-presigner');
  const { resolvePublishingMedia, probePublishingVideo } = await import('../src/lib/social-intelligence/publishing-media');
  const { encryptToken } = await import('../src/lib/social-intelligence/token-encryption');
  const { publishingProgress } = await import('../src/lib/social-intelligence/publishing-progress');
  const store = await import('../src/lib/social-intelligence/storage');
  const { GET: readFile } = await import('../src/app/api/files/[...path]/route');
  const { POST: saveCredentials } = await import('../src/app/api/social-publishing/oauth/config/route');
  const { NextRequest } = await import('next/server');
  const { registerUser, loginUser } = await import('../src/lib/auth');

  const oauth = createOAuthState('alice', 'youtube', '/social-post');
  assert.throws(() => consumeOAuthState(oauth.cookie, oauth.state, 'bob', 'youtube'));
  assert.throws(() => consumeOAuthState(oauth.cookie, oauth.state, 'alice', 'threads'));
  const expired = JSON.parse(Buffer.from(oauth.cookie,'base64url').toString());
  expired.createdAt -= 700000;
  assert.throws(() => consumeOAuthState(Buffer.from(JSON.stringify(expired)).toString('base64url'),oauth.state,'alice','youtube'));
  assert.equal(consumeOAuthState(oauth.cookie,oauth.state,'alice','youtube'),'/social-post');
  assert.throws(() => consumeOAuthState(oauth.cookie,oauth.state,'alice','youtube'), 'Replayed state must fail');
  for (const value of ['https://evil.example','//evil.example','/\\evil.example','/\nevil.example']) assert.equal(safeOAuthReturnTo(value),'/social-post?tab=accounts');
  console.log('✓ OAuth state: owner, platform, expiry, replay and redirect checks');

  const relative = `caption-maker/renders/${mediaUserNamespace('alice')}/project/final.mp4`;
  const absolute = path.join(APP_CONFIG.storageRoot,relative);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  execFileSync(getFfmpegPath(),['-y','-f','lavfi','-i','color=c=black:s=180x320:r=10','-t','3','-c:v','libx264','-pix_fmt','yuv420p',absolute],{stdio:'ignore'});
  assert.equal(await resolvePublishingMedia('alice',relative),absolute);
  for (const unsafe of [absolute,'../.env.local',relative]) {
    await assert.rejects(resolvePublishingMedia('bob',unsafe));
  }
  const metadata = await probePublishingVideo('alice',relative);
  assert.equal(metadata.width,180); assert.equal(metadata.height,320); assert.ok(metadata.durationSeconds >= 3 && metadata.durationSeconds < 4);
  const signed = new URL(getPresignedVideoUrl(relative,'https://example.com','alice').url);
  assert.equal(verifyMediaIngest(signed,relative),'alice');
  assert.equal(verifyMediaIngest(signed,relative.replace('final','another')),null);
  const tampered = new URL(signed); tampered.searchParams.set('uid','bob'); assert.equal(verifyMediaIngest(tampered,relative),null);
  const expiredUrl = new URL(signed); expiredUrl.searchParams.set('expires','1'); assert.equal(verifyMediaIngest(expiredUrl,relative),null);
  const response = await readFile(new NextRequest(signed,{headers:{range:'bytes=0-9'}}),{params:Promise.resolve({path:relative.split('/')})});
  assert.equal(response.status,206); assert.equal((await response.arrayBuffer()).byteLength,10);
  assert.equal((await readFile(new NextRequest(tampered),{params:Promise.resolve({path:relative.split('/')})})).status,401);
  console.log('✓ Real video probe, cross-account/path denial, signed ingest and range streaming');

  delete process.env.OAUTH_ENCRYPTION_KEY; delete process.env.AUTH_SECRET;
  Object.assign(process.env,{NODE_ENV:'production'});
  assert.throws(() => encryptToken('secret'),/Configure OAUTH_ENCRYPTION_KEY/);
  Object.assign(process.env,{NODE_ENV:'test',OAUTH_ENCRYPTION_KEY:'test-only-encryption-key-at-least-32-chars'});

  const account = await registerUser({name:'Security Test',email:'security@example.test',password:'Test-password-123!'});
  assert.ok(account.user);
  const session = await loginUser({email:'security@example.test',password:'Test-password-123!'});
  const forbidden = await saveCredentials(new NextRequest('http://localhost/api/social-publishing/oauth/config',{method:'POST',headers:{cookie:`reelspark_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({platform:'threads',clientId:'bad',clientSecret:'bad'})}));
  assert.equal(forbidden.status,403);
  console.log('✓ Production refuses public encryption key; ordinary users cannot overwrite global OAuth apps');

  const now = new Date().toISOString();
  const job = {id:'job_security',userId:'alice',videoPath:relative,videoMetadata:metadata,publishOrigin:'https://example.com',
    publishOptions:{youtube:{title:'Private reel',description:'Description',privacyStatus:'private' as const,madeForKids:true}},
    showOtherSocialProfiles:false,status:'in_progress' as const,createdAt:now,updatedAt:now,
    platforms:[{id:'post_youtube_job_security',jobId:'job_security',userId:'alice',platform:'youtube' as const,postCaption:'Description',status:'pending' as const,progressPercent:0,retryCount:0,idempotencyKey:'security-youtube',createdAt:now,updatedAt:now}]};
  // Exercise the actual SQL against SQLite, with HTTP mocked. No Cloudflare account is contacted.
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'alice\')');
  database.exec(fs.readFileSync('src/lib/cloudflare/migrations/0004_social_publishing.sql','utf8'));
  Object.assign(process.env,{AUTH_URL:'https://example.com',CLOUDFLARE_ACCOUNT_ID:'test-account',CLOUDFLARE_D1_DATABASE_ID:'test-database',CLOUDFLARE_API_TOKEN:'test-token'});
  let uploadedPrivacy: string | undefined;
  let uploadCount = 0;
  globalThis.fetch = async (input,init) => {
    if (String(input).startsWith('https://www.googleapis.com/upload/youtube/')) {
      const metadata = JSON.parse(String(init?.body));
      uploadedPrivacy = metadata.status.privacyStatus;
      assert.equal(metadata.status.selfDeclaredMadeForKids,true);
      return new Response(null,{status:200,headers:{location:'https://upload.example.test/video'}});
    }
    if (String(input) === 'https://upload.example.test/video') {
      for await (const chunk of init?.body as any) assert.ok(chunk.length);
      uploadCount++;
      return Response.json({id:'uploaded-private-video'});
    }
    assert.ok(String(input).startsWith('https://api.cloudflare.com/'), 'No live platform network calls allowed');
    const {sql,params} = JSON.parse(String(init?.body));
    const statement = database.prepare(sql);
    const isRead = /^\s*SELECT/i.test(sql);
    const results = isRead ? statement.all(...params) : [];
    const changes = isRead ? 0 : Number(statement.run(...params).changes);
    return Response.json({success:true,result:[{success:true,results,meta:{changes}}]});
  };
  await store.createPublishingJob(job);
  // Simulate ephemeral disk loss: reads and updates must still work solely from D1.
  const cache = path.join(APP_CONFIG.storageRoot,'social_intelligence_store.json');
  if (fs.existsSync(cache)) fs.unlinkSync(cache);
  assert.equal((await store.getPublishingJob(job.id,'bob')),null);
  assert.equal((await store.getPublishingJob(job.id,'alice'))?.publishOptions?.youtube?.privacyStatus,'private');
  assert.equal(await store.claimPendingPublishingRecord(job.platforms[0].id,'alice'),true);
  assert.equal(await store.claimPendingPublishingRecord(job.platforms[0].id,'alice'),false);
  await store.updatePublishedPlatformRecord(job.platforms[0].id,{status:'failed',errorMessage:'Test failure'});
  assert.equal(await store.claimFailedPublishingRecord(job.platforms[0].id,'bob'),false);
  assert.equal(await store.claimFailedPublishingRecord(job.platforms[0].id,'alice'),true);
  assert.equal(await store.claimFailedPublishingRecord(job.platforms[0].id,'alice'),false);
  await store.updatePublishedPlatformRecord(job.platforms[0].id,{status:'published',platformPostId:'real-id',progressPercent:100});
  const complete = (await store.getPublishingHistory('alice'))[0];
  assert.equal(complete.status,'completed'); assert.equal(complete.platforms[0].platformPostId,'real-id');
  assert.equal(publishingProgress(complete,'all').done,true);
  assert.equal(publishingProgress({...complete,platforms:[{...complete.platforms[0],status:'pending'}]},'all').done,false);
  assert.equal((await store.getPublishingHistory('bob')).length,0);
  await store.saveOAuthConnection({id:'oauth_yt_alice',userId:'alice',platform:'youtube',platformUserId:'channel',accountName:'Alice',accessToken:encryptToken('test-access-token'),scope:'youtube.upload',metadata:{},status:'connected',createdAt:now,updatedAt:now});
  await store.updatePublishedPlatformRecord(job.platforms[0].id,{status:'failed',errorMessage:'Retry fixture'});
  const { retryPlatformPublish } = await import('../src/lib/social-intelligence/publisher-dispatcher');
  const retries = await Promise.allSettled([retryPlatformPublish('alice','https://example.com',job.platforms[0].id),retryPlatformPublish('alice','https://example.com',job.platforms[0].id)]);
  assert.equal(retries.filter(r => r.status === 'fulfilled').length,1);
  for (let i = 0; i < 100; i++) {
    if ((await store.getPublishingJob(job.id,'alice'))?.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve,30));
  }
  assert.equal(uploadedPrivacy,'private'); assert.equal(uploadCount,1);
  assert.equal((await store.getPublishingJob(job.id,'alice'))?.status,'completed');
  database.prepare("UPDATE social_published_posts SET status = 'uploading', updated_at = ? WHERE id = ?").run(new Date(Date.now()-700000).toISOString(),job.platforms[0].id);
  await store.markInterruptedPublishingRecords();
  assert.match((await store.getPublishingJob(job.id,'alice'))!.platforms[0].errorMessage!,/interrupted/);
  assert.equal(uploadCount,1,'Interrupted records must not automatically upload again');
  database.close();
  console.log('✓ D1-only recovery, actual private retry payload, duplicate retry prevention, interrupted job recovery, owner-isolated history and UI progress');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
