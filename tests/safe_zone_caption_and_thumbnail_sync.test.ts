import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getSafeZoneConfig,
  calculateSafeZonePixels,
  SafeZoneOverrides,
  PLATFORM_SAFE_ZONE_PRESETS,
} from '../src/lib/caption-maker/safe-zone';
import {
  createDefaultThumbnailSettings,
  getThumbnailDimensions,
} from '../src/lib/caption-maker/thumbnail-presets';
import {
  CaptionStyle,
  ThumbnailSettings,
  PlatformPreset,
} from '../src/lib/caption-maker/types';
import { DEFAULT_CAPTION_STYLE } from '../src/lib/caption-maker/sample-data';

describe('Safe Zone System: Unified Caption & Thumbnail Cohesion', () => {
  it('1. Verifies that all 4 vertical social platforms provide verified configs for captions and thumbnails', () => {
    const platforms: PlatformPreset[] = [
      'instagram-reel',
      'facebook-reel',
      'youtube-short',
      'threads-video',
    ];

    for (const p of platforms) {
      const config = getSafeZoneConfig(p);
      assert.strictEqual(config.baseWidth, 1080);
      assert.strictEqual(config.baseHeight, 1920);
      assert.ok(config.topDangerPercent > 0 && config.topDangerPercent <= 25);
      assert.ok(config.bottomDangerPercent > 0 && config.bottomDangerPercent <= 35);
      assert.ok(config.rightMarginPercent >= 0 && config.rightMarginPercent <= 25);
      assert.ok(config.leftMarginPercent > 0 && config.leftMarginPercent <= 15);

      // Usable safe canvas pixels
      const bounds = calculateSafeZonePixels(config, 1080, 1920);
      assert.ok(bounds.contentSafeZonePx.width > 800 && bounds.contentSafeZonePx.width < 1080);
      assert.ok(bounds.contentSafeZonePx.height > 1000 && bounds.contentSafeZonePx.height < 1920);
    }
  });

  it('2. Mathematically verifies thumbnail crop bounds (1:1 Profile Grid & 4:5 In-feed)', () => {
    const config = getSafeZoneConfig('instagram-reel');

    // 1:1 Profile grid tile on 1080x1920 canvas:
    // Height = 1080px, centered vertically:
    // (1920 - 1080) / 2 = 420px top and bottom offset
    // 420 / 1920 = 21.875%
    assert.strictEqual(config.centerSquarePercent, 21.875);

    const gridTopPx = Math.round((1920 * config.centerSquarePercent) / 100);
    const gridBottomPx = 1920 - gridTopPx;
    assert.strictEqual(gridTopPx, 420);
    assert.strictEqual(gridBottomPx, 1500);
    assert.strictEqual(gridBottomPx - gridTopPx, 1080); // Exact 1080x1080 square!

    // 4:5 In-feed crop on 1080x1920 canvas:
    // Height = 1080 * (5/4) = 1350px, centered vertically:
    // (1920 - 1350) / 2 = 285px top and bottom offset
    // 285 / 1920 = 14.84375%
    assert.strictEqual(config.feedCrop45Percent, 14.84375);

    const feedTopPx = Math.round((1920 * config.feedCrop45Percent) / 100);
    const feedBottomPx = 1920 - feedTopPx;
    assert.strictEqual(feedTopPx, 285);
    assert.strictEqual(feedBottomPx, 1635);
    assert.strictEqual(feedBottomPx - feedTopPx, 1350); // Exact 1080x1350 portrait!
  });

  it('3. Verifies safe zone overrides synchronization between caption style and thumbnail settings', () => {
    // Initial state: Caption has YouTube Shorts override
    const initialCaptionStyle: CaptionStyle = {
      ...DEFAULT_CAPTION_STYLE,
      showSafeArea: true,
      safeZoneOverrides: {
        platform: 'youtube-short',
        topDangerPercent: 12,
        bottomDangerPercent: 25,
      },
    };

    // When thumbnail settings are initialized or synced from caption style:
    const thumbnailDefaults = createDefaultThumbnailSettings('My Viral Reel', '9:16');
    const syncedThumbnailSettings: ThumbnailSettings = {
      ...thumbnailDefaults,
      showSafeArea: initialCaptionStyle.showSafeArea,
      safeZoneOverrides: initialCaptionStyle.safeZoneOverrides,
    };

    assert.strictEqual(syncedThumbnailSettings.safeZoneOverrides?.platform, 'youtube-short');
    assert.strictEqual(syncedThumbnailSettings.safeZoneOverrides?.topDangerPercent, 12);
    assert.strictEqual(syncedThumbnailSettings.safeZoneOverrides?.bottomDangerPercent, 25);

    // Compute thumbnail safe zone with synced overrides
    const thumbConfig = getSafeZoneConfig(
      syncedThumbnailSettings.safeZoneOverrides?.platform || 'instagram-reel',
      syncedThumbnailSettings.safeZoneOverrides
    );

    assert.strictEqual(thumbConfig.id, 'youtube-short');
    assert.strictEqual(thumbConfig.topDangerPercent, 12);
    assert.strictEqual(thumbConfig.bottomDangerPercent, 25);
    assert.strictEqual(thumbConfig.sourceType, 'user-custom');

    // Now user switches platform from Thumbnail panel to Facebook Reels:
    const updatedThumbSettings: ThumbnailSettings = {
      ...syncedThumbnailSettings,
      safeZoneOverrides: {
        platform: 'facebook-reel',
        topDangerPercent: undefined,
        bottomDangerPercent: undefined,
      },
    };

    // Synced back to caption style:
    const syncedCaptionStyle: CaptionStyle = {
      ...initialCaptionStyle,
      safeZoneOverrides: updatedThumbSettings.safeZoneOverrides,
    };

    const captionConfig = getSafeZoneConfig(
      syncedCaptionStyle.safeZoneOverrides?.platform || 'instagram-reel',
      syncedCaptionStyle.safeZoneOverrides
    );

    assert.strictEqual(captionConfig.id, 'facebook-reel');
    assert.strictEqual(captionConfig.topDangerPercent, 14);
    assert.strictEqual(captionConfig.bottomDangerPercent, 26);
    assert.strictEqual(captionConfig.sourceType, 'official-meta');
  });

  it('4. Verifies responsive scaling equivalence for thumbnail and caption canvases', () => {
    const config = getSafeZoneConfig('instagram-reel');
    const previewSizes = [360, 400, 480, 540, 720, 1080];

    for (const width of previewSizes) {
      const height = Math.round(width * (16 / 9));
      const bounds = calculateSafeZonePixels(config, width, height);

      // Verify that ratios relative to container match original 1080x1920 proportions
      const topRatio = bounds.topDangerPx.height / height;
      const bottomRatio = bounds.bottomDangerPx.height / height;
      const leftRatio = bounds.contentSafeZonePx.x / width;

      assert.ok(Math.abs(topRatio - config.topDangerPercent / 100) < 0.02);
      assert.ok(Math.abs(bottomRatio - config.bottomDangerPercent / 100) < 0.02);
      assert.ok(Math.abs(leftRatio - config.leftMarginPercent / 100) < 0.02);
    }
  });

  it('5. Verifies that thumbnail dimensions correspond to standard platform formats', () => {
    assert.deepStrictEqual(getThumbnailDimensions('9:16'), { width: 1080, height: 1920 });
    assert.deepStrictEqual(getThumbnailDimensions('4:5'), { width: 1080, height: 1350 });
    assert.deepStrictEqual(getThumbnailDimensions('1:1'), { width: 1080, height: 1080 });
    assert.deepStrictEqual(getThumbnailDimensions('16:9'), { width: 1920, height: 1080 });
  });
});
