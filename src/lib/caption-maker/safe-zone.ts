/**
 * Social Media Safe-Zone & UI Danger Zone Specifications
 *
 * Provides mathematically verified and configurable safe-zone coordinates
 * for vertical 9:16 video formats (1080 × 1920):
 * - Instagram Reels
 * - Facebook Reels
 * - YouTube Shorts
 * - Threads Video
 *
 * And non-9:16 feed formats:
 * - Instagram Portrait (4:5, 1080 × 1350)
 * - Square Feed (1:1, 1080 × 1080)
 * - YouTube Landscape (16:9, 1920 × 1080)
 *
 * Sources:
 * - Meta Business Guidelines (Reels Ads & Organic Placements: 14% top, 20-35% bottom, 6% sides)
 * - YouTube Creator Academy (Shorts Safe Zone: ~380px top/bottom, ~120-140px right action rail)
 * - Meta Threads Video Specifications
 */

import { PlatformPreset } from './types';

export type SafeZoneSourceType =
  | 'official-meta'
  | 'youtube-standards'
  | 'platform-spec'
  | 'user-custom';

export interface SafeZonePixelBounds {
  topDangerPx: { x: number; y: number; width: number; height: number };
  bottomDangerPx: { x: number; y: number; width: number; height: number };
  bottomWarningPx?: { x: number; y: number; width: number; height: number };
  rightActionBarPx?: { x: number; y: number; width: number; height: number };
  contentSafeZonePx: { x: number; y: number; width: number; height: number };
  headlineSafeZonePx: { x: number; y: number; width: number; height: number };
  subjectFaceGuidePx: { x: number; y: number; width: number; height: number; eyeLineY: number };
  feedCrop45Px?: { y1: number; y2: number; height: number };
  feedCrop11Px?: { y1: number; y2: number; height: number };
}

export interface SafeZoneOverrides {
  platform?: PlatformPreset;
  topDangerPercent?: number;
  bottomDangerPercent?: number;
  rightMarginPercent?: number;
  leftMarginPercent?: number;
  showFaceGuide?: boolean;
  showCropGuides?: boolean;
  showActionRail?: boolean;
  showDangerZones?: boolean;
  showSafeActionBox?: boolean;
  showHeadlineBox?: boolean;
}

export interface SafeZoneConfig {
  id: PlatformPreset;
  name: string;
  shortName: string;
  sourceType: SafeZoneSourceType;
  sourceLabel: string;
  sourceNotes: string;
  isOfficial: boolean;
  aspectRatio: string;
  baseWidth: number;
  baseHeight: number;
  topDangerPercent: number; // e.g. 14 for 14%
  bottomDangerPercent: number; // e.g. 22 for 22%
  bottomWarningPercent?: number; // e.g. 35 for 35% expanded caption
  leftMarginPercent: number; // e.g. 6 for 6%
  rightMarginPercent: number; // e.g. 15 for 15% (action rail) or 6 for Threads
  hasRightActionBar: boolean;
  actionBarWidthPercent: number;
  actionBarTopPercent: number;
  actionBarBottomPercent: number;
  actionBarIcons: string[];
  headlineSafeTopPercent: number; // e.g. 15
  headlineSafeBottomPercent: number; // e.g. 26
  subjectFaceTopPercent: number; // e.g. 28
  subjectFaceBottomPercent: number; // e.g. 44
  subjectEyeLinePercent: number; // e.g. 34
  centerSquarePercent: number; // 21.875
  feedCrop45Percent: number; // 14.84375
  hasScrubberBar?: boolean;
  topDescription: string;
  bottomDescription: string;
  actionBarDescription: string;
}

/**
 * Standard Verified Safe Zone Presets for Supported Platforms
 */
export const PLATFORM_SAFE_ZONE_PRESETS: Record<PlatformPreset, SafeZoneConfig> = {
  // 1. INSTAGRAM REELS (9:16 Vertical, 1080 × 1920)
  'instagram-reel': {
    id: 'instagram-reel',
    name: 'Instagram Reels',
    shortName: 'IG Reels',
    sourceType: 'official-meta',
    sourceLabel: 'Official Meta Guidelines',
    sourceNotes: 'Meta standard: 14% top header (~269px), 20-35% bottom footprint (~422px standard, ~672px expanded captions), 6% left, 15% right rail.',
    isOfficial: true,
    aspectRatio: '9:16',
    baseWidth: 1080,
    baseHeight: 1920,
    topDangerPercent: 14.0, // ~269px
    bottomDangerPercent: 22.0, // ~422px
    bottomWarningPercent: 35.0, // ~672px (expanded captions/stickers)
    leftMarginPercent: 6.0, // ~65px
    rightMarginPercent: 15.0, // ~162px
    hasRightActionBar: true,
    actionBarWidthPercent: 15.0,
    actionBarTopPercent: 38.0,
    actionBarBottomPercent: 22.0,
    actionBarIcons: ['♥', '💬', '↗', '•••', '🎵'],
    headlineSafeTopPercent: 15.0,
    headlineSafeBottomPercent: 26.0,
    subjectFaceTopPercent: 28.0,
    subjectFaceBottomPercent: 44.0,
    subjectEyeLinePercent: 34.0,
    centerSquarePercent: 21.875, // 1080x1080 Profile Grid
    feedCrop45Percent: 14.84375, // 1080x1350 In-Feed Crop
    hasScrubberBar: false,
    topDescription: 'Stories Header / Audio Search / Status Bar',
    bottomDescription: '@handle, Follow Button, Caption & Audio Marquee',
    actionBarDescription: 'Like, Comment, Share, More & Audio Disc',
  },

  // 2. FACEBOOK REELS (9:16 Vertical, 1080 × 1920)
  'facebook-reel': {
    id: 'facebook-reel',
    name: 'Facebook Reels',
    shortName: 'FB Reels',
    sourceType: 'official-meta',
    sourceLabel: 'Official Meta Guidelines',
    sourceNotes: 'Meta standard: 14% top header, 26% bottom footprint due to persistent Facebook App bottom navigation tabs + creator overlay.',
    isOfficial: true,
    aspectRatio: '9:16',
    baseWidth: 1080,
    baseHeight: 1920,
    topDangerPercent: 14.0, // ~269px
    bottomDangerPercent: 26.0, // ~500px (reel captions + FB app nav tabs)
    bottomWarningPercent: 35.0, // ~672px
    leftMarginPercent: 6.0, // ~65px
    rightMarginPercent: 14.0, // ~151px
    hasRightActionBar: true,
    actionBarWidthPercent: 14.0,
    actionBarTopPercent: 42.0,
    actionBarBottomPercent: 26.0,
    actionBarIcons: ['👍', '💬', '↗', '•••'],
    headlineSafeTopPercent: 15.0,
    headlineSafeBottomPercent: 26.0,
    subjectFaceTopPercent: 28.0,
    subjectFaceBottomPercent: 44.0,
    subjectEyeLinePercent: 34.0,
    centerSquarePercent: 21.875,
    feedCrop45Percent: 14.84375,
    hasScrubberBar: false,
    topDescription: 'Facebook Header / Search / Camera / Sound Toggle',
    bottomDescription: 'Page Name, Follow, Caption & FB App Nav Bar',
    actionBarDescription: 'Like, Comment, Share & More Menu',
  },

  // 3. YOUTUBE SHORTS (9:16 Vertical, 1080 × 1920)
  'youtube-short': {
    id: 'youtube-short',
    name: 'YouTube Shorts',
    shortName: 'YT Shorts',
    sourceType: 'youtube-standards',
    sourceLabel: 'YouTube Creator Standards',
    sourceNotes: 'YouTube Shorts standard: 10% top navigation (~192px), 23% bottom overlay (~442px for subscribe pill & title), 14% right rail, 1.2% scrubber.',
    isOfficial: true,
    aspectRatio: '9:16',
    baseWidth: 1080,
    baseHeight: 1920,
    topDangerPercent: 10.0, // ~192px
    bottomDangerPercent: 23.0, // ~442px
    bottomWarningPercent: 30.0,
    leftMarginPercent: 5.5, // ~60px
    rightMarginPercent: 14.0, // ~151px
    hasRightActionBar: true,
    actionBarWidthPercent: 14.0,
    actionBarTopPercent: 32.0,
    actionBarBottomPercent: 23.0,
    actionBarIcons: ['👍', '👎', '💬', '↗', '⚡', '🎵'],
    headlineSafeTopPercent: 11.0,
    headlineSafeBottomPercent: 23.0,
    subjectFaceTopPercent: 25.0,
    subjectFaceBottomPercent: 42.0,
    subjectEyeLinePercent: 32.0,
    centerSquarePercent: 21.875,
    feedCrop45Percent: 14.84375,
    hasScrubberBar: true,
    topDescription: 'Search / Camera / 3-Dots Menu',
    bottomDescription: 'Channel @handle, Subscribe Button & Title',
    actionBarDescription: 'Thumbs Up/Down, Comments, Share & Remix',
  },

  // 4. THREADS VIDEO (9:16 Vertical, 1080 × 1920)
  'threads-video': {
    id: 'threads-video',
    name: 'Threads Video',
    shortName: 'Threads',
    sourceType: 'platform-spec',
    sourceLabel: 'Meta Threads Standards',
    sourceNotes: 'Threads player: 9% top bar, 20% bottom interaction row (heart, reply, repost, share). No right action rail (horizontal actions).',
    isOfficial: true,
    aspectRatio: '9:16',
    baseWidth: 1080,
    baseHeight: 1920,
    topDangerPercent: 9.0, // ~173px
    bottomDangerPercent: 20.0, // ~384px
    bottomWarningPercent: 28.0,
    leftMarginPercent: 6.0, // ~65px
    rightMarginPercent: 6.0, // ~65px (no vertical right rail)
    hasRightActionBar: false,
    actionBarWidthPercent: 0,
    actionBarTopPercent: 0,
    actionBarBottomPercent: 0,
    actionBarIcons: [],
    headlineSafeTopPercent: 10.0,
    headlineSafeBottomPercent: 22.0,
    subjectFaceTopPercent: 24.0,
    subjectFaceBottomPercent: 42.0,
    subjectEyeLinePercent: 32.0,
    centerSquarePercent: 21.875,
    feedCrop45Percent: 14.84375,
    hasScrubberBar: true,
    topDescription: 'Back Chevron / Threads Header / Audio Toggle',
    bottomDescription: 'Author Handle, Caption, Reply, Repost & Share',
    actionBarDescription: 'Full-width clearance (no vertical right rail)',
  },

  // 5. INSTAGRAM PORTRAIT (4:5 Feed Post, 1080 × 1350)
  'instagram-portrait': {
    id: 'instagram-portrait',
    name: 'Instagram Portrait (4:5)',
    shortName: '4:5 Feed',
    sourceType: 'official-meta',
    sourceLabel: 'Meta In-Feed Specifications',
    sourceNotes: 'Instagram 4:5 in-feed post: 8% top author header, 10% bottom engagement buttons, 10% profile square crop.',
    isOfficial: true,
    aspectRatio: '4:5',
    baseWidth: 1080,
    baseHeight: 1350,
    topDangerPercent: 8.0,
    bottomDangerPercent: 10.0,
    leftMarginPercent: 6.0,
    rightMarginPercent: 6.0,
    hasRightActionBar: false,
    actionBarWidthPercent: 0,
    actionBarTopPercent: 0,
    actionBarBottomPercent: 0,
    actionBarIcons: [],
    headlineSafeTopPercent: 9.0,
    headlineSafeBottomPercent: 22.0,
    subjectFaceTopPercent: 24.0,
    subjectFaceBottomPercent: 45.0,
    subjectEyeLinePercent: 33.0,
    centerSquarePercent: 10.0, // Center 1080px of 1350px = (1350-1080)/2/1350 = 10%
    feedCrop45Percent: 0,
    hasScrubberBar: false,
    topDescription: 'Account Username & Options Menu',
    bottomDescription: 'Like / Comment / Bookmark Row',
    actionBarDescription: 'No right action rail',
  },

  // 6. INSTAGRAM SQUARE (1:1 Feed Post, 1080 × 1080)
  'instagram-square': {
    id: 'instagram-square',
    name: 'Square Feed (1:1)',
    shortName: '1:1 Square',
    sourceType: 'official-meta',
    sourceLabel: 'Meta Feed Specifications',
    sourceNotes: 'Instagram 1:1 square post: 6% top header, 8% bottom action bar.',
    isOfficial: true,
    aspectRatio: '1:1',
    baseWidth: 1080,
    baseHeight: 1080,
    topDangerPercent: 6.0,
    bottomDangerPercent: 8.0,
    leftMarginPercent: 5.0,
    rightMarginPercent: 5.0,
    hasRightActionBar: false,
    actionBarWidthPercent: 0,
    actionBarTopPercent: 0,
    actionBarBottomPercent: 0,
    actionBarIcons: [],
    headlineSafeTopPercent: 7.0,
    headlineSafeBottomPercent: 22.0,
    subjectFaceTopPercent: 24.0,
    subjectFaceBottomPercent: 48.0,
    subjectEyeLinePercent: 34.0,
    centerSquarePercent: 0,
    feedCrop45Percent: 0,
    hasScrubberBar: false,
    topDescription: 'Account Header',
    bottomDescription: 'Action Row & Likes Count',
    actionBarDescription: 'No right action rail',
  },

  // 7. YOUTUBE LANDSCAPE (16:9 Widescreen, 1920 × 1080)
  'youtube-landscape': {
    id: 'youtube-landscape',
    name: 'YouTube Landscape (16:9)',
    shortName: '16:9 Cinema',
    sourceType: 'youtube-standards',
    sourceLabel: 'YouTube Player Specifications',
    sourceNotes: 'YouTube 16:9 player: 8% top title bar, 14% bottom timeline scrubber & player controls.',
    isOfficial: true,
    aspectRatio: '16:9',
    baseWidth: 1920,
    baseHeight: 1080,
    topDangerPercent: 8.0,
    bottomDangerPercent: 14.0,
    leftMarginPercent: 5.0,
    rightMarginPercent: 5.0,
    hasRightActionBar: false,
    actionBarWidthPercent: 0,
    actionBarTopPercent: 0,
    actionBarBottomPercent: 0,
    actionBarIcons: [],
    headlineSafeTopPercent: 9.0,
    headlineSafeBottomPercent: 24.0,
    subjectFaceTopPercent: 22.0,
    subjectFaceBottomPercent: 46.0,
    subjectEyeLinePercent: 33.0,
    centerSquarePercent: 0,
    feedCrop45Percent: 0,
    hasScrubberBar: true,
    topDescription: 'Title, Channel Name & Share Icon',
    bottomDescription: 'Timeline Scrubber, Volume & Fullscreen Controls',
    actionBarDescription: 'No right action rail',
  },

  // 8. CUSTOM SIZE (Fallback)
  'custom': {
    id: 'custom',
    name: 'Custom Safe Zone',
    shortName: 'Custom',
    sourceType: 'user-custom',
    sourceLabel: 'User-Adjustable Custom Safe Zone',
    sourceNotes: 'Configurable custom dimensions and margins.',
    isOfficial: false,
    aspectRatio: 'custom',
    baseWidth: 1080,
    baseHeight: 1920,
    topDangerPercent: 14.0,
    bottomDangerPercent: 22.0,
    leftMarginPercent: 6.0,
    rightMarginPercent: 15.0,
    hasRightActionBar: true,
    actionBarWidthPercent: 15.0,
    actionBarTopPercent: 38.0,
    actionBarBottomPercent: 22.0,
    actionBarIcons: ['♥', '💬', '↗'],
    headlineSafeTopPercent: 15.0,
    headlineSafeBottomPercent: 26.0,
    subjectFaceTopPercent: 28.0,
    subjectFaceBottomPercent: 44.0,
    subjectEyeLinePercent: 34.0,
    centerSquarePercent: 21.875,
    feedCrop45Percent: 14.84375,
    hasScrubberBar: false,
    topDescription: 'Top Custom Exclusion Zone',
    bottomDescription: 'Bottom Custom Exclusion Zone',
    actionBarDescription: 'Right Side Custom Exclusion',
  },
};

/**
 * Resolve effective SafeZoneConfig with optional user overrides
 */
export function getSafeZoneConfig(
  preset: PlatformPreset = 'instagram-reel',
  overrides?: SafeZoneOverrides
): SafeZoneConfig {
  const effectivePresetKey = overrides?.platform || preset || 'instagram-reel';
  const basePreset =
    PLATFORM_SAFE_ZONE_PRESETS[effectivePresetKey] ||
    PLATFORM_SAFE_ZONE_PRESETS['instagram-reel'];

  if (!overrides) return basePreset;

  const isCustomized =
    overrides.topDangerPercent !== undefined ||
    overrides.bottomDangerPercent !== undefined ||
    overrides.rightMarginPercent !== undefined ||
    overrides.leftMarginPercent !== undefined;

  return {
    ...basePreset,
    sourceType: isCustomized ? 'user-custom' : basePreset.sourceType,
    sourceLabel: isCustomized ? 'User-Adjusted Custom Safe Zone' : basePreset.sourceLabel,
    isOfficial: isCustomized ? false : basePreset.isOfficial,
    topDangerPercent: overrides.topDangerPercent ?? basePreset.topDangerPercent,
    bottomDangerPercent: overrides.bottomDangerPercent ?? basePreset.bottomDangerPercent,
    leftMarginPercent: overrides.leftMarginPercent ?? basePreset.leftMarginPercent,
    rightMarginPercent: overrides.rightMarginPercent ?? basePreset.rightMarginPercent,
    actionBarWidthPercent:
      basePreset.hasRightActionBar
        ? (overrides.rightMarginPercent ?? basePreset.actionBarWidthPercent)
        : basePreset.actionBarWidthPercent,
  };
}

/**
 * Calculate pixel coordinates for a given configuration and canvas/preview dimension
 */
export function calculateSafeZonePixels(
  config: SafeZoneConfig,
  canvasWidth: number,
  canvasHeight: number
): SafeZonePixelBounds {
  const topH = Math.round(canvasHeight * (config.topDangerPercent / 100));
  const bottomH = Math.round(canvasHeight * (config.bottomDangerPercent / 100));
  const leftM = Math.round(canvasWidth * (config.leftMarginPercent / 100));
  const rightM = Math.round(canvasWidth * (config.rightMarginPercent / 100));

  const safeW = canvasWidth - (leftM + rightM);
  const safeH = canvasHeight - (topH + bottomH);

  const headlineTop = Math.round(canvasHeight * (config.headlineSafeTopPercent / 100));
  const headlineBottom = Math.round(canvasHeight * (config.headlineSafeBottomPercent / 100));

  const faceTop = Math.round(canvasHeight * (config.subjectFaceTopPercent / 100));
  const faceBottom = Math.round(canvasHeight * (config.subjectFaceBottomPercent / 100));
  const eyeLineY = Math.round(canvasHeight * (config.subjectEyeLinePercent / 100));

  const bounds: SafeZonePixelBounds = {
    topDangerPx: { x: 0, y: 0, width: canvasWidth, height: topH },
    bottomDangerPx: { x: 0, y: canvasHeight - bottomH, width: canvasWidth, height: bottomH },
    contentSafeZonePx: { x: leftM, y: topH, width: safeW, height: safeH },
    headlineSafeZonePx: {
      x: leftM,
      y: headlineTop,
      width: safeW,
      height: headlineBottom - headlineTop,
    },
    subjectFaceGuidePx: {
      x: Math.round(canvasWidth * 0.15),
      y: faceTop,
      width: Math.round(canvasWidth * 0.70),
      height: faceBottom - faceTop,
      eyeLineY,
    },
  };

  if (config.bottomWarningPercent) {
    const warningH = Math.round(canvasHeight * (config.bottomWarningPercent / 100));
    bounds.bottomWarningPx = {
      x: 0,
      y: canvasHeight - warningH,
      width: canvasWidth,
      height: warningH - bottomH,
    };
  }

  if (config.hasRightActionBar && config.actionBarWidthPercent > 0) {
    const barW = Math.round(canvasWidth * (config.actionBarWidthPercent / 100));
    const barTop = Math.round(canvasHeight * (config.actionBarTopPercent / 100));
    const barBottom = Math.round(canvasHeight * (config.actionBarBottomPercent / 100));
    bounds.rightActionBarPx = {
      x: canvasWidth - barW,
      y: barTop,
      width: barW,
      height: canvasHeight - (barTop + barBottom),
    };
  }

  if (config.feedCrop45Percent > 0) {
    const cropMargin = Math.round(canvasHeight * (config.feedCrop45Percent / 100));
    bounds.feedCrop45Px = {
      y1: cropMargin,
      y2: canvasHeight - cropMargin,
      height: canvasHeight - cropMargin * 2,
    };
  }

  if (config.centerSquarePercent > 0) {
    const cropMargin = Math.round(canvasHeight * (config.centerSquarePercent / 100));
    bounds.feedCrop11Px = {
      y1: cropMargin,
      y2: canvasHeight - cropMargin,
      height: canvasHeight - cropMargin * 2,
    };
  }

  return bounds;
}

/**
 * Returns true if the platform uses the 9:16 vertical canvas (1080 × 1920)
 */
export function isVertical916Platform(
  preset?: PlatformPreset,
  aspectRatio?: string
): boolean {
  if (aspectRatio === '9:16') return true;
  if (!preset) return true;
  return (
    preset === 'instagram-reel' ||
    preset === 'facebook-reel' ||
    preset === 'youtube-short' ||
    preset === 'threads-video' ||
    preset === 'custom'
  );
}
