import { test, expect } from '@playwright/test';
import { compileTimelineFixture, mountTimeline, projectState, clipLocator } from './harness';

test.beforeAll(compileTimelineFixture);
test.beforeEach(async ({ page, request }) => mountTimeline(page, request));
test('cross-track pointer drop and locked destination preserve validation and undo', async ({ page }) => {
  const initial = await projectState(page), clip = initial.timeline!.clips.find(c => c.name === 'Later video')!;
  await page.getByRole('combobox', { name: 'Add track', exact: true }).click(); await page.getByRole('option', { name: 'overlay', exact: true }).click();
  const overlay = (await projectState(page)).timeline!.tracks.find(t => t.kind === 'overlay')!;
  const drag = async () => {
    const source = await clipLocator(page, clip.id).boundingBox(), target = await page.locator(`[data-track-id="${overlay.id}"]`).boundingBox();
    expect(source).not.toBeNull(); expect(target).not.toBeNull();
    await page.mouse.move(source!.x + 10, source!.y + 8); await page.mouse.down(); await page.mouse.move(source!.x + 10, target!.y + 12, { steps: 8 }); await page.mouse.up();
  };
  await drag(); expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.trackId).toBe(overlay.id);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Lock Overlay', exact: true }).click();
  await drag(); expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.trackId).toBe(clip.trackId);
  await expect(page.getByRole('alert')).toContainText('locked');
});
test('native audio handles commit one pointer gesture and detach preserves source timing', async ({ page }) => {
  const initial = await projectState(page), clip = initial.timeline!.clips.find(c => c.assetId === 'visual_fixture')!;
  await clipLocator(page, clip.id).click({ position: { x: 30, y: 8 } });
  const slider = page.getByRole('slider', { name: `Volume: ${clip.name}`, exact: true }); await slider.focus(); await slider.press('ArrowUp');
  expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.volume).toBe(1.01);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.volume).toBe(1);
  const box = await slider.boundingBox(); await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down(); await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height / 2, { steps: 6 }); await page.mouse.up();
  expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.volume).not.toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.volume).toBe(1);
  await clipLocator(page, clip.id).dblclick({ position: { x: 30, y: 8 } }); await page.getByRole('button', { name: 'Detach audio · keep linked to video', exact: true }).click();
  const next = await projectState(page), audio = next.timeline!.clips.find(c => c.detachedFromId === clip.id)!;
  expect(audio.sourceStartMs).toBe(clip.sourceStartMs); expect(audio.startMs).toBe(clip.startMs); expect(audio.durationMs).toBe(clip.durationMs);
  expect(audio.linkId).toBe(next.timeline!.clips.find(c => c.id === clip.id)!.linkId);
});
test('Bezier pointer handles and signed values copy to another visual clip', async ({ page }) => {
  const initial = await projectState(page), clip = initial.timeline!.clips.find(c => c.assetId === 'visual_fixture')!, later = initial.timeline!.clips.find(c => c.name === 'Later video')!;
  await clipLocator(page, clip.id).dblclick({ position: { x: 30, y: 8 } }); await page.getByRole('button', { name: 'Apply motion preset', exact: true }).click();
  await page.getByRole('combobox', { name: 'Animation property', exact: true }).click(); await page.getByRole('option', { name: 'Scale (%)', exact: true }).click();
  await page.getByRole('combobox', { name: 'Easing after keyframe 1', exact: true }).click(); await page.getByRole('option', { name: 'bezier', exact: true }).click();
  const handle = page.getByRole('button', { name: /^Curve handle 1,/ }); const box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 15, box!.y + box!.height / 2 - 10, { steps: 6 }); await page.mouse.up();
  await page.getByRole('combobox', { name: 'Animation property', exact: true }).click(); await page.getByRole('option', { name: 'Position X (%)', exact: true }).click();
  await page.getByRole('button', { name: 'Add at playhead', exact: true }).click();
  const field = page.getByRole('spinbutton', { name: 'Position X (%)', exact: true }); await field.fill('-15'); await field.press('Tab');
  await page.getByRole('button', { name: 'Copy keyframes', exact: true }).click(); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const motion = (await projectState(page)).timeline!.clips.find(c => c.id === clip.id)!.motion!;
  expect(motion.channels.x![0].value).toBe(-15); expect(motion.channels.scale![0].bezier![0]).toBeGreaterThan(0.25);
  await clipLocator(page, later.id).dblclick({ position: { x: 15, y: 8 } }); await page.getByRole('button', { name: 'Paste keyframes', exact: true }).click(); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect((await projectState(page)).timeline!.clips.find(c => c.id === later.id)!.motion).toEqual(motion);
});
test('gap removal and invalid roll keep the source document intact', async ({ page }) => {
  const initial = await projectState(page), later = initial.timeline!.clips.find(c => c.name === 'Later video')!;
  await page.getByRole('button', { name: 'Remove gaps', exact: true }).click(); expect((await projectState(page)).timeline!.clips.find(c => c.id === later.id)!.startMs).toBe(4000);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('combobox', { name: 'Timeline edit mode', exact: true }).click(); await page.getByRole('option', { name: 'Roll — drag shared edge', exact: true }).click();
  const box = await clipLocator(page, later.id).locator('[title="Trim end"]').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down(); await page.mouse.move(box!.x + 15, box!.y + box!.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole('alert')).toContainText('adjacent'); expect((await projectState(page)).timeline).toEqual(initial.timeline);
});
