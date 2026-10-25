/**
 * ReelSpark Multi-Platform Social Media Publishing — Core Types
 *
 * Supports YouTube Shorts, Instagram Reels, Facebook Reels, and Threads.
 */

import { SocialPlatformKey } from './types';

export type PublishingPlatformKey = 'youtube' | 'instagram' | 'facebook' | 'threads';

export type OAuthConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface SocialOAuthConnection {
  id: string;
  userId: string;
  platform: PublishingPlatformKey;
  platformUserId: string;
  accountName: string;
  accountHandle?: string;
  avatarUrl?: string;
  accessToken: string; // Stored encrypted at rest
  refreshToken?: string; // Stored encrypted at rest
  tokenExpiresAt?: string; // ISO string
  scope: string;
  metadata: {
    selectedPageId?: string; // Facebook Page ID for Reels
    selectedPageName?: string;
    selectedPageAccessToken?: string; // Encrypted Page token
    channelId?: string; // YouTube Channel ID
    channelTitle?: string;
    customData?: Record<string, any>;
  };
  status: OAuthConnectionStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type SafeOAuthConnection = Omit<SocialOAuthConnection, 'accessToken' | 'refreshToken' | 'metadata'> & {
  metadata: {
    selectedPageId?: string;
    selectedPageName?: string;
    channelId?: string;
    channelTitle?: string;
  };
  hasRefreshToken: boolean;
  isExpired: boolean;
};

// ─── Video Specifications & Validation ──────────────────────────────────────

export interface VideoAssetForPublishing {
  id: string;
  title: string;
  storagePath: string; // Relative or absolute file path
  webUrl: string; // Servable URL e.g. /api/files/...
  r2Key?: string;
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string; // e.g. "9:16"
  fileSizeBytes: number;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface VideoPlatformValidationResult {
  platform: PublishingPlatformKey;
  isCompatible: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Post Content & Overrides ───────────────────────────────────────────────

export interface YouTubePostOptions {
  title: string; // 1-100 characters
  description: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  tags?: string[];
  madeForKids: boolean;
}

export interface InstagramPostOptions {
  caption: string;
  coverImageUrl?: string;
  locationId?: string;
  shareToFeed?: boolean;
}

export interface FacebookPostOptions {
  description: string;
  pageId?: string;
}

export interface ThreadsPostOptions {
  text: string;
  topicTag?: string;
}

export interface PlatformPublishContentPayload {
  youtube?: YouTubePostOptions;
  instagram?: InstagramPostOptions;
  facebook?: FacebookPostOptions;
  threads?: ThreadsPostOptions;
}

// ─── Publishing Jobs & Execution ───────────────────────────────────────────

export type PublishingJobOverallStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed';

export type SinglePlatformPublishStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'publishing'
  | 'published'
  | 'failed';

export interface PublishedPlatformRecord {
  id: string;
  jobId: string;
  userId: string;
  platform: PublishingPlatformKey;
  connectionId?: string;
  postTitle?: string;
  postCaption: string;
  status: SinglePlatformPublishStatus;
  progressPercent: number; // 0 - 100
  platformPostId?: string;
  platformPostUrl?: string;
  errorMessage?: string;
  retryCount: number;
  idempotencyKey: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPublishingJob {
  id: string;
  userId: string;
  videoPath: string;
  thumbnailPath?: string;
  publishOptions?: PlatformPublishContentPayload;
  publishOrigin?: string;
  videoMetadata: {
    durationSeconds: number;
    width: number;
    height: number;
    fileSizeBytes: number;
    title?: string;
  };
  showOtherSocialProfiles: boolean; // Smart profile link insertion flag
  status: PublishingJobOverallStatus;
  platforms: PublishedPlatformRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PublishRequestPayload {
  videoId?: string;
  videoPath: string;
  thumbnailPath?: string;
  videoMetadata?: {
    durationSeconds: number;
    width: number;
    height: number;
    fileSizeBytes: number;
    title?: string;
  };
  selectedPlatforms: PublishingPlatformKey[];
  defaultCaption: string;
  defaultTitle?: string;
  showOtherSocialProfiles?: boolean; // Default true
  platformOverrides?: PlatformPublishContentPayload;
}
