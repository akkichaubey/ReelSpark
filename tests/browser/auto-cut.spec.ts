import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
const bundle = path.resolve('storage/qa-autocut-2026-11-04/component.js');
const candidate = (id: string, startMs: number, endMs: number) => ({ id, startMs, endMs, durationMs: endMs - startMs, score: 60, confidence: 0, reason: 'Measured audio activity', category: 'Scene estimate', visualActionScore: 50, audioScore: 70, selected: true, speedMultiplier: 1, transitionToNext: 'cut' });
const candidates = [candidate('one', 0, 5000), candidate('two', 10000, 15000), candidate('three', 20000, 25000)];
const response = { success: true, analysis: { candidates }, assembledClips: candidates.slice(0, 2), totalDurationMs: 10000 };
test.beforeAll(async () => {
  await build({ entryPoints: ['tests/browser/fixtures/autocut.tsx'], outfile: bundle, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NEXT_PUBLIC_MEDIA_SERVICE_URL': '""' }, alias: { 'next/navigation': path.resolve('tests/browser/fixtures/autocut-router.ts') } });
});
test.beforeEach(async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  const css = [...html.matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(t=>t.includes('rel="stylesheet"')).map(t=>/href="([^"]+)"/.exec(t)?.[1]).filter((x): x is string=>!!x);
  await page.route('**/__qa_autocut__', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en" class="dark"><head><title>Auto Cut QA</title></head><body><div id="qa-root"></div></body></html>' }));
  await page.route('**/api/files/**', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/__qa_autocut__');
  for (const url of css) await page.addStyleTag({ content: await (await request.get(url)).text() });
  await page.addScriptTag({ path: bundle });
  await expect(page.getByRole('heading', { name: 'Auto Cut QA', exact: true })).toBeVisible();
});
test('all candidates are reviewable; bulk selection, regeneration and full sequence handoff', async ({ page }) => {
  await expect(page.getByRole('slider', { name: 'Seek video' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Preview volume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle fullscreen' })).toBeVisible();
  await expect(page.locator('video[controls]')).toHaveCount(0);
  const errors: string[] = []; page.on('pageerror', e=>errors.push(e.message));
  let calls = 0;
  await page.route('**/api/clipping-studio/auto-cut', route => { calls++; return route.fulfill({ json: response }); });
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove moment 1 from reel', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Add moment 1 to reel', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).toBeChecked();
  await expect(page.getByText('2 clips selected')).toBeVisible();
  await page.getByRole('button', { name: 'Select All', exact: true }).click();
  await expect(page.getByText('15.0s', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Deselect All', exact: true }).click();
  await expect(page.getByText('0.0s', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in timeline editor' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select All', exact: true }).click();
  await page.getByRole('button', { name: 'Regenerate selected clips' }).click();
  expect(calls).toBe(1);
  let saved: any;
  await page.route('**/api/saved-reels', route => { saved = route.request().postDataJSON(); return route.fulfill({ json: { success: true, reel: { id: 'saved_qa' } } }); });
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(()=>page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_qa');
  expect(saved.project.timeline.clips.filter((c: any)=>c.trackId==='video')).toHaveLength(3);
  expect(saved.project.timeline.clips.filter((c: any)=>c.trackId==='audio')).toHaveLength(3);
  expect(saved.project.timeline.clips.filter((c: any)=>c.trackId==='captions')).toHaveLength(3);
  await page.getByRole('button', { name: 'Add to Timeline & Clips' }).click();
  await expect(page.getByTestId('clip-count')).toHaveText('3');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('errors recover; cancellation and source changes discard late results', async ({ page }) => {
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ status: 500, json: { success: false, error: 'Fixture processing failure' } }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await expect(page.getByText('Fixture processing failure')).toBeVisible();
  await page.unroute('**/api/clipping-studio/auto-cut');
  await page.route('**/api/clipping-studio/auto-cut', async route => { await new Promise(r=>setTimeout(r, 500)); await route.fulfill({ json: response }).catch(()=>{}); });
  const localRequest = page.waitForRequest(request => request.url().endsWith('/api/clipping-studio/auto-cut') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Use local analysis', exact: true }).click();
  expect((await localRequest).postDataJSON().settings.analysisMethod).toBe('scene_audio');
  await page.getByRole('button', { name: 'Cancel analysis' }).click();
  await page.waitForTimeout(700); await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByRole('button', { name: 'Switch source' }).click();
  await page.waitForTimeout(700); await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate reel', exact: true })).toBeEnabled();
});

test('uploading a second video selects it and retains the original source', async ({ page }) => {
  await page.route('**/api/clipping-studio/projects/qa_project/media', route => route.fulfill({ json: {
    success: true,
    asset: { id: 'uploaded', projectId: 'qa_project', filename: 'second.mp4', localPath: 'storage/second.mp4',
      fileSizeBytes: 4, metadata: { durationSeconds: 5, durationMs: 5000, aspectRatio: '16:9', hasVideo: true } },
  } }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload another video' }).click();
  await (await chooser).setFiles({ name: 'second.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test') });
  const source = page.getByRole('combobox', { name: 'Source video' });
  await expect(source).toHaveValue('uploaded');
  await expect(source.locator('option')).toHaveText(['second.mp4', 'source.mp4']);
  await source.selectOption('asset_qa');
  await expect(source).toHaveValue('asset_qa');
});
