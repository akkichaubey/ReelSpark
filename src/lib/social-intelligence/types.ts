/**
 * ReelSpark Smart Social Intelligence System — Core Types
 */

export type SocialPlatformKey = 'facebook' | 'youtube' | 'instagram' | 'threads' | 'website';

export type PlatformContentType =
  | 'reel'
  | 'short'
  | 'post'
  | 'story'
  | 'video'
  | 'video_post';

export interface SocialAccount {
  id: string;
  userId: string;
  platform: SocialPlatformKey;
  accountUrl: string;
  displayName?: string;
  isPrimary: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedHashtag {
  id: string;
  tag: string;
  enabled: boolean;
}

export interface SocialLinkPreferences {
  userId: string;
  includeWebsite: boolean;
  includeOtherSocials: boolean;
  excludeTargetPlatform: boolean;
  customHeading: string;
  threeDotsSpacer?: boolean; // When true, prepends 3 vertical dots spacer (. . .) above heading in post descriptions
  displaySeparateLines: boolean;
  linkOrder: string[]; // Ordered platform or account IDs
  eligibleAccountIds: string[]; // Specific IDs enabled
  fixedHashtags?: SavedHashtag[]; // User's fixed hashtags like #truevoiceclub
  updatedAt: string;
}

export interface ExtendedUserProfile {
  userId: string;
  name: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  preferences: {
    defaultTone?: string;
    defaultLanguage?: string;
    defaultPlatform?: SocialPlatformKey | 'all';
    defaultContentType?: PlatformContentType;
    fixedHashtags?: SavedHashtag[];
  };
  updatedAt: string;
}

// ─── Platform Rules Intelligence Types ───────────────────────────────────────

export type RuleSeverity = 'mandatory' | 'platform_policy' | 'recommended_best_practice' | 'optional_guidance';

export interface PlatformLimitRule {
  id: string;
  title: string;
  ruleType: RuleSeverity;
  description: string;
  value?: number | string;
  unit?: string;
  sourceUrl?: string;
  lastVerified?: string;
}

export interface PlatformConfig {
  key: SocialPlatformKey;
  name: string;
  iconName: string;
  officialDomain: string;
  supportedContentTypes: PlatformContentType[];
  characterLimits: {
    maxTotal: number;
    titleMax?: number;
    captionPreFold?: number;
  };
  hashtagRules: {
    maxAllowed: number;
    recommendedMin: number;
    recommendedMax: number;
    notes: string;
  };
  linkCapabilities: {
    supportedInCaption: boolean;
    clickableInCaption: boolean;
    notes: string;
  };
  mediaRecommendations: {
    recommendedAspectRatio: string;
    maxDurationSeconds: number;
    resolution: string;
  };
  rules: PlatformLimitRule[];
}

// ─── Validation & Quality Scoring Types ─────────────────────────────────────

export type ValidationStatus = 'ready' | 'needs_attention' | 'exceeds_limit';

export interface ValidationCheckResult {
  id: string;
  name: string;
  status: 'pass' | 'warning' | 'error';
  severity: RuleSeverity;
  message: string;
  currentValue?: number | string;
  limitValue?: number | string;
}

export interface PostValidationReport {
  status: ValidationStatus;
  qualityScore: number; // 0 - 100 explainable score
  scoreBreakdown: {
    lengthScore: number; // 0 - 40
    hookScore: number; // 0 - 20
    ctaScore: number; // 0 - 20
    hashtagScore: number; // 0 - 20
  };
  characterCount: number;
  characterLimit: number;
  hashtagCount: number;
  hashtagLimit: number;
  checks: ValidationCheckResult[];
  includedLinks: {
    platform: SocialPlatformKey;
    url: string;
    displayName?: string;
    isTargetPlatform: boolean;
  }[];
}
