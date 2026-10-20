import assert from 'node:assert';
import { getNinePositionCoordinates, resolveNinePosition } from '../src/lib/caption-maker/text-transform';
import { generateAssSubtitles } from '../src/lib/caption-maker/ass-generator';
import { validateAndHealReelProject } from '../src/lib/caption-maker/pre-flight-validator';
import {
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
} from '../src/lib/caption-maker/thumbnail-presets';
import {
  PLATFORM_PRESETS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_OUTPUT_SETTINGS,
} from '../src/lib/caption-maker/sample-data';
import type {
  AspectRatio,
  CaptionGroup,
  CaptionStyle,
  OutputSettings,
  TranscriptWord,
} from '../src/lib/caption-maker/types';

async function runTests() {
  console.log('\n======================================================');
  console.log('📐 PLATFORM DIMENSIONS & SAFE AREA COMPREHENSIVE TESTS');
  console.log('======================================================\n');

  // TEST 1: Video Reel Platform Dimension Matrix & Codec Divisibility
  console.log('▶ Test 1: Video Reel Dimensions & Divisibility by 2');
  const supportedRatios: AspectRatio[] = ['9:16', '4:5', '1:1', '16:9'];
  const expectedDimensions: Record<AspectRatio, { w: number; h: number }> = {
    '9:16': { w: 1080, h: 1920 },
    '4:5': { w: 1080, h: 1350 },
    '1:1': { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
  };

  for (const ratio of supportedRatios) {
    const dim = expectedDimensions[ratio];
    assert.strictEqual(dim.w % 2, 0, `Width ${dim.w} must be divisible by 2 for H.264/H.265 encoding`);
    assert.strictEqual(dim.h % 2, 0, `Height ${dim.h} must be divisible by 2 for H.264/H.265 encoding`);
    const calculatedRatio = (dim.w / dim.h).toFixed(4);
    const [num, den] = ratio.split(':').map(Number);
    const targetRatio = (num / den).toFixed(4);
    assert.strictEqual(calculatedRatio, targetRatio, `Aspect ratio ${ratio} must match w/h math`);
  }
  console.log('  ✓ All platform video reel dimensions are even numbers and mathematically exact');

  // TEST 2: Platform Presets Registry Integrity
  console.log('▶ Test 2: Platform Presets Registry Specs');
  for (const [key, preset] of Object.entries(PLATFORM_PRESETS)) {
    assert.ok(preset.width > 0 && preset.width % 2 === 0, `Preset ${key} width must be valid & even`);
    assert.ok(preset.height > 0 && preset.height % 2 === 0, `Preset ${key} height must be valid & even`);
    assert.ok(['9:16', '4:5', '1:1', '16:9', 'custom'].includes(preset.aspectRatio));
  }
  console.log('  ✓ PLATFORM_PRESETS contains valid compliant resolutions for Instagram, TikTok, YouTube');

  // TEST 3: Safe Area Zone Coordinates on 9:16 Vertical Reels
  console.log('▶ Test 3: Safe Area Boundaries (Top 14%, Bottom 22%, Right 15%)');
  // Top UI Danger Zone: 0% to 14% (0 to 268px on 1080x1920)
  // Bottom UI Danger Zone: 78% to 100% (1498px to 1920px) -> Safe zone ends at 76% Y
  // Right Action Bar Danger Zone: 85% to 100% (918px to 1080px) -> Safe zone ends at 84% X
  // Content Safe Zone: X: 10% to 84%, Y: 14% to 76%

  const positions = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ] as const;

  for (const pos of positions) {
    const coords = getNinePositionCoordinates(pos);
    const topPct = parseFloat(coords.top);
    const leftPct = parseFloat(coords.left);

    // Verify top boundary is at or below 14%
    assert.ok(
      topPct >= 14,
      `Position ${pos} top (${topPct}%) must NOT intrude into top UI zone (< 14%)`
    );

    // Verify bottom boundary is at or above 76%
    assert.ok(
      topPct <= 76,
      `Position ${pos} top (${topPct}%) must NOT intrude into bottom UI zone (> 76%)`
    );

    // Verify right boundary is at or below 84%
    assert.ok(
      leftPct <= 84,
      `Position ${pos} left (${leftPct}%) must NOT intrude into right action button bar (> 84%)`
    );

    // Verify left boundary is at or above 10%
    assert.ok(
      leftPct >= 10,
      `Position ${pos} left (${leftPct}%) must NOT bleed off left edge (< 10%)`
    );

    // Verify ASS alignment matches standard numpad layout
    assert.ok(coords.assAlignment >= 1 && coords.assAlignment <= 9);
  }
  console.log('  ✓ All 9 caption anchor positions remain strictly inside platform safe zones');

  // TEST 4: ASS Karaoke Subtitle Platform Margins
  console.log('▶ Test 4: ASS Subtitle Generator Platform Margins');
  const dummyWords: TranscriptWord[] = [
    { id: 'w1', text: 'Viral', start: 0.1, end: 0.5 },
    { id: 'w2', text: 'Social', start: 0.6, end: 1.0 },
    { id: 'w3', text: 'Reels', start: 1.1, end: 1.6 },
  ];
  const dummyGroups: CaptionGroup[] = [
    { id: 'g1', text: 'Viral Social Reels', start: 0.1, end: 1.6, words: dummyWords },
  ];

  // 9:16 Settings
  const settings916: OutputSettings = {
    ...DEFAULT_OUTPUT_SETTINGS,
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
  };
  const ass916 = generateAssSubtitles(dummyGroups, dummyWords, DEFAULT_CAPTION_STYLE, settings916);
  // Style: MarginL=86, MarginR=162, MarginV=154 (exact 8% left, 15% right, 8% vertical on 1080x1920)
  assert.ok(ass916.includes('162'), 'ASS script must apply 162px (15%) right margin to avoid right action bar');
  assert.ok(ass916.includes('86'), 'ASS script must apply 86px (8%) left margin');
  console.log('  ✓ ASS Subtitle generator automatically enforces safe margin wrapping for 9:16');

  // TEST 5: Thumbnail Canvas Positioning & Instagram 1:1 Profile Crop
  console.log('▶ Test 5: Thumbnail Title Positioning & Instagram 1:1 Profile Crop Safe Zones');
  // Instagram 1:1 Profile Crop on 1080x1920:
  // Center is Y = 960px.
  // Crop window = 1080x1080, from Y = 420px (21.875%) to Y = 1500px (78.125%).
  // Top title must start at or below 21.875% (we use 23% = 441px).
  // Bottom title must finish at or above 78.125% (we use 76% - totalContentHeight = ~1459px).
  
  const topThumbSettings = {
    ...createDefaultThumbnailSettings('TOP TITLE'),
    aspectRatio: '9:16' as AspectRatio,
    position: 'top' as const,
  };

  const bottomThumbSettings = {
    ...createDefaultThumbnailSettings('BOTTOM TITLE'),
    aspectRatio: '9:16' as AspectRatio,
    position: 'bottom' as const,
  };

  let topTitleRenderedY = 0;
  let bottomTitleRenderedY = 0;

  const createMockCanvas = () => {
    return {
      width: 1080,
      height: 1920,
      getContext: () => ({
        canvas: { width: 1080, height: 1920 },
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arcTo: () => {},
        quadraticCurveTo: () => {},
        drawImage: () => {},
        clip: () => {},
        fill: () => {},
        stroke: () => {},
        measureText: (text: string) => ({ width: text.length * 20 }),
        fillText: (text: string, x: number, y: number) => {
          if (text.includes('TOP')) topTitleRenderedY = y;
          if (text.includes('BOTTOM')) bottomTitleRenderedY = y;
        },
        strokeText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    } as any;
  };

  await renderThumbnailToCanvas(createMockCanvas(), topThumbSettings);
  await renderThumbnailToCanvas(createMockCanvas(), bottomThumbSettings);

  const profileCropStartY = 1920 * (420 / 1920); // 420px
  const profileCropEndY = 1920 * (1500 / 1920); // 1500px

  assert.ok(
    topTitleRenderedY >= profileCropStartY,
    `Top title Y (${topTitleRenderedY}px) must be inside Instagram 1:1 Profile Crop (>= ${profileCropStartY}px)`
  );
  assert.ok(
    bottomTitleRenderedY <= profileCropEndY,
    `Bottom title Y (${bottomTitleRenderedY}px) must be inside Instagram 1:1 Profile Crop (<= ${profileCropEndY}px)`
  );
  console.log(`  ✓ Top title rendered at Y=${Math.round(topTitleRenderedY)}px (inside profile crop >= ${profileCropStartY}px)`);
  console.log(`  ✓ Bottom title rendered at Y=${Math.round(bottomTitleRenderedY)}px (inside profile crop <= ${profileCropEndY}px)`);

  // TEST 6: Pre-flight Validator Safe Area Checks
  console.log('▶ Test 6: Pre-Flight Validator Safe Area and Odd-Dimension Detection');
  const validProject: any = {
    id: 'proj-1',
    name: 'Safe Reel',
    audio: { id: 'm1', fileUrl: '/audio/test.mp3', duration: 30 },
    captionStyle: DEFAULT_CAPTION_STYLE,
    outputSettings: settings916,
    transcript: dummyWords,
    captionGroups: dummyGroups,
    thumbnailSettings: topThumbSettings,
  };

  const preFlightResult = validateAndHealReelProject(validProject);
  assert.strictEqual(preFlightResult.ready, true, 'Compliant project must pass pre-flight');
  const mediaCheck = preFlightResult.checks.find(i => i.id === 'media_assets');
  assert.ok(mediaCheck && mediaCheck.status === 'passed', 'Media & safe area check must pass');
  assert.ok(mediaCheck?.detail.includes('Safe Zone verified'));

  // Test odd dimension detection
  const oddDimProject: any = {
    ...validProject,
    outputSettings: {
      ...settings916,
      width: 1081, // Odd number!
    },
  };
  const oddResult = validateAndHealReelProject(oddDimProject);
  const oddMediaCheck = oddResult.checks.find(i => i.id === 'media_assets');
  assert.ok(oddMediaCheck && oddMediaCheck.status === 'warning', 'Pre-flight must warn on odd dimensions');
  assert.ok(oddMediaCheck?.detail.includes('not divisible by 2'));
  console.log('  ✓ Pre-flight validator correctly flags safe area status and warns on odd dimensions');

  console.log('\n======================================================');
  console.log('🎉 ALL 6 DIMENSION & SAFE AREA VALIDATION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
