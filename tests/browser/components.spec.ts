import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import path from 'node:path';

const bundle = path.resolve('storage/qa-2026-11-01/components-fixture.js');
test.beforeAll(async () => {
  await build({ entryPoints: ['tests/browser/fixtures/ui.tsx'], bundle: true, platform: 'browser', format: 'iife', outfile: bundle, jsx: 'automatic', sourcemap: true });
});
test.beforeEach(async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  const css = [...html.matchAll(/<link\b[^>]*>/g)].map(m => m[0]).filter(tag => tag.includes('rel="stylesheet"')).map(tag => /href="([^"]+)"/.exec(tag)?.[1]).filter((url): url is string => !!url && url.startsWith('/_next/'));
  await page.route('**/__qa_components__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" class="dark"><head><title>ReelSpark component QA</title></head><body><div id="qa-root"></div></body></html>' }));
  await page.goto('/__qa_components__');
  for (const url of css) await page.addStyleTag({ content: await (await request.get(url)).text() });
  await page.addScriptTag({ path: bundle });
  await expect(page.getByRole('heading', { name: 'ReelSpark component QA' })).toBeVisible();
});

test('button variants and fields retain form validation and native values', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
  await page.getByRole('button', { name: 'Submit QA form' }).click();
  await expect(page.getByTestId('submitted')).toHaveText('');
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Caption', { exact: true }).fill('First line\nदूसरी पंक्ति');
  await page.getByRole('button', { name: 'Submit QA form' }).click();
  await expect(page.getByTestId('submitted')).toHaveText('qa@example.test|First line\nदूसरी पंक्ति');
  await expect(page.getByLabel('Disabled field')).toBeDisabled();
  await page.getByRole('button', { name: 'outline action', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'outline action', exact: true })).toBeFocused();
});
test('Select supports keyboard, disabled items and repeating the same add action', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Track type', exact: true });
  await select.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option', { name: 'Audio', exact: true }).click();
  await expect(select).toContainText('Audio'); await expect(select).toBeFocused();
  for (let i = 0; i < 2; i++) { await page.getByRole('combobox', { name: 'Add track repeatedly' }).click(); await page.getByRole('option', { name: 'Video', exact: true }).click(); }
  await expect(page.getByTestId('Add track repeatedly')).toHaveText('video · 2');
  await expect(page.getByRole('combobox', { name: 'Add track repeatedly' })).toContainText('Choose track');
  await expect(page.getByRole('combobox', { name: 'Disabled select' })).toBeDisabled();
});
test('Dialog traps focus, contains Select Escape, retains outside-click policy and restores launcher', async ({ page }) => {
  const launcher = page.getByRole('button', { name: 'Open QA dialog' }); await launcher.click();
  const dialog = page.getByRole('dialog', { name: 'QA dialog' }); await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Dialog field')).toBeFocused();
  await page.getByRole('combobox', { name: 'Dialog options' }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0); await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5); await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(launcher).toBeFocused();
});
test('shared components expose no serious or critical axe violations in dark and light', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    await page.locator('html').evaluate((el, value) => { el.setAttribute('class', value); }, theme);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
  }
});
