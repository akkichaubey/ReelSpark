import { test, expect } from '@playwright/test';

test('existing server protects authenticated APIs without a session', async ({ request }) => {
  expect(await (await request.get('/api/auth/me')).json()).toMatchObject({ authenticated: false, user: null });
  for (const url of ['/api/saved-reels', '/api/user/profile']) expect((await request.get(url)).status()).toBe(401);
  for (const url of ['/api/caption-maker/timeline-preview', '/api/caption-maker/timeline-render', '/api/saved-reels']) {
    expect((await request.post(url, { data: {}, headers: { Origin: 'http://localhost:3000' } })).status()).toBe(401);
  }
  const invalid = await request.post('/api/auth/login', { data: { email: 5, password: null }, headers: { Origin: 'http://localhost:3000' } });
  expect(invalid.status()).toBe(400);
});
test('actual sign-in gate, dialog focus, invalid form and theme persistence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/reel-maker');
  const launcher = page.getByRole('button', { name: 'Sign In to Continue', exact: true }); await launcher.click();
  const dialog = page.getByRole('dialog', { name: 'Welcome Back', exact: true }); await expect(dialog).toBeVisible();
  const posts: string[] = []; page.on('request', request => { if (request.method() === 'POST' && /\/api\/auth\/(login|register)/.test(request.url())) posts.push(request.url()); });
  await page.getByLabel('Email Address', { exact: true }).fill('invalid'); await page.getByLabel('Password', { exact: true }).fill('qa-only');
  await dialog.locator('form').last().locator('button[type="submit"]').click(); expect(posts).toEqual([]);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(launcher).toBeFocused();
  await page.getByRole('button', { name: 'Toggle light and dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/light/); await page.reload(); await expect(page.locator('html')).toHaveClass(/light/);
  expect(errors).toEqual([]);
});
test('actual anonymous routes and legacy redirect load without runtime exceptions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const url of ['/', '/clipping-studio', '/social-post', '/saved-reels', '/caption-maker']) {
    const response = await page.goto(url); expect(response?.status()).toBe(200); await expect(page.locator('main').first()).toBeVisible();
  }
  await expect(page).toHaveURL(/\/reel-maker/); expect(errors).toEqual([]);
});
