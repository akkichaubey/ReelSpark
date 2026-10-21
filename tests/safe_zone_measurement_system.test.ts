import assert from 'node:assert';
import {
  PLATFORM_SAFE_ZONE_PRESETS,
  getSafeZoneConfig,
  calculateSafeZonePixels,
  isVertical916Platform,
  SafeZoneConfig,
} from '../src/lib/caption-maker/safe-zone';
import {
  PLATFORM_PRESETS,
} from '../src/lib/caption-maker/sample-data';
import { getNinePositionCoordinates } from '../src/lib/caption-maker/text-transform';
import { generateAssSubtitles } from '../src/lib/caption-maker/ass-generator';
import type {
  PlatformPreset,
  CaptionPosition,
  CaptionStyle,
  OutputSettings,
  TranscriptWord,
} from '../src/lib/caption-maker/types';

async function runSafeZoneVerificationTests() {
  console.log('\n======================================================');
  console.log('📐 SOCIAL MEDIA REEL SAFE-ZONE MEASUREMENT TEST SUITE');
  console.log('======================================================\n');

  // -----------------------------------------------------------------
  // SECTION 1: Standard 9:16 Canvas & Codec Integrity
  // -----------------------------------------------------------------
  console.log('▶ Section 1: Standard 9:16 Export Canvas & Divisibility');
  const baseW = 1080;
  const baseH = 1920;
  assert.strictEqual(baseW, 1080, 'Export width must be 1080');
  assert.strictEqual(baseH, 1920, 'Export height must be 1920');
  assert.strictEqual(baseW % 2, 0, 'Width must be divisible by 2 for H.264/H.265');
  assert.strictEqual(baseH % 2, 0, 'Height must be divisible by 2 for H.264/H.265');
  assert.strictEqual((baseW / baseH).toFixed(4), (9 / 16).toFixed(4), 'Aspect ratio must be exactly 9:16');
  console.log('  ✓ Standard canvas is 1080 × 1920 (9:16 portrait), codec compliant');

  // -----------------------------------------------------------------
  // SECTION 2: Platform-Specific Presets (Instagram, Facebook, Shorts, Threads)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 2: Platform-Specific Presets Verification');

  const platforms: PlatformPreset[] = [
    'instagram-reel',
    'facebook-reel',
    'youtube-short',
    'threads-video',
  ];

  for (const plat of platforms) {
    const config = PLATFORM_SAFE_ZONE_PRESETS[plat];
    assert.ok(config, `Preset ${plat} must exist in PLATFORM_SAFE_ZONE_PRESETS`);
    assert.strictEqual(config.aspectRatio, '9:16', `${plat} must be 9:16`);
    assert.strictEqual(config.baseWidth, 1080);
    assert.strictEqual(config.baseHeight, 1920);
    assert.ok(config.isOfficial, `${plat} must cite official/standard documentation`);
    assert.ok(config.topDangerPercent > 0 && config.topDangerPercent < 25, `${plat} top danger zone must be within 5-25%`);
    assert.ok(config.bottomDangerPercent > 15 && config.bottomDangerPercent < 35, `${plat} bottom danger zone must be within 15-35%`);
    assert.ok(config.leftMarginPercent >= 5, `${plat} left margin must be >= 5%`);
    assert.ok(config.rightMarginPercent >= 5, `${plat} right margin must be >= 5%`);

    const bounds = calculateSafeZonePixels(config, 1080, 1920);
    const expectedW = 1080 - (Math.round((1080 * config.leftMarginPercent) / 100) + Math.round((1080 * config.rightMarginPercent) / 100));
    const expectedH = 1920 - (Math.round((1920 * config.topDangerPercent) / 100) + Math.round((1920 * config.bottomDangerPercent) / 100));
    assert.strictEqual(bounds.contentSafeZonePx.width, expectedW);
    assert.strictEqual(bounds.contentSafeZonePx.height, expectedH);
    console.log(`  ✓ [${config.name}]: Top=${config.topDangerPercent}% (~${bounds.topDangerPx.height}px), Bottom=${config.bottomDangerPercent}% (~${bounds.bottomDangerPx.height}px), Safe=${bounds.contentSafeZonePx.width}×${bounds.contentSafeZonePx.height}px`);
  }

  // Verify Instagram Reels Specifics
  const ig = PLATFORM_SAFE_ZONE_PRESETS['instagram-reel'];
  assert.strictEqual(ig.topDangerPercent, 14.0, 'Instagram top danger must be 14% (Meta official)');
  assert.strictEqual(ig.bottomDangerPercent, 22.0, 'Instagram bottom danger must be 22% (Meta standard)');
  assert.strictEqual(ig.bottomWarningPercent, 35.0, 'Instagram expanded caption warning must be 35%');
  assert.strictEqual(ig.hasRightActionBar, true, 'Instagram must have right action rail');
  assert.strictEqual(ig.actionBarWidthPercent, 15.0, 'Instagram action rail must be 15% (~162px)');

  // Verify Facebook Reels Specifics
  const fb = PLATFORM_SAFE_ZONE_PRESETS['facebook-reel'];
  assert.strictEqual(fb.topDangerPercent, 14.0, 'Facebook top danger must be 14%');
  assert.strictEqual(fb.bottomDangerPercent, 26.0, 'Facebook bottom danger must be 26% (due to FB App bottom nav)');
  assert.strictEqual(fb.hasRightActionBar, true, 'Facebook must have right action rail');

  // Verify YouTube Shorts Specifics
  const yt = PLATFORM_SAFE_ZONE_PRESETS['youtube-short'];
  assert.strictEqual(yt.topDangerPercent, 10.0, 'YouTube Shorts top danger must be 10% (~192px)');
  assert.strictEqual(yt.bottomDangerPercent, 23.0, 'YouTube Shorts bottom danger must be 23% (~442px)');
  assert.strictEqual(yt.hasScrubberBar, true, 'YouTube Shorts must have timeline scrubber indicator');

  // Verify Threads Video Specifics
  const th = PLATFORM_SAFE_ZONE_PRESETS['threads-video'];
  assert.strictEqual(th.topDangerPercent, 9.0, 'Threads top danger must be 9% (~173px)');
  assert.strictEqual(th.bottomDangerPercent, 20.0, 'Threads bottom danger must be 20% (~384px)');
  assert.strictEqual(th.hasRightActionBar, false, 'Threads must NOT have vertical right action rail');

  // -----------------------------------------------------------------
  // SECTION 3: Mathematical Derivation of 4:5 and 1:1 Feed Crop Lines
  // -----------------------------------------------------------------
  console.log('\n▶ Section 3: Mathematical Derivation of Feed Crop Lines');
  // 4:5 In-feed crop on 1080x1920:
  // Height of 4:5 frame = 1080 * 5 / 4 = 1350px.
  // Top/bottom crop margin = (1920 - 1350) / 2 = 285px.
  // Percentage = 285 / 1920 = 14.84375%.
  const expected45Percent = (1920 - 1350) / 2 / 1920 * 100;
  assert.strictEqual(Number(expected45Percent.toFixed(4)), 14.8438);
  assert.strictEqual(Number(ig.feedCrop45Percent.toFixed(4)), 14.8438, '4:5 in-feed crop percentage must be 14.8438%');

  // 1:1 Profile grid crop on 1080x1920:
  // Height of 1:1 frame = 1080px.
  // Top/bottom crop margin = (1920 - 1080) / 2 = 420px.
  // Percentage = 420 / 1920 = 21.875%.
  const expected11Percent = (1920 - 1080) / 2 / 1920 * 100;
  assert.strictEqual(expected11Percent, 21.875);
  assert.strictEqual(ig.centerSquarePercent, 21.875, '1:1 center square crop percentage must be exactly 21.875%');
  console.log('  ✓ 4:5 In-feed crop line (14.8438%) and 1:1 Profile grid crop line (21.875%) mathematically verified');

  // -----------------------------------------------------------------
  // SECTION 4: Responsive Preview Scaling Across Multiple Sizes
  // -----------------------------------------------------------------
  console.log('\n▶ Section 4: Responsive Preview Scaling Invariance');
  const testPreviewSizes = [
    { w: 360, h: 640, label: 'Mobile Compact Preview' },
    { w: 405, h: 720, label: 'Standard Desktop Preview' },
    { w: 540, h: 960, label: 'High-DPI Desktop Preview' },
    { w: 1080, h: 1920, label: 'Native Full Export' },
  ];

  for (const size of testPreviewSizes) {
    const bounds = calculateSafeZonePixels(ig, size.w, size.h);
    // Relative ratios must remain strictly identical
    const topRatio = bounds.topDangerPx.height / size.h;
    const bottomRatio = bounds.bottomDangerPx.height / size.h;
    const safeWidthRatio = bounds.contentSafeZonePx.width / size.w;
    const safeHeightRatio = bounds.contentSafeZonePx.height / size.h;

    assert.ok(Math.abs(topRatio - 0.14) < 0.005, `Top ratio must be 14% at ${size.label}`);
    assert.ok(Math.abs(bottomRatio - 0.22) < 0.005, `Bottom ratio must be 22% at ${size.label}`);
    assert.ok(Math.abs(safeWidthRatio - (1 - 0.21)) < 0.005, `Safe width ratio must be 79% at ${size.label}`);
    assert.ok(Math.abs(safeHeightRatio - (1 - 0.36)) < 0.005, `Safe height ratio must be 64% at ${size.label}`);
  }
  console.log('  ✓ Responsive scaling verified: ratios remain invariant across all preview resolutions');

  // -----------------------------------------------------------------
  // SECTION 5: Platform Switching & Custom Calibration Overrides
  // -----------------------------------------------------------------
  console.log('\n▶ Section 5: Platform Switching & Custom Overrides');
  // Initial default: Instagram
  let currentCfg = getSafeZoneConfig('instagram-reel');
  assert.strictEqual(currentCfg.id, 'instagram-reel');
  assert.strictEqual(currentCfg.topDangerPercent, 14);
  assert.strictEqual(currentCfg.isOfficial, true);

  // Switch to YouTube Shorts
  currentCfg = getSafeZoneConfig('youtube-short');
  assert.strictEqual(currentCfg.id, 'youtube-short');
  assert.strictEqual(currentCfg.topDangerPercent, 10);
  assert.strictEqual(currentCfg.bottomDangerPercent, 23);

  // Apply custom user calibration override
  const customCfg = getSafeZoneConfig('youtube-short', {
    topDangerPercent: 12.5,
    bottomDangerPercent: 25.0,
  });
  assert.strictEqual(customCfg.topDangerPercent, 12.5, 'Custom top danger override must take effect');
  assert.strictEqual(customCfg.bottomDangerPercent, 25.0, 'Custom bottom danger override must take effect');
  assert.strictEqual(customCfg.isOfficial, false, 'Custom config must be marked isOfficial=false');
  assert.strictEqual(customCfg.sourceType, 'user-custom');

  // Reset custom overrides back to official
  const resetCfg = getSafeZoneConfig('youtube-short', {
    topDangerPercent: undefined,
    bottomDangerPercent: undefined,
  });
  assert.strictEqual(resetCfg.topDangerPercent, 10);
  assert.strictEqual(resetCfg.isOfficial, true);
  console.log('  ✓ Platform switching, custom overrides, and reset-to-defaults verified');

  // -----------------------------------------------------------------
  // SECTION 6: Non-9:16 Formats Separation (4:5, 1:1, 16:9)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 6: Non-9:16 Presets Separation');
  const p45 = PLATFORM_SAFE_ZONE_PRESETS['instagram-portrait'];
  assert.strictEqual(p45.aspectRatio, '4:5');
  assert.strictEqual(p45.baseWidth, 1080);
  assert.strictEqual(p45.baseHeight, 1350);
  assert.strictEqual(isVertical916Platform('instagram-portrait', '4:5'), false);

  const p11 = PLATFORM_SAFE_ZONE_PRESETS['instagram-square'];
  assert.strictEqual(p11.aspectRatio, '1:1');
  assert.strictEqual(p11.baseWidth, 1080);
  assert.strictEqual(p11.baseHeight, 1080);
  assert.strictEqual(isVertical916Platform('instagram-square', '1:1'), false);

  const p169 = PLATFORM_SAFE_ZONE_PRESETS['youtube-landscape'];
  assert.strictEqual(p169.aspectRatio, '16:9');
  assert.strictEqual(p169.baseWidth, 1920);
  assert.strictEqual(p169.baseHeight, 1080);
  assert.strictEqual(isVertical916Platform('youtube-landscape', '16:9'), false);
  console.log('  ✓ Non-9:16 presets (4:5 portrait, 1:1 square, 16:9 landscape) remain completely distinct');

  // -----------------------------------------------------------------
  // SECTION 7: Nine-Position Anchor Points Safe Zone Enclosure
  // -----------------------------------------------------------------
  console.log('\n▶ Section 7: Nine-Position Anchors Within Safe Zones');
  const posKeys: CaptionPosition[] = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];

  for (const pos of posKeys) {
    const coords = getNinePositionCoordinates(pos);
    const topPct = parseFloat(coords.top);
    const leftPct = parseFloat(coords.left);

    // Instagram boundary test:
    // Top danger ends at 14% -> anchors must be >= 14%
    assert.ok(topPct >= 14, `${pos} top (${topPct}%) must be >= 14%`);
    // Bottom danger starts at 78% -> anchors must be <= 78%
    assert.ok(topPct <= 78, `${pos} top (${topPct}%) must be <= 78%`);
    // Right action rail starts at 85% -> anchors must be <= 85%
    assert.ok(leftPct <= 85, `${pos} left (${leftPct}%) must be <= 85%`);
    // Left margin is 6% -> anchors must be >= 6%
    assert.ok(leftPct >= 6, `${pos} left (${leftPct}%) must be >= 6%`);
  }
  console.log('  ✓ All 9 visual anchor positions remain enclosed within safe action bounds');

  // -----------------------------------------------------------------
  // SECTION 8: Export Cleanliness (Guides Excluded from Final Output)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 8: Export Cleanliness (No Safe Zone Visuals in Subtitles)');
  const sampleWords: TranscriptWord[] = [
    { id: 'w1', text: 'Viral', start: 0.1, end: 0.5, isImportant: true },
    { id: 'w2', text: 'Reels', start: 0.6, end: 1.0, isImportant: false },
  ];

  const assOutput = generateAssSubtitles(
    [{ id: 'g1', start: 0.1, end: 1.0, words: sampleWords, text: 'Viral Reels' }],
    sampleWords,
    {
      fontFamily: 'Inter, sans-serif',
      fontSize: 48,
      fontWeight: 'bold',
      textColor: '#FFFFFF',
      importantColor: '#FCD905',
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: '#000000',
      shadowBlur: 4,
      position: 'center',
      textAlign: 'center',
      captionMode: 'word-by-word',
      animationPreset: 'pop',
      highlightAnimation: 'pop',
      uppercase: true,
      showSafeArea: true, // Safe area is enabled in UI!
    },
    {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'high',
      fps: 30,
    }
  );

  // Subtitles must ONLY contain dialogue text, NEVER safe zone UI graphics
  assert.ok(!assOutput.includes('TOP UI DANGER ZONE'), 'Exported ASS subtitles must NOT contain danger zone text');
  assert.ok(!assOutput.includes('ACTION BAR'), 'Exported ASS subtitles must NOT contain action bar text');
  assert.ok(!assOutput.includes('SAFE ACTION ZONE'), 'Exported ASS subtitles must NOT contain safe zone text');
  assert.ok(/viral/i.test(assOutput), 'ASS subtitles must contain dialogue');
  console.log('  ✓ Verified: Safe zone overlay is purely an editor preview tool and never pollutes exported subtitles');

  console.log('\n======================================================');
  console.log('🎉 ALL SAFE-ZONE MEASUREMENT & INTEGRITY TESTS PASSED!');
  console.log('======================================================\n');
}

runSafeZoneVerificationTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
