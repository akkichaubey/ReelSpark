import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { compileTimelineFixture, mountTimeline, projectState, clipLocator } from './harness';

test.beforeAll(compileTimelineFixture);
test.beforeEach(async ({ page, request }) => mountTimeline(page, request));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await info.attach('video-state', { contentType: 'application/json', body: JSON.stringify(await page.locator('video').evaluateAll(elements => elements.map(element => {
    const video = element as HTMLVideoElement; return { time: video.currentTime, duration: video.duration, ready: video.readyState, error: video.error?.message, seekable: Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]) };
  }))) });
});
test('selected clip controls have no critical/serious semantic accessibility defects', async ({ page }) => {
  const state = await projectState(page), clip = state.timeline!.clips.find(c => c.assetId === 'visual_fixture')!;
  const node = clipLocator(page, clip.id); await node.click({ position: { x: 30, y: 8 } });
  await expect(page.getByRole('slider', { name: `Volume: ${clip.name}`, exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).include('[data-editor-timeline]').withRules(['nested-interactive', 'aria-allowed-attr', 'button-name', 'aria-input-field-name']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
});
test('add-track Select repeats actions and track changes undo/redo', async ({ page }) => {
  const initial = await projectState(page);
  for (let i = 0; i < 2; i++) { await page.getByRole('combobox', { name: 'Add track', exact: true }).click(); await page.getByRole('option', { name: 'Intro', exact: true }).click(); }
  expect((await projectState(page)).timeline!.tracks.length).toBe(initial.timeline!.tracks.length + 2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await projectState(page)).timeline!.tracks.length).toBe(initial.timeline!.tracks.length + 1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect((await projectState(page)).timeline!.tracks.length).toBe(initial.timeline!.tracks.length + 2);
});
test('clip drag, duplicate, split and undo operate on the actual timeline component', async ({ page }) => {
  const initial = await projectState(page), later = initial.timeline!.clips.find(c => c.name === 'Later video')!;
  const node = clipLocator(page, later.id); const rect = await node.boundingBox(); expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + 10, rect!.y + 8); await page.mouse.down(); await page.mouse.move(rect!.x + 30, rect!.y + 8, { steps: 8 }); await page.mouse.up();
  expect((await projectState(page)).timeline!.clips.find(c => c.id === later.id)!.startMs).toBeGreaterThan(later.startMs);
  await page.getByRole('button', { name: 'Duplicate selected at timeline end (Ctrl+D)', exact: true }).click();
  expect((await projectState(page)).timeline!.clips.length).toBe(initial.timeline!.clips.length + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const first = initial.timeline!.clips.find(c => c.assetId === 'visual_fixture')!; await clipLocator(page, first.id).click({ position: { x: 30, y: 8 } });
  await page.getByRole('button', { name: 'Split at playhead (S)', exact: true }).click();
  expect((await projectState(page)).timeline!.clips.length).toBe(initial.timeline!.clips.length + 1);
});
test('caption inline editing, boundary keyboard and undo update source groups', async ({ page }) => {
  const word = page.getByRole('button', { name: 'Caption: Hello', exact: true }); await word.dblclick();
  const input = page.getByRole('textbox', { name: 'Edit caption word', exact: true }); await input.fill('Hello QA'); await input.press('Enter');
  expect((await projectState(page)).transcript[0].text).toBe('Hello QA');
  const handle = page.getByRole('slider', { name: 'end boundary: Hello QA', exact: true }); await handle.focus(); await handle.press('ArrowRight');
  expect((await projectState(page)).transcript[0].end).toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await projectState(page)).transcript[0].end).toBe(0.8);
});
test('motion preset and audio automation are retained through fixture save/reopen', async ({ page }) => {
  const initial = await projectState(page), clip = initial.timeline!.clips.find(c => c.assetId === 'visual_fixture')!;
  await clipLocator(page, clip.id).dblclick({ position: { x: 30, y: 8 } });
  await page.getByRole('button', { name: 'Apply motion preset', exact: true }).click();
  await page.getByRole('button', { name: 'Add keyframe at playhead', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  let edited = (await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!;
  expect(edited.motion?.channels.scale).toHaveLength(2); expect(edited.audioKeyframes).toHaveLength(1);
  await page.getByRole('button', { name: 'Save QA copy', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen QA copy', exact: true }).click();
  edited = (await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!; expect(edited.motion?.channels.scale).toHaveLength(2);
});
test('video hover decodes a real muted source frame and keeps clip labels', async ({ page }) => {
  const state = await projectState(page), clip = state.timeline!.clips.find(c => c.assetId === 'visual_fixture')!;
  const node = clipLocator(page, clip.id); await node.hover({ position: { x: 100, y: 8 } });
  const video = page.locator('[data-hover-frame-preview] video');
  await expect.poll(async () => video.evaluate(element => { const el = element as HTMLVideoElement; return { ready: el.readyState, time: el.currentTime, muted: el.muted }; })).toMatchObject({ muted: true });
  await expect.poll(async () => video.evaluate(el => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => video.evaluate(el => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(2);
  const rgb = await video.evaluate(el => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d')!; ctx.drawImage(el as HTMLVideoElement, 0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; });
  expect(rgb[2]).toBeGreaterThan(rgb[0]);
  await node.hover({ position: { x: 20, y: 8 } });
  await expect.poll(async () => video.evaluate(el => (el as HTMLVideoElement).currentTime)).toBeLessThan(1);
  await expect(node.locator('[data-timeline-clip-label]')).toContainText(clip.name); await expect(node.locator('[data-timeline-clip-duration]')).toContainText('4.0s');
});
