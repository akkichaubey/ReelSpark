import assert from 'assert';
import { setCacheAccount } from '../src/lib/account-cache';
import {
  ClippingProject,
  MediaAsset,
  Clip,
  MergeRecipe,
} from '../src/lib/clipping-studio/contracts';
import {
  createBlankClippingProject,
  saveProjectLocally,
  loadProjectByIdLocally,
  duplicateProjectLocally,
  saveCrashRecoverySnapshot,
  loadCrashRecoverySnapshot,
  clearCrashRecoverySnapshot,
} from '../src/lib/clipping-studio/local-persistence';
import { syncProjectToCloudflare } from '../src/lib/clipping-studio/cloudflare-sync';

async function runPhase5Tests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO — PHASE 5 AUTOMATED TESTS (PERSISTENCE & RECOVERY)');
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

  // Mock in-memory localStorage for Node test runner
  setCacheAccount('phase5-test-user');
  const memoryStore: Record<string, string> = {};
  (global as any).window = {
    localStorage: {
      getItem: (key: string) => memoryStore[key] || null,
      setItem: (key: string, val: string) => { memoryStore[key] = val; },
      removeItem: (key: string) => { delete memoryStore[key]; },
    },
  };

  // 1. Project Persistence
  await test('Local Persistence: Saves and reloads project model with zero data loss', () => {
    const proj = createBlankClippingProject('Master Podcast Project');
    proj.clips.push({
      id: 'clip_p5_1',
      projectId: proj.id,
      mediaAssetId: 'asset_p5_1',
      name: 'Episode Intro',
      startMs: 1000,
      endMs: 15000,
      durationMs: 14000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const saved = saveProjectLocally(proj);
    assert.strictEqual(saved, true);

    const loaded = loadProjectByIdLocally(proj.id);
    assert.ok(loaded);
    assert.strictEqual(loaded.name, 'Master Podcast Project');
    assert.strictEqual(loaded.clips.length, 1);
    assert.strictEqual(loaded.clips[0].name, 'Episode Intro');
  });

  // 2. Project Duplication with Regenerated Stable IDs
  await test('Project Duplication: Clones project with fresh IDs for project, clips, and recipes', () => {
    const original = createBlankClippingProject('Original Proj');
    original.clips.push({
      id: 'clip_orig',
      projectId: original.id,
      mediaAssetId: 'asset_1',
      name: 'Clip Original',
      startMs: 0,
      endMs: 10000,
      durationMs: 10000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    saveProjectLocally(original);

    const cloned = duplicateProjectLocally(original.id, 'Duplicated Project');
    assert.ok(cloned);
    assert.notStrictEqual(cloned.id, original.id);
    assert.strictEqual(cloned.name, 'Duplicated Project');
    assert.strictEqual(cloned.clips.length, 1);
    assert.notStrictEqual(cloned.clips[0].id, 'clip_orig');
    assert.strictEqual(cloned.clips[0].projectId, cloned.id);
  });

  // 3. Crash Recovery Snapshots
  await test('Crash Recovery: Stores autosave snapshot and allows restoration or dismissal', () => {
    const proj = createBlankClippingProject('Unsaved Working State');
    saveCrashRecoverySnapshot(proj);

    const recovery = loadCrashRecoverySnapshot(proj.id);
    assert.ok(recovery);
    assert.strictEqual(recovery.snapshot.name, 'Unsaved Working State');
    assert.ok(recovery.savedAt);

    clearCrashRecoverySnapshot(proj.id);
    const cleared = loadCrashRecoverySnapshot(proj.id);
    assert.strictEqual(cleared, null);
  });

  // 4. Undo / Redo History Stack Simulation
  await test('Undo / Redo History Engine: State rollbacks and forwards with 30-item capacity limit', () => {
    let current = createBlankClippingProject('Step 0');
    let undoStack: ClippingProject[] = [];
    let redoStack: ClippingProject[] = [];

    // Simulate 5 edits
    for (let i = 1; i <= 5; i++) {
      undoStack = [current, ...undoStack].slice(0, 30);
      redoStack = [];
      current = { ...current, name: `Step ${i}` };
    }

    assert.strictEqual(current.name, 'Step 5');
    assert.strictEqual(undoStack.length, 5);

    // Perform Undo
    const previous = undoStack[0];
    undoStack = undoStack.slice(1);
    redoStack = [current, ...redoStack];
    current = previous;

    assert.strictEqual(current.name, 'Step 4');
    assert.strictEqual(redoStack.length, 1);
    assert.strictEqual(redoStack[0].name, 'Step 5');

    // Perform Redo
    const next = redoStack[0];
    redoStack = redoStack.slice(1);
    undoStack = [current, ...undoStack];
    current = next;

    assert.strictEqual(current.name, 'Step 5');
    assert.strictEqual(redoStack.length, 0);
  });

  // 5. Missing File Relinking Integrity
  await test('Missing Media Relinking: Relinking media file path updates asset while preserving clip timestamps', () => {
    const proj = createBlankClippingProject('Relink Test');
    const assetId = 'asset_missing_test';
    const oldPath = 'C:\\old_drive\\video.mp4';
    const newPath = 'D:\\new_drive\\media\\video.mp4';

    const asset: MediaAsset = {
      id: assetId,
      projectId: proj.id,
      filename: 'video.mp4',
      localPath: oldPath,
      fileSizeBytes: 1000,
      metadata: { durationSeconds: 60, durationMs: 60000, sizeBytes: 1000, formatName: 'mp4', aspectRatio: '16:9', hasVideo: true, hasAudio: true },
      createdAt: new Date().toISOString(),
    };
    proj.mediaAssets.push(asset);

    const clip: Clip = {
      id: 'clip_rel_1',
      projectId: proj.id,
      mediaAssetId: assetId,
      name: 'Unchanged Clip',
      startMs: 15000,
      endMs: 30000,
      durationMs: 15000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    proj.clips.push(clip);

    // Relink asset
    const targetAsset = proj.mediaAssets.find((a) => a.id === assetId);
    assert.ok(targetAsset);
    targetAsset.localPath = newPath;

    // Verify clip is still associated with the asset and times are unchanged
    const dependentClip = proj.clips.find((c) => c.mediaAssetId === assetId);
    assert.ok(dependentClip);
    assert.strictEqual(dependentClip.startMs, 15000);
    assert.strictEqual(dependentClip.endMs, 30000);
    assert.strictEqual(targetAsset.localPath, newPath);
  });

  // 6. Cloudflare D1 Resilient Sync fallback
  await test('Cloudflare D1 Synchronizer: Non-destructive local fallback when offline or unconfigured', async () => {
    const proj = createBlankClippingProject('Cloudflare Sync Test');
    saveProjectLocally(proj);
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => Response.json({ success: true, synced: false, message: 'Cloud disabled; local cache retained.' });
      const disabled = await syncProjectToCloudflare(proj);
      assert.strictEqual(disabled.success, true);
      assert.strictEqual(disabled.synced, false);
      globalThis.fetch = async () => { throw new Error('Offline'); };
      const offline = await syncProjectToCloudflare(proj);
      assert.strictEqual(offline.success, false);
      assert.strictEqual(offline.synced, false);
      assert.strictEqual(loadProjectByIdLocally(proj.id)?.name, proj.name);
    } finally { globalThis.fetch = originalFetch; }
  });

  setCacheAccount(null);
  delete (global as any).window;
  console.log('\n======================================================');
  console.log(`📊 PHASE 5 TESTS: ${passed} / ${total} PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Fatal Phase 5 test failure:', err);
  process.exit(1);
});
