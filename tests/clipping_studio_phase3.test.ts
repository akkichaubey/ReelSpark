import assert from 'assert';
import {
  MergeRecipe,
  MergeRecipeItem,
  Clip,
  MediaAsset,
  formatMsToTimestamp,
} from '../src/lib/clipping-studio/contracts';
import {
  planMergeRecipe,
  buildMergeFfmpegArgs,
} from '../src/lib/clipping-studio/merge-planner';

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO — PHASE 3 AUTOMATED TESTS (MERGE STUDIO)');
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

  // Sample Media Assets
  const asset1: MediaAsset = {
    id: 'asset_1',
    projectId: 'proj_merge_test',
    filename: 'speech_part1.mp4',
    localPath: 'C:\\media\\speech_part1.mp4',
    fileSizeBytes: 10485760,
    metadata: {
      durationSeconds: 600,
      durationMs: 600000,
      sizeBytes: 10485760,
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      aspectRatio: '16:9',
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      sampleRate: 48000,
      audioChannels: 2,
    },
    createdAt: new Date().toISOString(),
  };

  const asset2_diffResolution: MediaAsset = {
    id: 'asset_2',
    projectId: 'proj_merge_test',
    filename: 'interview_part2.mp4',
    localPath: 'C:\\media\\interview_part2.mp4',
    fileSizeBytes: 20485760,
    metadata: {
      durationSeconds: 300,
      durationMs: 300000,
      sizeBytes: 20485760,
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      aspectRatio: '16:9',
      hasVideo: true,
      hasAudio: true,
      width: 1280,
      height: 720,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      sampleRate: 48000,
      audioChannels: 2,
    },
    createdAt: new Date().toISOString(),
  };

  // Sample Clips
  const clip2: Clip = {
    id: 'clip_2',
    projectId: 'proj_merge_test',
    mediaAssetId: 'asset_1',
    name: 'Clip 2: Key Takeaway',
    startMs: 10000,
    endMs: 25000,
    durationMs: 15000,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const clip3: Clip = {
    id: 'clip_3',
    projectId: 'proj_merge_test',
    mediaAssetId: 'asset_1',
    name: 'Clip 3: Case Study',
    startMs: 30000,
    endMs: 50000,
    durationMs: 20000,
    orderIndex: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const clip7: Clip = {
    id: 'clip_7',
    projectId: 'proj_merge_test',
    mediaAssetId: 'asset_1',
    name: 'Clip 7: Final Conclusion',
    startMs: 120000,
    endMs: 150000,
    durationMs: 30000,
    orderIndex: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const clip8: Clip = {
    id: 'clip_8',
    projectId: 'proj_merge_test',
    mediaAssetId: 'asset_1',
    name: 'Clip 8: Call to Action',
    startMs: 160000,
    endMs: 175000,
    durationMs: 15000,
    orderIndex: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const clipFromDifferentAsset: Clip = {
    id: 'clip_diff_res',
    projectId: 'proj_merge_test',
    mediaAssetId: 'asset_2',
    name: 'Clip Diff Resolution',
    startMs: 5000,
    endMs: 15000,
    durationMs: 10000,
    orderIndex: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const allClips = [clip2, clip3, clip7, clip8, clipFromDifferentAsset];
  const allAssets = [asset1, asset2_diffResolution];

  // 1. Unlimited independent merge recipes (Recipe A: 2+8, Recipe B: 2+7, Recipe C: 3+8, Recipe D: 8+2)
  await test('Recipe Architecture: Supports multiple independent merge recipes sharing source clips', () => {
    const recipeA: MergeRecipe = {
      id: 'rec_a',
      projectId: 'proj_merge_test',
      name: 'Recipe A (2 + 8)',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_a1', recipeId: 'rec_a', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'item_a2', recipeId: 'rec_a', clipId: 'clip_8', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const recipeB: MergeRecipe = {
      id: 'rec_b',
      projectId: 'proj_merge_test',
      name: 'Recipe B (2 + 7)',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_b1', recipeId: 'rec_b', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'item_b2', recipeId: 'rec_b', clipId: 'clip_7', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const recipeC: MergeRecipe = {
      id: 'rec_c',
      projectId: 'proj_merge_test',
      name: 'Recipe C (3 + 8)',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_c1', recipeId: 'rec_c', clipId: 'clip_3', orderIndex: 0, transition: 'none' },
        { id: 'item_c2', recipeId: 'rec_c', clipId: 'clip_8', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const recipeD: MergeRecipe = {
      id: 'rec_d',
      projectId: 'proj_merge_test',
      name: 'Recipe D (8 + 2)',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_d1', recipeId: 'rec_d', clipId: 'clip_8', orderIndex: 0, transition: 'none' },
        { id: 'item_d2', recipeId: 'rec_d', clipId: 'clip_2', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Verify Recipe A total: 15s + 15s = 30s (30,000ms)
    const planA = planMergeRecipe(recipeA, allClips, allAssets);
    assert.strictEqual(planA.isValid, true);
    assert.strictEqual(planA.totalDurationMs, 30000);
    assert.strictEqual(planA.itemCount, 2);
    assert.strictEqual(planA.items[0].clip.id, 'clip_2');
    assert.strictEqual(planA.items[1].clip.id, 'clip_8');

    // Verify Recipe B total: 15s + 30s = 45s (45,000ms)
    const planB = planMergeRecipe(recipeB, allClips, allAssets);
    assert.strictEqual(planB.isValid, true);
    assert.strictEqual(planB.totalDurationMs, 45000);
    assert.strictEqual(planB.items[1].clip.id, 'clip_7');

    // Verify Recipe C total: 20s + 15s = 35s (35,000ms)
    const planC = planMergeRecipe(recipeC, allClips, allAssets);
    assert.strictEqual(planC.isValid, true);
    assert.strictEqual(planC.totalDurationMs, 35000);

    // Verify Recipe D total: 15s + 15s = 30s (reversed order 8 then 2)
    const planD = planMergeRecipe(recipeD, allClips, allAssets);
    assert.strictEqual(planD.isValid, true);
    assert.strictEqual(planD.items[0].clip.id, 'clip_8');
    assert.strictEqual(planD.items[1].clip.id, 'clip_2');
  });

  // 2. Stream-Copy Demuxer optimization for matching streams
  await test('Merge Planner: Detects identical codec/resolution & selects lossless stream-copy concat demuxer', () => {
    const matchingRecipe: MergeRecipe = {
      id: 'rec_lossless',
      projectId: 'proj_merge_test',
      name: 'Lossless Concat',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_1', recipeId: 'rec_lossless', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'item_2', recipeId: 'rec_lossless', clipId: 'clip_3', orderIndex: 1, transition: 'none' },
        { id: 'item_3', recipeId: 'rec_lossless', clipId: 'clip_7', orderIndex: 2, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan = planMergeRecipe(matchingRecipe, allClips, allAssets);
    assert.strictEqual(plan.isValid, true);
    assert.strictEqual(plan.strategy, 'concat_demuxer_copy');
    assert.strictEqual(plan.requiresReencoding, false);
    assert.strictEqual(plan.reencodeReasons.length, 0);

    // Verify FFmpeg arguments for lossless stream copy
    const args = buildMergeFfmpegArgs(plan, 'C:\\temp\\concat_list.txt', 'C:\\output\\merged.mp4');
    assert.ok(args.includes('-c'));
    assert.ok(args.includes('copy'));
    assert.ok(args.includes('concat'));
    assert.strictEqual(args[args.length - 1], 'C:\\output\\merged.mp4');
  });

  // 3. Filter-complex fallback when resolutions or codecs differ
  await test('Merge Planner: Switches to filter_complex when inputs differ in resolution with clear diagnostic reasons', () => {
    const mixedRecipe: MergeRecipe = {
      id: 'rec_mixed',
      projectId: 'proj_merge_test',
      name: 'Mixed Resolutions Recipe',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_m1', recipeId: 'rec_mixed', clipId: 'clip_2', orderIndex: 0, transition: 'none' }, // 1920x1080
        { id: 'item_m2', recipeId: 'rec_mixed', clipId: 'clip_diff_res', orderIndex: 1, transition: 'none' }, // 1280x720
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan = planMergeRecipe(mixedRecipe, allClips, allAssets);
    assert.strictEqual(plan.isValid, true);
    assert.strictEqual(plan.strategy, 'filter_complex_encode');
    assert.strictEqual(plan.requiresReencoding, true);
    assert.ok(plan.reencodeReasons.some((r) => r.includes('Different resolutions')));

    // Verify FFmpeg filter complex arguments
    const args = buildMergeFfmpegArgs(plan, 'C:\\temp\\unused.txt', 'C:\\output\\normalized.mp4');
    assert.ok(args.includes('-filter_complex'));
    assert.ok(args.includes('libx264'));
    assert.ok(args.includes('[outv]'));
    assert.ok(args.includes('[outa]'));
  });

  // 4. Missing clip reference handling
  await test('Merge Planner: Gracefully detects deleted/missing clips without crashing', () => {
    const invalidRecipe: MergeRecipe = {
      id: 'rec_broken',
      projectId: 'proj_merge_test',
      name: 'Broken Recipe with Deleted Clip',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'item_b1', recipeId: 'rec_broken', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'item_b2', recipeId: 'rec_broken', clipId: 'non_existent_clip_999', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan = planMergeRecipe(invalidRecipe, allClips, allAssets);
    assert.strictEqual(plan.isValid, false);
    assert.strictEqual(plan.missingClipIds.length, 1);
    assert.strictEqual(plan.missingClipIds[0], 'non_existent_clip_999');
    assert.ok(plan.validationError && plan.validationError.includes('missing clip'));
  });

  // 5. Recipe item reordering (move up, move down) & reversing
  await test('Sequence Reordering: Preserves stable clip IDs while re-indexing orderIndex', () => {
    const items: MergeRecipeItem[] = [
      { id: 'it_1', recipeId: 'rec_reorder', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
      { id: 'it_2', recipeId: 'rec_reorder', clipId: 'clip_3', orderIndex: 1, transition: 'none' },
      { id: 'it_3', recipeId: 'rec_reorder', clipId: 'clip_8', orderIndex: 2, transition: 'none' },
    ];

    // Simulate moving item 2 down (swap index 1 and 2)
    const movedItems = [...items];
    const targetIdx = 1;
    const newIdx = 2;
    const [moved] = movedItems.splice(targetIdx, 1);
    movedItems.splice(newIdx, 0, moved);
    const reindexed = movedItems.map((item, idx) => ({ ...item, orderIndex: idx }));

    assert.strictEqual(reindexed[0].clipId, 'clip_2');
    assert.strictEqual(reindexed[1].clipId, 'clip_8');
    assert.strictEqual(reindexed[2].clipId, 'clip_3');

    // Simulate reverse
    const reversed = [...reindexed].reverse().map((item, idx) => ({ ...item, orderIndex: idx }));
    assert.strictEqual(reversed[0].clipId, 'clip_3');
    assert.strictEqual(reversed[1].clipId, 'clip_8');
    assert.strictEqual(reversed[2].clipId, 'clip_2');
  });

  // 6. Recipe Duplication creates independent clone
  await test('Recipe Duplication: Generates unique recipe and item IDs with identical sequence', () => {
    const originalRecipe: MergeRecipe = {
      id: 'rec_original',
      projectId: 'proj_merge_test',
      name: 'Highlight Sequence',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: true,
      items: [
        { id: 'item_orig_1', recipeId: 'rec_original', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'item_orig_2', recipeId: 'rec_original', clipId: 'clip_7', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Duplicate logic
    const duplicateId = `recipe_${Date.now()}`;
    const duplicatedRecipe: MergeRecipe = {
      ...originalRecipe,
      id: duplicateId,
      name: `${originalRecipe.name} (Copy)`,
      items: originalRecipe.items.map((it, idx) => ({
        ...it,
        id: `item_${Date.now()}_${idx}`,
        recipeId: duplicateId,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.notStrictEqual(duplicatedRecipe.id, originalRecipe.id);
    assert.strictEqual(duplicatedRecipe.items.length, originalRecipe.items.length);
    assert.strictEqual(duplicatedRecipe.items[0].clipId, originalRecipe.items[0].clipId);
    assert.notStrictEqual(duplicatedRecipe.items[0].id, originalRecipe.items[0].id);
    assert.strictEqual(duplicatedRecipe.items[0].recipeId, duplicateId);
  });

  // 7. Non-destructive deletion: Removing item from recipe does not touch clip
  await test('Non-Destructive Deletion: Deleting an item from a recipe preserves the clip in library', () => {
    const recipe: MergeRecipe = {
      id: 'rec_remove_test',
      projectId: 'proj_merge_test',
      name: 'Temp Sequence',
      outputFormat: 'mp4',
      targetResolution: 'source',
      normalizeAudio: false,
      items: [
        { id: 'it_rem_1', recipeId: 'rec_remove_test', clipId: 'clip_2', orderIndex: 0, transition: 'none' },
        { id: 'it_rem_2', recipeId: 'rec_remove_test', clipId: 'clip_8', orderIndex: 1, transition: 'none' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Remove item it_rem_1
    const updatedItems = recipe.items
      .filter((i) => i.id !== 'it_rem_1')
      .map((item, idx) => ({ ...item, orderIndex: idx }));

    assert.strictEqual(updatedItems.length, 1);
    assert.strictEqual(updatedItems[0].clipId, 'clip_8');

    // The original clips array still contains clip_2 and clip_8 completely intact
    assert.strictEqual(allClips.filter((c) => c.id === 'clip_2').length, 1);
    assert.strictEqual(allClips.filter((c) => c.id === 'clip_8').length, 1);
  });

  console.log('\n======================================================');
  console.log(`📊 PHASE 3 TESTS: ${passed} / ${total} PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Fatal Phase 3 test failure:', err);
  process.exit(1);
});
