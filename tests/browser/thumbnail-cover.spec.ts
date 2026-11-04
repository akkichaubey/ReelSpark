import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { compileTimelineFixture, mountTimeline, projectState } from './harness';

test.beforeAll(compileTimelineFixture);
test.beforeEach(async ({ page, request }) => mountTimeline(page, request));

test('cover is separate from clips, disappears on play, and survives save/reopen and undo', async ({ page }) => {
  const initial = await projectState(page);
  await page.getByRole('combobox', { name: 'Add track', exact: true }).click();
  await page.getByRole('option', { name: 'Thumbnail', exact: true }).click();
  await expect(page.getByAltText('Opening thumbnail')).toBeVisible();
  expect((await projectState(page)).timeline).toEqual(initial.timeline);
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  const poster = page.getByRole('button', { name: 'Play video from thumbnail' });
  await expect(poster).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('thumbnail-before-play.png') });
  await poster.click(); await expect(poster).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId('clock').textContent())).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save QA copy' }).click();
  await page.getByRole('button', { name: 'Remove thumbnail', exact: true }).click();
  expect((await projectState(page)).thumbnailCover?.enabled).toBe(false);
  expect((await projectState(page)).timeline).toEqual(initial.timeline);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await projectState(page)).thumbnailCover?.enabled).toBe(true);
  await page.getByRole('button', { name: 'Reopen QA copy' }).click();
  expect((await projectState(page)).thumbnailCover?.enabled).toBe(true);
});

test('replace validates bytes, exports with/without cover, and downloads real JPG/PNG', async ({ page }) => {
  const initial = await projectState(page);
  const input = page.getByLabel('Replace thumbnail image', { exact: true });
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('Could not read thumbnail');
  expect((await projectState(page)).thumbnailCover).toBeUndefined();
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 10, 10); return canvas.toDataURL('image/png').split(',')[1]; });
  await input.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByAltText('Opening thumbnail')).toBeVisible();
  expect((await projectState(page)).timeline).toEqual(initial.timeline);
  await page.getByRole('button', { name: 'Open export', exact: true }).click();
  const selection = page.getByRole('combobox', { name: 'Video thumbnail export', exact: true });
  await expect(selection).toContainText('Export with Thumbnail');
  const render = page.getByRole('button', { name: 'Render Remotion + GSAP', exact: true });
  await render.click();
  expect(JSON.parse(await page.getByTestId('message').textContent() || '{}')).toMatchObject({ mergeThumbnail: true, thumbnailIntroDuration: 0.01 });
  await selection.click(); await page.getByRole('option', { name: 'Export without Thumbnail', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('export-without-thumbnail.png') });
  await render.click();
  expect(JSON.parse(await page.getByTestId('message').textContent() || '{}')).toMatchObject({ mergeThumbnail: false });
  for (const format of ['JPG', 'PNG']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download Thumbnail ${format}`, exact: true }).click();
    const download = await waiting, filename = await download.path();
    expect(download.suggestedFilename()).toBe(`QA-cover.${format.toLowerCase()}`);
    const bytes = await fs.readFile(filename!);
    expect(bytes.subarray(0, format === 'JPG' ? 3 : 8).toString('hex')).toBe(format === 'JPG' ? 'ffd8ff' : '89504e470d0a1a0a');
  }
});
