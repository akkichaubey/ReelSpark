import type { Page, APIRequestContext } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CaptionProject } from '../../src/lib/caption-maker/types';

export const timelineBundle = path.resolve('storage/qa-2026-11-01/timeline-fixture.js');
export async function compileTimelineFixture() {
  await build({ entryPoints: ['tests/browser/fixtures/timeline.tsx'], outfile: timelineBundle, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', sourcemap: true });
}
export async function mountTimeline(page: Page, request: APIRequestContext) {
  const source = await fs.readFile('storage/qa-2026-11-01/source.mp4');
  await page.route('**/api/files/qa-ui/source.mp4', route => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(source.length - 1, Number(range[2])) : source.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: source.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${source.length}` } : {}) } });
  });
  await page.route('**/api/caption-maker/timeline-preview', route => route.fulfill({ json: { success: true, durationMs: 4000, hasAudio: true,
    peaks: Array.from({ length: 80 }, (_, i) => i % 12 < 4 ? 0 : 0.7),
    thumbnails: ['red', 'red', 'blue', 'blue'].map(color => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="136"><rect width="240" height="136" fill="${color}"/></svg>`)}`), thumbnailTimesMs: [0, 1000, 2000, 3950] } }));
  const html = await (await request.get('/')).text();
  const css = [...html.matchAll(/<link\b[^>]*>/g)].map(m => m[0]).filter(tag => tag.includes('rel="stylesheet"')).map(tag => /href="([^"]+)"/.exec(tag)?.[1]).filter((url): url is string => !!url && url.startsWith('/_next/'));
  await page.route('**/__qa_timeline__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" class="dark"><head><title>Isolated timeline QA</title></head><body><div id="qa-root"></div></body></html>' }));
  await page.goto('/__qa_timeline__');
  for (const url of css) await page.addStyleTag({ content: await (await request.get(url)).text() });
  await page.addScriptTag({ path: timelineBundle });
  await page.getByRole('heading', { name: 'Isolated timeline QA' }).waitFor();
}
export async function projectState(page: Page): Promise<CaptionProject> {
  return JSON.parse(await page.getByTestId('project-state').textContent() || '{}');
}
export function clipLocator(page: Page, id: string) { return page.locator(`[data-clip-id="${id}"]`); }
