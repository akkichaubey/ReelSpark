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

test('synchronized cameras switch during speech and save a continuous master track', async ({ page }) => {
  await page.getByRole('button', { name: 'Add comparison source' }).click();
  await page.getByRole('combobox', { name: 'Auto Cut workflow' }).click();
  await page.getByRole('option', { name: 'Multi-Camera · Synchronized' }).click();
  await page.getByRole('checkbox', { name: 'Include comparison.mp4' }).check();
  const clip = { ...candidates[0], transcriptWords: [{ text: 'Keep stirring.', startMs: 500, endMs: 1400 }] };
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ json: {
    ...response, analysis: { candidates: [clip] }, assembledClips: [clip],
  } }));
  await page.route('**/api/clipping-studio/auto-cut/sync', route => route.fulfill({ json: { sync: {
    asset_qa: { offsetMs: 0, confidence: 100, method: 'manual' }, comparison: { offsetMs: 0, confidence: 98, method: 'waveform' },
  }, unavailable: [] } }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByRole('button', { name: 'Find audio sync' }).click();
  await expect(page.getByText('0 ms · waveform · 98% match')).toBeVisible();
  await page.getByRole('combobox', { name: 'Alternate camera' }).click();
  await page.getByRole('option', { name: 'comparison.mp4', exact: true }).click();
  await page.getByLabel('Seconds into shot').fill('0.8');
  await page.getByRole('button', { name: 'Switch angle', exact: true }).click();
  let saved;
  await page.route('**/api/saved-reels', route => {
    saved = route.request().postDataJSON().project.timeline;
    return route.fulfill({ json: { success: true, reel: { id: 'saved_multicam' } } });
  });
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_multicam');
  expect(saved).toMatchObject({ clips: expect.arrayContaining([
    expect.objectContaining({ trackId: 'video', assetId: 'source_comparison', startMs: 800 }),
    expect.objectContaining({ trackId: 'audio', assetId: 'source_asset_qa', startMs: 0, durationMs: 5000 }),
  ]) });
});

test('manual natural transitions persist on reload and reach the Reel Maker timeline', async ({ page }) => {
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ json: response }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Natural transitions', { exact: true }).click();
  await page.getByLabel('Default blend (ms)').fill('260');
  await page.getByLabel('Default blend (ms)').press('Tab');
  await page.getByRole('combobox', { name: 'Boundary transition type' }).click();
  await page.getByRole('option', { name: 'Match Cut', exact: true }).click();
  await expect(page.getByText('Match Cut · Manually selected transition.', { exact: true })).toBeVisible();
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await page.getByText('Natural transitions', { exact: true }).click();
  await expect(page.getByLabel('Default blend (ms)')).toHaveValue('260');
  await expect(page.getByText('Match Cut · Manually selected transition.', { exact: true })).toBeVisible();
  let saved;
  await page.route('**/api/saved-reels', route => {
    saved = route.request().postDataJSON().project.timeline;
    return route.fulfill({ json: { success: true, reel: { id: 'saved_transition' } } });
  });
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_transition');
  expect(saved).toMatchObject({ clips: expect.arrayContaining([expect.objectContaining({ trackId: 'video', transitionIn: 'cut',
    naturalTransition: expect.objectContaining({ kind: 'match' }) })]) });
});

test('B-roll finds observed footage, keeps narration, and blocks a revoked asset before handoff', async ({ page }) => {
  await page.getByRole('button', { name: 'Add comparison source' }).click();
  const narration = { ...candidates[0], cookingActivity: 'mixing', transcriptWords: [{ text: 'Stir the onion.', startMs: 400, endMs: 1000 }] };
  const closeup = { ...candidates[1], category: 'Onion stirring close-up', objects: ['onion'], cookingActivity: 'mixing',
    analysisMethod: 'semantic', visionProvider: 'fixture', evidenceFrames: [10500] };
  await page.route('**/api/clipping-studio/auto-cut', route => {
    const clips = route.request().postDataJSON().mediaAssetId === 'comparison' ? [closeup] : [narration];
    return route.fulfill({ json: { ...response, analysis: { candidates: clips }, assembledClips: clips } });
  });
  let revoked = false;
  await page.route('**/api/clipping-studio/auto-cut/b-roll', route => route.fulfill({ json: {
    assets: route.request().postDataJSON().sources.filter((source: { id: string }) => !revoked || source.id !== 'comparison')
      .map((source: { id: string }) => ({ id: source.id, url: '/api/files/fixture/' + source.id + '.mp4' })),
  } }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('B-roll suggestions · 0 placed', { exact: true }).click();
  await expect(page.getByText(/Missing Shot · No matching visual evidence/)).toBeVisible();
  await page.getByLabel('B-roll source').selectOption('comparison');
  await page.getByRole('button', { name: 'Analyze source for suggestions' }).click();
  await expect(page.getByText(/comparison.mp4 .*relevance/)).toBeVisible();
  await page.getByRole('button', { name: 'Use suggestion' }).click();
  await page.getByRole('button', { name: 'Place B-roll' }).click();
  await expect(page.getByText('B-roll suggestions · 1 placed', { exact: true })).toBeVisible();
  let saved;
  await page.route('**/api/saved-reels', route => {
    saved = route.request().postDataJSON().project.timeline;
    return route.fulfill({ json: { success: true, reel: { id: 'saved_broll' } } });
  });
  revoked = true;
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect(page.getByText(/B-roll media access changed/)).toBeVisible();
  expect(saved).toBeUndefined();
  revoked = false;
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_broll');
  expect(saved).toMatchObject({ clips: expect.arrayContaining([
    expect.objectContaining({ trackId: 'audio', startMs: 0, sourceStartMs: 0, durationMs: 5000 }),
    expect.objectContaining({ trackId: 'broll-overlay', assetId: 'source_comparison', startMs: 400, muted: true }),
  ]) });
});

test('quality breakdown shows evidence and changing priorities changes the selected shot', async ({ page }) => {
  const shot = (id: string, startMs: number, bright: boolean) => ({
    ...candidate(id, startMs, startMs + 6000), analysisMethod: 'semantic', evidenceFrames: [startMs + 700],
    semanticQuality: { relevance: bright ? 10 : 100, story: bright ? 15 : 100, subject: bright ? 95 : 55, hook: bright ? 30 : 95 },
    qualityMeasurements: { version: 1, frames: [{ timeMs: startMs + 700, edgeDetail: bright ? 11 : 1.5,
      luminance: bright ? 125 : 18, shadows: bright ? 0.02 : 0.82, highlights: 0.01, shift: bright ? 0 : 3 }] },
  });
  const clips = [shot('story', 0, false), shot('broll', 6000, true)];
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ json: {
    ...response, analysis: { candidates: clips }, assembledClips: [clips[0]],
  } }));
  await page.getByRole('button', { name: /Custom Mode/ }).click();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('slider', { name: 'Custom duration in seconds' }).press('Home');
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Quality scoring · v1', { exact: true }).click();
  await expect(page.getByText(/Exposure & lighting · \d+\/100 · Measured proxy/)).toBeVisible();
  await expect(page.getByText('Storytelling · 100/100 · AI estimate')).toBeVisible();
  await page.getByLabel('Quality priority').selectOption('Visual Quality');
  await page.getByRole('button', { name: 'Rebuild with quality scores' }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #2' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).not.toBeChecked();
  await page.getByLabel('Quality priority').selectOption('Storytelling');
  await page.getByRole('button', { name: 'Rebuild with quality scores' }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).toBeChecked();
});

test('duplicate decisions survive regeneration and reload and can be restored', async ({ page }) => {
  const evidence = { contentHash: 'a'.repeat(64), frames: [['f0f0f0f0f0f0f0f0'], ['123456789abcdef0'], ['abcdef0123456789']] };
  const clips = [
    { ...candidates[0], duplicateEvidence: evidence },
    { ...candidates[1], duplicateEvidence: evidence },
    candidates[2],
  ];
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ json: {
    ...response, analysis: { candidates: clips }, assembledClips: clips,
  } }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  const review = page.locator('details').filter({ has: page.getByText('Duplicate review · 1', { exact: true }) }).first();
  await review.getByText('Duplicate review · 1', { exact: true }).click();
  await expect(review.getByText('Visual duplicate · 98% match score')).toBeVisible();
  await review.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Play alternate' })).toBeVisible();
  await review.getByRole('button', { name: 'Replace preferred' }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Regenerate selected clips' }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).not.toBeChecked();
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).toBeDisabled();
  await page.getByText('Duplicate review · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Keep Both' }).click();
  await expect(page.getByRole('checkbox', { name: 'Moment #1' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Moment #2' })).toBeChecked();
});

test('exact uploads are grouped across sources in regular Auto Cut mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Add comparison source' }).click();
  await page.getByRole('checkbox', { name: 'Include comparison.mp4' }).check();
  const clip = { ...candidates[0], duplicateEvidence: { contentHash: 'b'.repeat(64) } };
  const sources: string[] = [];
  await page.route('**/api/clipping-studio/auto-cut', route => {
    sources.push(route.request().postDataJSON().mediaAssetId);
    return route.fulfill({ json: { ...response, analysis: { candidates: [clip] }, assembledClips: [clip] } });
  });
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Duplicate review · 1', { exact: true }).click();
  await expect(page.getByText('Exact file match · 100% match score')).toBeVisible();
  await expect(page.getByText('comparison.mp4 · 0.00–5.00 s')).toBeVisible();
  expect(sources).toEqual(['asset_qa', 'comparison']);
});

test('a custom hook survives regeneration and opens as the first timeline clip', async ({ page }) => {
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({ json: response }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Opening hook · Off', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use hook' })).toHaveCount(3);
  await page.getByRole('button', { name: 'Use hook' }).last().click();
  await page.getByLabel('Optional overlay').fill('Watch this');
  await page.getByLabel('Hook audio', { exact: true }).selectOption('visual');
  await page.getByRole('button', { name: 'Save hook edits' }).click();
  await page.getByRole('button', { name: 'Regenerate selected clips' }).click();
  await expect(page.getByLabel('Optional overlay')).toHaveValue('Watch this');
  let saved;
  await page.route('**/api/saved-reels', route => {
    saved = route.request().postDataJSON().project.timeline;
    return route.fulfill({ json: { success: true, reel: { id: 'saved_hook' } } });
  });
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_hook');
  expect(saved).toMatchObject({ clips: expect.arrayContaining([
    expect.objectContaining({ trackId: 'video', startMs: 0, sourceStartMs: 20000 }),
    expect.objectContaining({ trackId: 'text', startMs: 0, text: expect.objectContaining({ value: 'Watch this' }) }),
  ]) });
});

test('scene review preserves manual splits and exclusions across reanalysis', async ({ page }) => {
  const scenes = [{
    sourceVideoId: 'asset_qa', sceneId: 'scene_0_5000', startMs: 0, endMs: 5000,
    shotType: 'continuous', description: 'Continuous cooking action', actionTags: [], evidenceFrames: [],
    confidence: 0, provenance: 'ffmpeg', excluded: false, locked: false,
  }];
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({
    json: { ...response, analysis: { candidates, scenes } },
  }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Scene review · 1 scenes').click();
  await page.getByRole('button', { name: 'Split in half' }).click();
  await expect(page.getByText('Scene review · 2 scenes')).toBeVisible();
  await page.getByRole('button', { name: 'Exclude', exact: true }).first().click();
  await page.getByRole('button', { name: 'Use included scenes in draft' }).click();
  await expect(page.getByText('1 clips selected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate reel', exact: true })).toBeEnabled();
  await expect(page.getByText('Scene review · 2 scenes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  await expect(page.getByText('1 clips selected')).toBeVisible();
});

test('cooking review lets users edit, reorder and exclude observed steps', async ({ page }) => {
  const steps = [
    { ...candidates[0], category: 'Slice vegetables', cookingActivity: 'chopping', confidence: 78 },
    { ...candidates[1], category: 'Cook vegetables', cookingActivity: 'frying', confidence: 65 },
    { ...candidates[2], category: 'Show final dish', cookingActivity: 'presentation', confidence: 82 },
  ];
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({
    json: { ...response, analysis: { candidates: steps } },
  }));
  await page.getByRole('button', { name: 'Optional settings' }).click();
  await page.getByRole('button', { name: /Cooking Recipe/ }).click();
  await page.getByRole('combobox', { name: 'Recipe style' }).click();
  await page.getByRole('option', { name: 'Quick tip' }).click();
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await expect(page.getByText('Recipe steps · 3')).toBeVisible();
  await page.getByLabel('Step 1 action label').fill('Dice vegetables');
  await page.getByLabel('Step 1 priority').selectOption('required');
  await page.getByLabel('Step 2 priority').selectOption('excluded');
  await page.getByRole('button', { name: 'Move step 3 earlier' }).click();
  await expect(page.getByLabel('Step 2 action label')).toHaveValue('Show final dish');
  await page.getByRole('button', { name: 'Apply recipe steps' }).click();
  await expect(page.getByText('2 clips selected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate reel', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Step 1 action label')).toHaveValue('Dice vegetables');
  await expect(page.getByLabel('Step 3 priority')).toHaveValue('excluded');
});

test('speech review edits Hinglish text at its original timestamps and builds a complete highlight', async ({ page }) => {
  const clip = { ...candidates[0], speechLanguage: 'hinglish', transcriptWords: [
    { text: 'अब', startMs: 100, endMs: 350 },
    { text: 'mix', startMs: 400, endMs: 600 },
    { text: 'करो।', startMs: 650, endMs: 1050 },
  ] };
  await page.route('**/api/clipping-studio/auto-cut', route => route.fulfill({
    json: { ...response, analysis: { candidates: [clip] }, assembledClips: [clip] },
  }));
  await page.getByRole('button', { name: 'Generate reel', exact: true }).click();
  await page.getByText('Speech & highlights · 1').click();
  await page.getByText('Edit timed transcript').click();
  const word = page.getByLabel('Transcript text at 400 milliseconds');
  await word.fill('stir');
  await word.press('Tab');
  await expect(page.getByText('अब stir करो।', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Build draft from speech highlights' }).click();
  await expect(page.getByText('1 clips selected')).toBeVisible();
  await page.getByRole('switch', { name: 'Show auto captions in Reel Maker' }).uncheck();
  let saved;
  await page.route('**/api/saved-reels', route => {
    saved = route.request().postDataJSON().project.timeline;
    return route.fulfill({ json: { success: true, reel: { id: 'saved_captions' } } });
  });
  await expect(page.getByRole('button', { name: 'Open in timeline editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Open in timeline editor' }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-destination')).toBe('/reel-maker?savedReel=saved_captions');
  expect(saved).toMatchObject({ tracks: expect.arrayContaining([expect.objectContaining({ kind: 'captions', hidden: true })]),
    captionSources: { source_asset_qa: { transcript: expect.arrayContaining([expect.objectContaining({ text: 'stir', start: 0.4 })]) } } });
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
  await expect(source).toContainText('second.mp4');
  await source.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option')).toHaveText(['second.mp4', 'source.mp4']);
  await page.getByRole('option', { name: 'source.mp4' }).click();
  await expect(source).toContainText('source.mp4');
});
