/**
 * ReelSpark Platform Intelligence Engine
 * Curated technical limits, policies, and best practices for social networks.
 *
 * Platform policies change frequently. Treat these values as a reference and
 * re-check the linked source before publishing.
 */

import { PlatformConfig, SocialPlatformKey } from './types';

export const PLATFORM_CONFIGS: Record<SocialPlatformKey, PlatformConfig> = {
  instagram: {
    key: 'instagram',
    name: 'Instagram',
    iconName: 'Instagram',
    officialDomain: 'instagram.com',
    supportedContentTypes: ['reel', 'post', 'story'],
    characterLimits: {
      maxTotal: 2200,
      captionPreFold: 125,
    },
    hashtagRules: {
      maxAllowed: 30,
      recommendedMin: 3,
      recommendedMax: 5,
      notes: 'Instagram allows up to 30 hashtags. Algorithmic analysis confirms 3-5 hyper-relevant tags yield superior reach without looking spammy.',
    },
    linkCapabilities: {
      supportedInCaption: true,
      clickableInCaption: false,
      notes: 'URLs in Instagram feed captions and Reels are rendered as unclickable plain text. Use "Link in Bio" or Stories sticker for clickable links.',
    },
    mediaRecommendations: {
      recommendedAspectRatio: '9:16 (1080x1920) for Reels, 4:5 (1080x1350) for Feed',
      maxDurationSeconds: 90,
      resolution: '1080x1920',
    },
    rules: [
      {
        id: 'ig_char_limit',
        title: 'Caption Character Limit',
        ruleType: 'mandatory',
        description: 'Instagram enforces an absolute hard maximum of 2,200 characters per caption.',
        value: 2200,
        unit: 'characters',
        sourceUrl: 'https://help.instagram.com/',
        lastVerified: '2026-10',
      },
      {
        id: 'ig_fold_limit',
        title: 'Visible Hook Before "...more"',
        ruleType: 'recommended_best_practice',
        description: 'First 125 characters appear before the "...more" truncation on mobile feeds.',
        value: 125,
        unit: 'characters',
        sourceUrl: 'https://business.instagram.com/blog',
        lastVerified: '2026-10',
      },
      {
        id: 'ig_hashtag_limit',
        title: 'Hashtag Maximum',
        ruleType: 'platform_policy',
        description: 'Posts containing more than 30 hashtags cannot be published.',
        value: 30,
        unit: 'hashtags',
        sourceUrl: 'https://help.instagram.com/',
        lastVerified: '2026-10',
      },
      {
        id: 'ig_unclickable_link',
        title: 'Plain-Text Caption URLs',
        ruleType: 'platform_policy',
        description: 'Links in Instagram caption descriptions are not clickable by followers.',
        sourceUrl: 'https://help.instagram.com/',
        lastVerified: '2026-10',
      },
    ],
  },

  youtube: {
    key: 'youtube',
    name: 'YouTube Shorts',
    iconName: 'Youtube',
    officialDomain: 'youtube.com',
    supportedContentTypes: ['short', 'video'],
    characterLimits: {
      maxTotal: 5000,
      titleMax: 100,
      captionPreFold: 150,
    },
    hashtagRules: {
      maxAllowed: 60,
      recommendedMin: 3,
      recommendedMax: 5,
      notes: 'YouTube allows hashtags in title and description. Exceeding 60 hashtags causes YouTube to ignore ALL hashtags on the video.',
    },
    linkCapabilities: {
      supportedInCaption: true,
      clickableInCaption: true,
      notes: 'URLs placed in YouTube video and Shorts descriptions are active clickable hyperlinks.',
    },
    mediaRecommendations: {
      recommendedAspectRatio: '9:16 (1080x1920) for Shorts, 16:9 (1920x1080) for Standard',
      maxDurationSeconds: 180,
      resolution: '1080x1920',
    },
    rules: [
      {
        id: 'yt_desc_limit',
        title: 'Description Character Limit',
        ruleType: 'mandatory',
        description: 'YouTube description box allows up to 5,000 characters.',
        value: 5000,
        unit: 'characters',
        sourceUrl: 'https://support.google.com/youtube/answer/6140493',
        lastVerified: '2026-10',
      },
      {
        id: 'yt_title_limit',
        title: 'Video Title Character Limit',
        ruleType: 'mandatory',
        description: 'YouTube video titles must not exceed 100 characters.',
        value: 100,
        unit: 'characters',
        sourceUrl: 'https://support.google.com/youtube/answer/57404',
        lastVerified: '2026-10',
      },
      {
        id: 'yt_hashtag_policy',
        title: 'Hashtag Overuse Penalty',
        ruleType: 'platform_policy',
        description: 'If a video has more than 60 hashtags, YouTube ignores every hashtag on that video.',
        value: 60,
        unit: 'hashtags',
        sourceUrl: 'https://support.google.com/youtube/answer/6390658',
        lastVerified: '2026-10',
      },
      {
        id: 'yt_shorts_duration',
        title: 'Shorts 3-Minute Duration Limit',
        ruleType: 'mandatory',
        description: 'Square or vertical videos uploaded after October 15, 2024 can qualify as YouTube Shorts when they are up to 3 minutes long.',
        value: 180,
        unit: 'seconds',
        sourceUrl: 'https://support.google.com/youtube/answer/15424877',
        lastVerified: '2026-10',
      },
    ],
  },

  facebook: {
    key: 'facebook',
    name: 'Facebook',
    iconName: 'Facebook',
    officialDomain: 'facebook.com',
    supportedContentTypes: ['reel', 'post'],
    characterLimits: {
      maxTotal: 63206,
      captionPreFold: 200,
    },
    hashtagRules: {
      maxAllowed: 30,
      recommendedMin: 2,
      recommendedMax: 3,
      notes: 'Facebook supports hashtags. Using 2-3 focused hashtags is recommended to avoid clutter.',
    },
    linkCapabilities: {
      supportedInCaption: true,
      clickableInCaption: true,
      notes: 'Links in Facebook post captions and Reel descriptions are active clickable URLs.',
    },
    mediaRecommendations: {
      recommendedAspectRatio: '9:16 (1080x1920) for Reels, 1:1 (1080x1080) for Feed',
      maxDurationSeconds: 90,
      resolution: '1080x1920',
    },
    rules: [
      {
        id: 'fb_char_limit',
        title: 'Post Character Limit',
        ruleType: 'mandatory',
        description: 'Facebook posts support up to 63,206 characters.',
        value: 63206,
        unit: 'characters',
        sourceUrl: 'https://www.facebook.com/business/help',
        lastVerified: '2026-10',
      },
      {
        id: 'fb_fold_limit',
        title: 'Truncation Line',
        ruleType: 'recommended_best_practice',
        description: 'Text after approximately 200 characters is placed behind "See More".',
        value: 200,
        unit: 'characters',
        sourceUrl: 'https://www.facebook.com/business/help',
        lastVerified: '2026-10',
      },
    ],
  },

  threads: {
    key: 'threads',
    name: 'Threads',
    iconName: 'MessageCircle',
    officialDomain: 'threads.net',
    supportedContentTypes: ['post', 'video_post'],
    characterLimits: {
      maxTotal: 500,
      captionPreFold: 500,
    },
    hashtagRules: {
      maxAllowed: 5,
      recommendedMin: 1,
      recommendedMax: 2,
      notes: 'Threads prioritizes conversational discussion. Single topic tags or 1-2 hashtags are standard.',
    },
    linkCapabilities: {
      supportedInCaption: true,
      clickableInCaption: true,
      notes: 'URLs are clickable and generate rich link previews, but characters in the URL count toward the 500-char total.',
    },
    mediaRecommendations: {
      recommendedAspectRatio: '9:16 (1080x1920) or 1:1',
      maxDurationSeconds: 300,
      resolution: '1080x1920',
    },
    rules: [
      {
        id: 'threads_hard_limit',
        title: '500-Character Hard Limit',
        ruleType: 'mandatory',
        description: 'Threads strictly rejects posts exceeding 500 characters. All links, text, and hashtags count.',
        value: 500,
        unit: 'characters',
        sourceUrl: 'https://help.instagram.com/threads',
        lastVerified: '2026-10',
      },
      {
        id: 'threads_link_cost',
        title: 'Link Length Character Impact',
        ruleType: 'mandatory',
        description: 'URLs count toward the 500-character post limit. Keep link lists concise.',
        sourceUrl: 'https://help.instagram.com/threads',
        lastVerified: '2026-10',
      },
    ],
  },

  website: {
    key: 'website',
    name: 'Website / Blog',
    iconName: 'Globe',
    officialDomain: '',
    supportedContentTypes: ['post'],
    characterLimits: {
      maxTotal: 10000,
    },
    hashtagRules: {
      maxAllowed: 10,
      recommendedMin: 0,
      recommendedMax: 5,
      notes: 'Tags and keywords for SEO and article search.',
    },
    linkCapabilities: {
      supportedInCaption: true,
      clickableInCaption: true,
      notes: 'Standard web hyperlinks supported.',
    },
    mediaRecommendations: {
      recommendedAspectRatio: '16:9 or 1:1',
      maxDurationSeconds: 600,
      resolution: '1920x1080',
    },
    rules: [
      {
        id: 'web_standard',
        title: 'Universal Web Content',
        ruleType: 'optional_guidance',
        description: 'Standard blog post or website copy with custom branding.',
        sourceUrl: '',
        lastVerified: '2026-10',
      },
    ],
  },
};

/**
 * Get platform configuration by key with safe fallback.
 */
export function getPlatformConfig(platformKey: SocialPlatformKey | string): PlatformConfig {
  const normalizedKey = (platformKey || '').toLowerCase() as SocialPlatformKey;
  return PLATFORM_CONFIGS[normalizedKey] || PLATFORM_CONFIGS.instagram;
}

/**
 * Official 2026 Platform Description / Caption Limits Reference
 * - Instagram Reels: Max 2,200 chars | Rec: 150–500 chars | Truncation: ~125 chars
 * - Facebook Reels:  Max 5,000 chars | Rec: 150–500 chars | Truncation: ~200 chars
 * - Threads video:   Max 500 chars   | Rec: 100–350 chars | Truncation: 500 chars
 * - YouTube Shorts:  Max 5,000 chars | Rec: 200–1,000 chars | Truncation: ~150 chars
 * - All Platforms:   Max 500 chars   | Rec: 100–350 chars | Truncation: ~125 chars
 */
export interface PlatformDescriptionLimit {
  max: number;
  recMin: number;
  recMax: number;
  preFold: number;
  label: string;
  notes?: string;
}

export const PLATFORM_DESCRIPTION_LIMITS: Record<string, PlatformDescriptionLimit> = {
  instagram: {
    max: 2200,
    recMin: 150,
    recMax: 500,
    preFold: 125,
    label: 'Instagram Reels',
    notes: 'Max 2,200 chars. Recommended: 150–500 chars. First ~125 chars visible before "...more".',
  },
  facebook: {
    max: 5000,
    recMin: 150,
    recMax: 500,
    preFold: 200,
    label: 'Facebook Reels',
    notes: 'Max 5,000 chars for Reels. Recommended: 150–500 chars.',
  },
  threads: {
    max: 500,
    recMin: 100,
    recMax: 350,
    preFold: 500,
    label: 'Threads Video',
    notes: 'Hard max 500 chars. Recommended: 100–350 chars.',
  },
  youtube: {
    max: 5000,
    recMin: 200,
    recMax: 1000,
    preFold: 150,
    label: 'YouTube Shorts',
    notes: 'Max 5,000 characters. Recommended: 200–1,000 chars. Active clickable hyperlinks.',
  },
  all: {
    max: 500,
    recMin: 100,
    recMax: 350,
    preFold: 125,
    label: 'All Platforms',
    notes: 'Constrained by Threads (500 chars max) so one copy works everywhere.',
  },
};

export function getPlatformDescriptionLimit(platformKey: string): PlatformDescriptionLimit {
  const key = (platformKey || '').toLowerCase();
  return PLATFORM_DESCRIPTION_LIMITS[key] || PLATFORM_DESCRIPTION_LIMITS.all;
}

/**
 * Validate whether a platform key is recognized.
 */
export function isRecognizedPlatform(key: string): key is SocialPlatformKey {
  return ['facebook', 'youtube', 'instagram', 'threads', 'website'].includes(key.toLowerCase());
}
