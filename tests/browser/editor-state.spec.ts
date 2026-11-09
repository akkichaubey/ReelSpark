import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
const bundle = path.resolve('storage/qa-autocut-2026-11-04/editor-state.js');
test.beforeAll(async()=> { await build({ entryPoints: ['tests/browser/fixtures/editor-state.tsx'], bundle: true, platform: 'browser', format: 'iife', outfile: bundle, jsx: 'automatic' }); });
test.beforeEach(async({ page, request })=> {
  const html = await (await request.get('/')).text();
  const css = [...html.matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(t=>t.includes('rel="stylesheet"')).map(t=>/href="([^"]+)"/.exec(t)?.[1]).filter((x): x is string=>!!x);
  await page.route('**/__qa_editor_state__', r=>r.fulfill({ contentType: 'text/html', body:'<html lang="en" class="dark"><body><div id="qa-root"></div></body></html>' }));
  await page.route('https://fonts.googleapis.com/**', r=>r.fulfill({ contentType:'text/css', body:'' }));
  await page.goto('/__qa_editor_state__'); for(const url of css) await page.addStyleTag({ content: await (await request.get(url)).text() });
  await page.addScriptTag({ path: bundle });
});
test('smart-editor initializes selected gaps and resets selection when detection changes', async({page})=> {
  await page.getByRole('button',{name:'Open smart editor'}).click();
  await expect(page.getByText('1 Gaps Detected')).toBeVisible();
  const apply=page.getByRole('button',{name:/Apply Jump-Cut/}); await expect(apply).toBeEnabled();
  await expect(apply).toContainText('1 Gaps');
  await page.getByRole('button',{name:'Deselect All',exact:true}).click(); await expect(apply).toBeDisabled();
  await page.getByRole('checkbox',{name:/Detect verbal fillers/}).uncheck();
  await expect(page.getByText('2 Gaps Detected')).toBeVisible(); await expect(apply).toBeEnabled(); await expect(apply).toContainText('2 Gaps');
});
test('late thumbnail loads cannot replace newer images and output aspect follows project changes',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const png=async(color:string)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=c.height=10;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,10,10);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const red=await png('#ff0000'),blue=await png('#0000ff');
  await page.route('**/qa-red.png',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.fulfill({contentType:'image/png',body:red}).catch(()=>{});});
  await page.route('**/qa-blue.png',r=>r.fulfill({contentType:'image/png',body:blue}));
  await page.getByRole('button',{name:'Open thumbnail editor'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('qa-replace-background')));
  const canvas=page.locator('canvas').first();
  const blueDominant=()=>canvas.evaluate((c:HTMLCanvasElement)=>{const p=c.getContext('2d')!.getImageData(1,1,1,1).data;return p[2]>p[0];});
  await expect.poll(blueDominant).toBe(true);await page.waitForTimeout(900);expect(await blueDominant()).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('qa-landscape')));
  await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>c.width/c.height)).toBeCloseTo(16/9,2);
  expect(errors).toEqual([]);
});
