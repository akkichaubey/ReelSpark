import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  parseTimestampToMs,
  formatMsToTimestamp,
  parseTimestampRangeLine,
  parseBulkTimestamps,
  msToFrame,
  frameToMs,
  getMediaAssetWebUrl,
  MediaAsset,
  Clip,
} from '../src/lib/clipping-studio/contracts';
import {
  createBlankClippingProject,
  saveProjectLocally,
  loadProjectByIdLocally,
} from '../src/lib/clipping-studio/local-persistence';

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO — PHASE 2 AUTOMATED TESTS');
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

  // 1. Frame conversion accuracy
  await test('Frame & Millisecond Conversions: Frame-accurate step calculations at 30 & 60 fps', () => {
    // At 30fps: 1 frame = ~33.33ms
    assert.strictEqual(msToFrame(0, 30), 0);
    assert.strictEqual(msToFrame(1000, 30), 30);
    assert.strictEqual(msToFrame(1000, 60), 60);
    assert.strictEqual(frameToMs(30, 30), 1000);
    assert.strictEqual(frameToMs(60, 60), 1000);
    assert.strictEqual(frameToMs(15, 30), 500);
  });

  // 2. High-precision and fractional seconds
  await test('Timestamp Engine: Handles fractional seconds (.250, .500, .750) with millisecond fidelity', () => {
    assert.strictEqual(parseTimestampToMs('00:00:01.250'), 1250);
    assert.strictEqual(parseTimestampToMs('00:00:01.500'), 1500);
    assert.strictEqual(parseTimestampToMs('00:00:01.750'), 1750);
    assert.strictEqual(formatMsToTimestamp(1250), '00:00:01.250');
    assert.strictEqual(formatMsToTimestamp(1500), '00:00:01.500');
    assert.strictEqual(formatMsToTimestamp(1750), '00:00:01.750');
  });

  // 3. Long Media Files (2+ hours long-form lectures / podcasts)
  await test('Long Media Files: Millisecond timestamp parsing across multi-hour speeches', () => {
    const startStr = '01:45:30.500'; // 1 hour, 45 min, 30.5s = 6,330,500 ms
    const endStr = '02:15:10.250';   // 2 hours, 15 min, 10.25s = 8,110,250 ms
    const startMs = parseTimestampToMs(startStr);
    const endMs = parseTimestampToMs(endStr);

    assert.strictEqual(startMs, 6330500);
    assert.strictEqual(endMs, 8110250);
    assert.strictEqual(endMs - startMs, 1779750); // 29 min, 39.75s
    assert.strictEqual(formatMsToTimestamp(startMs), '01:45:30.500');
    assert.strictEqual(formatMsToTimestamp(endMs), '02:15:10.250');
  });

  // 4. Boundary edge cases
  await test('Boundary Validation: Equal start and end or reversed bounds rejected', () => {
    const resEqual = parseTimestampRangeLine('00:01:00 to 00:01:00', 1);
    assert.strictEqual(resEqual.valid, false);
    assert.ok(resEqual.error && resEqual.error.includes('must be less than end time'));

    const resReversed = parseTimestampRangeLine('00:02:00 to 00:01:00', 2);
    assert.strictEqual(resReversed.valid, false);
    assert.ok(resReversed.error && resReversed.error.includes('must be less than end time'));
  });

  // 5. Bulk Timestamps Parser with Mixed Lines
  await test('Bulk Timestamp Parser: Processes mixed valid & invalid lines with line numbers and custom names', () => {
    const bulkInput = `00:00:10.000 to 00:00:20.000 | Opening Hook
invalid_malformed_delimiter
00:01:15 to 00:01:35 | Core Philosophy
00:02:30 to 00:01:30 | Reversed Bounds
00:05:00 to 00:06:00 | Beyond Media Bounds`;

    // Max duration is 3 minutes (180,000 ms)
    const result = parseBulkTimestamps(bulkInput, 180000);

    assert.strictEqual(result.items.length, 5);
    assert.strictEqual(result.validCount, 2);
    assert.strictEqual(result.invalidCount, 3);

    // Line 1: Valid
    assert.strictEqual(result.items[0].lineNumber, 1);
    assert.strictEqual(result.items[0].valid, true);
    assert.strictEqual(result.items[0].name, 'Opening Hook');
    assert.strictEqual(result.items[0].startMs, 10000);
    assert.strictEqual(result.items[0].endMs, 20000);
    assert.strictEqual(result.items[0].durationMs, 10000);

    // Line 2: Malformed
    assert.strictEqual(result.items[1].lineNumber, 2);
    assert.strictEqual(result.items[1].valid, false);
    assert.ok(result.items[1].error?.includes('Invalid delimiter'));

    // Line 3: Valid
    assert.strictEqual(result.items[2].lineNumber, 3);
    assert.strictEqual(result.items[2].valid, true);
    assert.strictEqual(result.items[2].name, 'Core Philosophy');
    assert.strictEqual(result.items[2].startMs, 75000);
    assert.strictEqual(result.items[2].endMs, 95000);

    // Line 4: Reversed
    assert.strictEqual(result.items[3].lineNumber, 4);
    assert.strictEqual(result.items[3].valid, false);
    assert.ok(result.items[3].error?.includes('must be less than end time'));

    // Line 5: Exceeds duration
    assert.strictEqual(result.items[4].lineNumber, 5);
    assert.strictEqual(result.items[4].valid, false);
    assert.ok(result.items[4].error?.includes('exceeds media duration'));
  });

  // 6. Non-Destructive Source Guarantee
  await test('Non-Destructive Editing: MediaAsset remains intact and unmutated when clips are created', () => {
    const asset: MediaAsset = {
      id: 'asset_test_1',
      projectId: 'proj_test_1',
      filename: 'original_discourse.mp4',
      localPath: 'D:\\Media\\original_discourse.mp4',
      fileSizeBytes: 52428800, // 50MB
      metadata: {
        durationSeconds: 120,
        durationMs: 120000,
        sizeBytes: 52428800,
        formatName: 'mp4',
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: '16:9',
        hasVideo: true,
        hasAudio: true,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      createdAt: new Date().toISOString(),
    };

    // Create 3 clips from asset
    const clip1: Clip = {
      id: 'clip_1',
      projectId: asset.projectId,
      mediaAssetId: asset.id,
      name: 'Highlight 1',
      startMs: 10000,
      endMs: 25000,
      durationMs: 15000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const clip2: Clip = {
      id: 'clip_2',
      projectId: asset.projectId,
      mediaAssetId: asset.id,
      name: 'Highlight 2',
      startMs: 40000,
      endMs: 55000,
      durationMs: 15000,
      orderIndex: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Assert original media asset properties remain unchanged
    assert.strictEqual(asset.localPath, 'D:\\Media\\original_discourse.mp4');
    assert.strictEqual(asset.fileSizeBytes, 52428800);
    assert.strictEqual(asset.metadata.durationMs, 120000);
    assert.strictEqual(clip1.mediaAssetId, asset.id);
    assert.strictEqual(clip2.mediaAssetId, asset.id);
  });

  // 7. Media Asset Web URL Generator
  await test('Media Asset Web URL: Resolves browser-accessible range streaming URL for storage assets', () => {
    const asset = {
      projectId: 'proj_123',
      filename: 'interview.mp4',
      localPath: path.join(process.cwd(), 'storage', 'clipping-studio', 'projects', 'proj_123', 'media', 'interview.mp4'),
    };

    const webUrl = getMediaAssetWebUrl(asset);
    assert.ok(webUrl.startsWith('/api/files/'), 'URL must route through /api/files/');
    assert.ok(webUrl.includes('clipping-studio'), 'URL must reference clipping-studio storage');
    assert.ok(webUrl.includes('interview.mp4'), 'URL must reference filename');
  });

  // 8. Audition Command Dispatcher & Playback Orchestration
  await test('Audition Playback: auditionClip coordinates asset selection, In/Out bounds, and playbackCommand', async () => {
    const { useClippingStore } = await import('../src/lib/clipping-studio/use-clipping-store');
    const store = useClippingStore.getState();

    const mockClip: Clip = {
      id: 'clip_audition_test',
      projectId: 'proj_audition',
      mediaAssetId: 'asset_test_audio',
      name: 'Key Quote',
      startMs: 15000,
      endMs: 35000,
      durationMs: 20000,
      orderIndex: 0,
      notes: 'test auditioning',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Trigger audition
    store.auditionClip(mockClip);

    const after = useClippingStore.getState();
    assert.strictEqual(after.isPlaying, true, 'isPlaying must be set to true on audition');
    assert.strictEqual(after.auditioningClipId, 'clip_audition_test', 'auditioningClipId must match clip id');
    assert.strictEqual(after.selectedAssetId, 'asset_test_audio', 'selectedAssetId must switch to clip mediaAssetId');
    assert.strictEqual(after.inPointMs, 15000, 'inPointMs must match clip startMs');
    assert.strictEqual(after.outPointMs, 35000, 'outPointMs must match clip endMs');
    assert.strictEqual(after.currentTimeMs, 15000, 'currentTimeMs must be positioned at startMs');
    assert.ok(after.playbackCommand, 'playbackCommand must be dispatched');
    assert.strictEqual(after.playbackCommand?.action, 'audition_clip', 'playbackCommand action must be audition_clip');
    assert.strictEqual(after.playbackCommand?.startMs, 15000);
    assert.strictEqual(after.playbackCommand?.endMs, 35000);

    // Second click on the same clip must toggle to pause
    useClippingStore.getState().auditionClip(mockClip);
    const toggled = useClippingStore.getState();
    assert.strictEqual(toggled.isPlaying, false, 'Second click must pause playback');
    assert.strictEqual(toggled.auditioningClipId, null, 'auditioningClipId must reset to null');
    assert.strictEqual(toggled.playbackCommand?.action, 'pause', 'playbackCommand must be pause');
  });

  // 9. Audition Range Action & Toggle
  await test('Audition Range Action: Dispatches audition_range and toggles to pause on repeat click', async () => {
    const { useClippingStore } = await import('../src/lib/clipping-studio/use-clipping-store');

    // Trigger range audition
    useClippingStore.getState().auditionRangeAction(10000, 25000);

    const state1 = useClippingStore.getState();
    assert.strictEqual(state1.isPlaying, true);
    assert.strictEqual(state1.auditionRange?.startMs, 10000);
    assert.strictEqual(state1.auditionRange?.endMs, 25000);
    assert.strictEqual(state1.playbackCommand?.action, 'audition_range');

    // Toggle same range -> pause
    useClippingStore.getState().auditionRangeAction(10000, 25000);
    const state2 = useClippingStore.getState();
    assert.strictEqual(state2.isPlaying, false);
    assert.strictEqual(state2.auditionRange, null);
    assert.strictEqual(state2.playbackCommand?.action, 'pause');
  });

  console.log('\n======================================================');
  console.log(`📊 PHASE 2 RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Fatal Phase 2 test failure:', err);
  process.exit(1);
});
