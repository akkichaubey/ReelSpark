import { test, expect } from '@playwright/test';
import { compileTimelineFixture, mountTimeline } from './harness';

test.beforeAll(compileTimelineFixture);

for (const width of [1440, 1280, 768, 390, 375]) {
  test(`timeline controls and track dialog fit ${width}px in both themes`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await mountTimeline(page, request);
    for (const theme of ['dark', 'light']) {
      await page.locator('html').evaluate((element, value) => { element.setAttribute('class', value); }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const launcher = page.getByRole('button', { name: 'Track settings: Main video', exact: true });
      await launcher.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });
}
