import { defineConfig } from '@playwright/test';
const run = (process.env.QA_RUN_ID || new Date().toISOString()).replace(/[^a-zA-Z0-9-]/g, '-');

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  outputDir: `storage/qa-2026-11-01/browser-${run}`,
  reporter: [['list'], ['json', { outputFile: `storage/qa-2026-11-01/playwright-${run}.json` }]],
  use: { baseURL: 'http://localhost:3000', channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  // Intentionally no webServer: use the user's running application.
});
