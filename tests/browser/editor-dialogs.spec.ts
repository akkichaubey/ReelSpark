import { test, expect } from '@playwright/test';
import { compileTimelineFixture, mountTimeline, projectState, clipLocator } from './harness';
test.beforeAll(compileTimelineFixture);
test.beforeEach(async ({ page, request }) => mountTimeline(page, request));
test('clip inspector moves focus inside, traps Tab and restores the launcher on Escape', async ({ page }) => {
  const state = await projectState(page), clip = state.timeline!.clips.find(c => c.assetId === 'visual_fixture')!;
  const launcher = clipLocator(page, clip.id); await launcher.dblclick({ position: { x: 30, y: 8 } });
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  // Chromium's native video shadow controls consume Escape without dispatching
  // a DOM key event. Tab back to a form control to test the dialog's handler.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(launcher).toBeFocused();
});
test('track settings owns focus and cancels without changing data', async ({ page }) => {
  const state = await projectState(page), launcher = page.getByRole('button', { name: 'Track settings: Main video', exact: true });
  await launcher.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(launcher).toBeFocused(); expect(await projectState(page)).toEqual(state);
});
