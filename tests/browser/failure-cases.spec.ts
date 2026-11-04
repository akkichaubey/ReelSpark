import { test, expect } from '@playwright/test';
import { compileTimelineFixture, mountTimeline, projectState, clipLocator } from './harness';

test.beforeAll(compileTimelineFixture);

test('failed preview can retry without losing the document', async ({ page, request }) => {
  let fail = true;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mountTimeline(page, request, route => fail
    ? route.fulfill({ status: 500, json: { error: 'QA simulated failure' } })
    : route.fulfill({ json: { durationMs: 4000, peaks: [0.5], thumbnails: [], thumbnailTimesMs: [] } }));
  const initial = await projectState(page);
  const retry = page.getByRole('button', { name: /^Retry thumbnails for/ }).first();
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(page.getByRole('button', { name: /^Retry thumbnails for/ })).toHaveCount(0);
  expect(await projectState(page)).toEqual(initial);
  expect(errors).toEqual([]);
});

test('Escape cancels a live drag and a subsequent drag still works', async ({ page, request }) => {
  await mountTimeline(page, request);
  const initial = await projectState(page);
  const clip = initial.timeline!.clips.find(c => c.name === 'Later video')!;
  const node = clipLocator(page, clip.id);
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 8); await page.mouse.down();
  await page.mouse.move(box.x + 75, box.y + 8, { steps: 8 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect((await projectState(page)).timeline).toEqual(initial.timeline);
  await expect.poll(async () => Math.round((await node.boundingBox())!.x)).toBe(Math.round(box.x));
  await page.mouse.move(0, 0);
  const nextBox = (await node.boundingBox())!;
  await page.mouse.move(nextBox.x + 10, nextBox.y + 8); await page.mouse.down();
  await page.mouse.move(nextBox.x + 75, nextBox.y + 8, { steps: 8 }); await page.mouse.up();
  expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.startMs).toBeGreaterThan(clip.startMs);
});
