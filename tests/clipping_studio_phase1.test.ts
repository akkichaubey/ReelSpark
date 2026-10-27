import assert from 'assert';
import { setCacheAccount } from '../src/lib/account-cache';
import fs from 'fs';
import path from 'path';
import {
  parseTimestampToMs,
  formatMsToTimestamp,
  parseTimestampRangeLine,
  ClipSchema,
  MergeRecipeSchema,
  ExportJobSchema,
  ClippingProjectSchema,
  MediaServiceHealthResponseSchema,
} from '../src/lib/clipping-studio/contracts';
import {
  createBlankClippingProject,
  saveProjectLocally,
  loadProjectsLocally,
  loadProjectByIdLocally,
  deleteProjectLocally,
  duplicateProjectLocally,
} from '../src/lib/clipping-studio/local-persistence';
import { getCloudflareStatus } from '../src/lib/clipping-studio/cloudflare-sync';
import { checkFfmpegStatus, checkFfprobeStatus } from '../src/lib/config';

async function runPhase1Tests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO — PHASE 1 AUTOMATED TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // 1. Timestamp Parsing Tests
  await test('Timestamp Parsing: HH:MM:SS.mmm, MM:SS, and milliseconds accuracy', () => {
    assert.strictEqual(parseTimestampToMs('00:00:10.000'), 10000);
    assert.strictEqual(parseTimestampToMs('00:01:15.500'), 75500);
    assert.strictEqual(parseTimestampToMs('01:02:03.250'), 3723250);
    assert.strictEqual(parseTimestampToMs('02:15'), 135000); // 2m 15s
    assert.strictEqual(parseTimestampToMs('02:15.750'), 135750);
    assert.strictEqual(parseTimestampToMs('00:00:05,250'), 5250); // comma separator support
  });

  await test('Timestamp Parsing: Rejects malformed, negative, or invalid bounds', () => {
    assert.throws(() => parseTimestampToMs(''), /cannot be empty/);
    assert.throws(() => parseTimestampToMs('invalid:time'), /Non-numeric/);
    assert.throws(() => parseTimestampToMs('-01:00'), /Negative values/);
    assert.throws(() => parseTimestampToMs('00:65:00'), /Minutes must be between 0 and 59/);
    assert.throws(() => parseTimestampToMs('00:00:65'), /Seconds must be between 0 and 59/);
  });

  await test('Timestamp Formatting: Formats integer ms to standard HH:MM:SS.mmm', () => {
    assert.strictEqual(formatMsToTimestamp(10000), '00:00:10.000');
    assert.strictEqual(formatMsToTimestamp(75500), '00:01:15.500');
    assert.strictEqual(formatMsToTimestamp(3723250), '01:02:03.250');
    assert.strictEqual(formatMsToTimestamp(135000, false), '02:15.000');
  });

  // 2. Bulk Timestamp Line Parser
  await test('Bulk Timestamp Line Parser: Parses valid lines with "to" or "-" separators', () => {
    const res1 = parseTimestampRangeLine('00:00:10.000 to 00:00:20.000', 1);
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.startMs, 10000);
    assert.strictEqual(res1.endMs, 20000);
    assert.strictEqual(res1.durationMs, 10000);

    const res2 = parseTimestampRangeLine('01:15 - 01:35', 2);
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.startMs, 75000);
    assert.strictEqual(res2.endMs, 95000);
    assert.strictEqual(res2.durationMs, 20000);
  });

  await test('Bulk Timestamp Line Parser: Validates reversed bounds & max duration', () => {
    // Reversed bounds
    const resReversed = parseTimestampRangeLine('00:00:25 to 00:00:15', 5);
    assert.strictEqual(resReversed.valid, false);
    assert.ok(resReversed.error && resReversed.error.includes('must be less than end time'));

    // Exceeding media duration
    const resExceeds = parseTimestampRangeLine('00:01:00 to 00:05:00', 6, 120000); // media is 2 min (120,000ms)
    assert.strictEqual(resExceeds.valid, false);
    assert.ok(resExceeds.error && resExceeds.error.includes('exceeds media duration'));

    // Invalid delimiter
    const resNoDelim = parseTimestampRangeLine('00:01:00 and 00:02:00', 7);
    assert.strictEqual(resNoDelim.valid, false);
    assert.ok(resNoDelim.error && resNoDelim.error.includes('Invalid delimiter'));
  });

  // 3. Domain Model Zod Schemas
  await test('Zod Schemas: Clip, MergeRecipe, ExportJob, and ClippingProject validation', () => {
    const clip = ClipSchema.parse({
      id: 'clip_1',
      projectId: 'proj_1',
      mediaAssetId: 'asset_1',
      name: 'Intro Hook',
      startMs: 5000,
      endMs: 15000,
      durationMs: 10000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(clip.id, 'clip_1');

    const recipe = MergeRecipeSchema.parse({
      id: 'recipe_1',
      projectId: 'proj_1',
      name: 'Combined Viral Reel',
      items: [
        { id: 'item_1', recipeId: 'recipe_1', clipId: 'clip_1', orderIndex: 0, transition: 'none' },
      ],
      outputFormat: 'mp4',
      targetResolution: '1080p',
      normalizeAudio: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(recipe.items.length, 1);

    const project = ClippingProjectSchema.parse({
      id: 'proj_1',
      name: 'Speech Highlights',
      mediaAssets: [],
      clips: [clip],
      mergeRecipes: [recipe],
      exportJobs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(project.clips.length, 1);
  });

  // 4. Cloudflare D1 Client & Graceful Fallback
  await test('Cloudflare D1: Detects configuration status without crashing when credentials are missing', () => {
    const status = getCloudflareStatus();
    assert.ok(typeof status.configured === 'boolean');
    assert.ok(typeof status.message === 'string');
  });

  // 5. Version-controlled SQL schema verification
  await test('Cloudflare D1 Schema: src/lib/cloudflare/schema.sql exists and contains all required tables', () => {
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'cloudflare', 'schema.sql');
    assert.ok(fs.existsSync(schemaPath), 'SQL schema file must exist');

    const sql = fs.readFileSync(schemaPath, 'utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS clipping_projects'), 'clipping_projects table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS media_assets'), 'media_assets table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS clips'), 'clips table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS merge_recipes'), 'merge_recipes table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS merge_recipe_items'), 'merge_recipe_items table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS export_jobs'), 'export_jobs table missing');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS export_sources'), 'export_sources table missing');
  });

  // 6. Local Project Persistence
  await test('Local Persistence: Blank project generation and duplication with stable unique IDs', () => {
    const blank = createBlankClippingProject('Philosophical Clippings', 'Osho series');
    assert.ok(blank.id.startsWith('clip_proj_'));
    assert.strictEqual(blank.name, 'Philosophical Clippings');
    assert.strictEqual(blank.clips.length, 0);

    // Mock window.localStorage for node environment
    const storageStore: Record<string, string> = {};
    (global as any).window = {
      localStorage: {
        getItem: (k: string) => storageStore[k] || null,
        setItem: (k: string, v: string) => { storageStore[k] = v; },
        removeItem: (k: string) => { delete storageStore[k]; },
      },
    };

    setCacheAccount('phase1-test-user');
    // Save and load
    const saved = saveProjectLocally(blank);
    assert.strictEqual(saved, true);

    const loaded = loadProjectByIdLocally(blank.id);
    assert.ok(loaded);
    assert.strictEqual(loaded?.id, blank.id);

    // Duplicate
    const copy = duplicateProjectLocally(blank.id, 'Philosophical Clippings (Duplicate)');
    assert.ok(copy);
    assert.notStrictEqual(copy?.id, blank.id);
    assert.strictEqual(copy?.name, 'Philosophical Clippings (Duplicate)');

    // Delete
    deleteProjectLocally(blank.id);
    assert.strictEqual(loadProjectByIdLocally(blank.id), null);

    delete (global as any).window;
    setCacheAccount(null);
  });

  // 7. FFmpeg & FFprobe Binary Verification
  await test('Local Media Engine: FFmpeg and FFprobe binaries are accessible and report version', async () => {
    const ffmpeg = await checkFfmpegStatus();
    assert.strictEqual(ffmpeg.available, true, `FFmpeg must be available: ${ffmpeg.error}`);
    assert.ok(ffmpeg.version && ffmpeg.version.toLowerCase().includes('ffmpeg'), 'Version string missing');

    const ffprobe = await checkFfprobeStatus();
    assert.strictEqual(ffprobe.available, true, `FFprobe must be available: ${ffprobe.error}`);
    assert.ok(ffprobe.version && ffprobe.version.toLowerCase().includes('ffprobe'), 'Version string missing');
  });

  // 8. Media Service API Contract Schema Validation
  await test('Media Service Contracts: MediaServiceHealthResponseSchema validates successfully', () => {
    const validHealth = {
      status: 'ok',
      service: 'reelspark-media-service',
      version: '1.0.0',
      host: '127.0.0.1',
      port: 4000,
      uptimeSeconds: 15,
      ffmpeg: { available: true, path: 'ffmpeg', version: 'ffmpeg version 7.1' },
      ffprobe: { available: true, path: 'ffprobe', version: 'ffprobe version 7.1' },
    };

    const parsed = MediaServiceHealthResponseSchema.parse(validHealth);
    assert.strictEqual(parsed.status, 'ok');
    assert.strictEqual(parsed.service, 'reelspark-media-service');
  });

  console.log('\n======================================================');
  console.log(`📊 PHASE 1 RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('Fatal Phase 1 test failure:', err);
  process.exit(1);
});
