// Requires npm run build. Starts an isolated Node production server; never contacts live providers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'reelspark-http-'));
  const now = new Date().toISOString();
  const record = { id:'post_youtube_job_startup', jobId:'job_startup', userId:'fixture-owner', platform:'youtube', postCaption:'Startup recovery fixture', status:'pending', progressPercent:0, retryCount:0, idempotencyKey:'startup-fixture', createdAt:now, updatedAt:now };
  fs.writeFileSync(path.join(storage,'social_intelligence_store.json'), JSON.stringify({ profiles:{},accounts:[],preferences:{},oauthConnections:[],publishedPosts:[record],publishingJobs:[{id:'job_startup',userId:'fixture-owner',videoPath:'caption-maker/renders/missing/project/final.mp4',videoMetadata:{},status:'queued',publishOrigin:'https://fixture.onrender.com',platforms:[record],createdAt:now,updatedAt:now}]}));
  const base = `http://127.0.0.1:${port}`;
  const origin = 'https://fixture.onrender.com';
  const child = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)], {
    windowsHide:true,
    env:{...process.env,NODE_ENV:'production',STORAGE_DIR:storage,AUTH_URL:'',RENDER:'true',RENDER_EXTERNAL_URL:origin,
      OAUTH_ENCRYPTION_KEY:'http-smoke-fixture-key-at-least-32-characters',ALLOW_DEMO_LOGIN:'false',
      GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret',GEMINI_API_KEY:'',
      CLOUDFLARE_ACCOUNT_ID:'',CLOUDFLARE_D1_DATABASE_ID:'',CLOUDFLARE_API_TOKEN:'',
      CLOUD_PROJECT_METADATA_ENABLED:'false',CLOUD_PRIVATE_MEDIA_ENABLED:'false',CLOUD_MEDIA_LIFECYCLE_ENABLED:'false'},
    stdio:['ignore','pipe','pipe'],
  });
  let logs = '';
  child.stdout.on('data',data => { logs = (logs + data).slice(-8000); });
  child.stderr.on('data',data => { logs = (logs + data).slice(-8000); });
  const request = (route,init = {}) => fetch(base + route,{...init,signal:AbortSignal.timeout(15000)});
  try {
    let ready = false;
    for (let i=0;i<80;i++) {
      if (child.exitCode !== null) throw new Error('Production server exited before startup');
      try { if ((await request('/api/social-publishing/status')).status === 401) { ready = true; break; } } catch {}
      await delay(250);
    }
    assert.ok(ready,'Production server did not start');
    assert.equal((await request('/reel-maker')).status,200);
    assert.equal((await request('/social-post')).status,200);
    const register = await request('/api/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'Smoke User',email:'smoke@example.test',password:'fixture-password-123'})});
    assert.equal(register.status,200);
    const cookieHeader = register.headers.get('set-cookie');
    assert.match(cookieHeader,/HttpOnly/i); assert.match(cookieHeader,/Secure/i);
    const cookie = cookieHeader.split(';')[0];
    const diagnostics = await (await request('/api/social-publishing/status',{headers:{cookie}})).json();
    assert.equal(diagnostics.runtime.origin,origin);
    assert.equal(diagnostics.runtime.environment,'production');
    assert.equal(diagnostics.runtime.encryptionReady,true);
    assert.equal(diagnostics.runtime.configurationReady,false,'Ephemeral storage must not be reported durable');
    const connect = await (await request('/api/social-publishing/oauth/youtube/connect',{headers:{cookie,accept:'application/json'}})).json();
    assert.equal(connect.success,true);
    assert.equal(new URL(connect.url).searchParams.get('redirect_uri'),origin+'/api/social-publishing/oauth/youtube/callback');
    const login = await request('/api/auth/google',{redirect:'manual'});
    assert.equal(new URL(login.headers.get('location')).searchParams.get('redirect_uri'),origin+'/api/auth/google/callback');
    assert.equal((await request('/api/auth/logout',{method:'POST',headers:{cookie,origin:'https://evil.example'}})).status,403);
    for(let i=0;i<40;i++) {
      const stored = JSON.parse(fs.readFileSync(path.join(storage,'social_intelligence_store.json'),'utf8'));
      if(stored.publishedPosts[0].status === 'failed') break;
      await delay(100);
    }
    const recovered = JSON.parse(fs.readFileSync(path.join(storage,'social_intelligence_store.json'),'utf8')).publishedPosts[0];
    assert.equal(recovered.status,'failed','Instrumentation must automatically process the saved pending fixture');
    assert.match(recovered.errorMessage,/not found|not owned/);
    assert.equal((await request('/api/auth/logout',{method:'POST',headers:{cookie,origin}})).status,200);
    assert.equal((await request('/api/social-publishing/status',{headers:{cookie}})).status,401);
    console.log('PASS: isolated production HTTP startup, automatic worker recovery, pages, account/session, Render URL detection, callback URLs, CSRF and honest storage diagnostics');
  } catch(error) {
    console.error(logs); throw error;
  } finally {
    child.kill();
    await new Promise(resolve => { if(child.exitCode !== null) resolve(); else { child.once('exit',resolve); setTimeout(resolve,5000).unref(); } });
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
