import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { accountCache, setCacheAccount } from '../src/lib/account-cache';
import { createBlankClippingProject, saveProjectLocally, loadProjectsLocally } from '../src/lib/clipping-studio/local-persistence';
import { GET as settingsGet, POST as settingsPost } from '../src/app/api/settings/route';
import { GET as systemGet } from '../src/app/api/system/route';
import { POST as support } from '../src/app/api/support/route';
import { GET as health } from '../src/app/api/clipping-studio/health/route';
import { POST as cleanup } from '../src/app/api/admin/media-cleanup/route';
import { createDefaultCaptionProject, createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { cleanBundledSampleProject } from '../src/lib/caption-maker/clean-sample-project';
import { createDefaultThumbnailSettings } from '../src/lib/caption-maker/thumbnail-presets';

async function main() {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldFetch = globalThis.fetch;
  const keys = ['ALLOW_DEMO_LOGIN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'] as const;
  const oldEnv = new Map(keys.map(key => [key, process.env[key]]));
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  const req = (method = 'GET', body?: unknown, origin?: string, token?: string) => new NextRequest('http://localhost/api/settings', {
    method, headers: { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const blankReel = createEmptyCaptionProject();
    assert.deepEqual(blankReel.transcript, []);
    assert.deepEqual(blankReel.captionGroups, []);
    assert.equal(blankReel.audio, undefined);
    assert.equal(blankReel.image, undefined);
    const blankCover = createDefaultThumbnailSettings(blankReel.title);
    assert.equal(blankCover.title, '');
    assert.equal(blankCover.subtitle, '');
    assert.equal(blankCover.badgeText, '');
    assert.equal(blankCover.badgeEnabled, false);
    assert.equal(blankReel.captionStyle.showSafeArea, false);
    assert.equal(blankCover.showSafeArea, false);
    const demo = createDefaultCaptionProject();
    assert.deepEqual(cleanBundledSampleProject(demo).transcript, []);
    assert.equal(cleanBundledSampleProject(demo).audio, undefined);
    const uploaded = { ...demo, audio: { ...demo.audio!, id: 'uploaded', fileUrl: '/api/files/my-audio.mp3' } };
    assert.equal(cleanBundledSampleProject(uploaded), uploaded);
    const edited = { ...demo, title: 'My own reel' };
    assert.equal(cleanBundledSampleProject(edited), edited);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
    storage.setItem('reel_caption_project_v2', 'legacy-private-data');
    setCacheAccount(null);
    assert.equal(accountCache.getItem('reel_caption_project_v2'), null);
    setCacheAccount('alice');
    accountCache.setItem('reel_caption_project_v2', 'alice-draft');
    const privateKeys = ['reel_custom_bgm_tracks', 'reel_custom_style_presets', 'reel_social_post_context', 'reelspark_user_gemini_key'];
    for (const privateKey of privateKeys) accountCache.setItem(privateKey, 'alice-only');
    const project = createBlankClippingProject('Alice private');
    assert.equal(saveProjectLocally(project), true);
    assert.equal(loadProjectsLocally().length, 1);
    setCacheAccount('bob');
    for (const privateKey of privateKeys) assert.equal(accountCache.getItem(privateKey), null);
    assert.equal(accountCache.getItem('reel_caption_project_v2'), null);
    assert.equal(loadProjectsLocally().length, 0);
    accountCache.setItem('reel_caption_project_v2', 'bob-draft');
    setCacheAccount('alice');
    for (const privateKey of privateKeys) assert.equal(accountCache.getItem(privateKey), 'alice-only');
    assert.equal(accountCache.getItem('reel_caption_project_v2'), 'alice-draft');
    assert.equal(loadProjectsLocally()[0].name, 'Alice private');
    assert.equal(storage.getItem('reel_caption_project_v2'), 'legacy-private-data');

    process.env.ALLOW_DEMO_LOGIN = 'false';
    assert.equal((await settingsGet(req())).status, 401);
    assert.equal((await settingsPost(req('POST', { action: 'test' }))).status, 401);
    assert.equal((await systemGet(req())).status, 401);
    assert.equal((await health(req())).status, 401);
    assert.equal((await cleanup(req('POST', {}))).status, 401);
    assert.equal((await support(req('POST', {}))).status, 401);
    process.env.ALLOW_DEMO_LOGIN = 'true';
    assert.equal((await settingsPost(req('POST', {}, 'https://attacker.example'))).status, 403);
    assert.equal((await cleanup(req('POST', {}, 'https://attacker.example'))).status, 403);
    assert.equal((await settingsPost(req('POST', { provider: 'invalid' }))).status, 400);

    process.env.CLOUDFLARE_ACCOUNT_ID = 'fixture';
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'fixture';
    process.env.CLOUDFLARE_API_TOKEN = 'fixture';
    globalThis.fetch = async () => Response.json({ success: true, result: [{ success: true, results: [{ id: 'member', role: 'user', name: 'Member', email: 'member@example.test', created_at: '2026-01-01' }] }] });
    assert.equal((await settingsGet(req('GET', undefined, undefined, 'session'))).status, 403);
    assert.equal((await settingsPost(req('POST', { action: 'test' }, undefined, 'session'))).status, 403);
    assert.equal((await systemGet(req('GET', undefined, undefined, 'session'))).status, 403);
    assert.equal((await cleanup(req('POST', {}, undefined, 'session'))).status, 403);
    console.log('PASS: per-account drafts/projects, guest isolation, legacy preservation, anonymous/admin/member API rules and origin validation');
  } finally {
    setCacheAccount(null);
    globalThis.fetch = oldFetch;
    for (const key of keys) {
      const value = oldEnv.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
