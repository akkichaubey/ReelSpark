/**
 * ReelSpark Platform Video Specification Validator
 *
 * Checks video duration, dimensions, aspect ratio, and file size against
 * YouTube Shorts, Instagram Reels, Facebook Reels, and Threads requirements.
 */

import { PublishingPlatformKey, VideoPlatformValidationResult } from './publishing-types';

export interface VideoMetadataInput {
  durationSeconds: number;
  width: number;
  height: number;
  fileSizeBytes: number;
}

export const PLATFORM_VIDEO_SPECS = {
  youtube: {
    maxDurationSeconds: 180, // Shorts support up to 3 minutes
    minDurationSeconds: 3,
    maxFileSizeBytes: 256 * 1024 * 1024 * 1024, // 256GB
    allowedAspectRatios: ['9:16', '1:1'],
    idealAspectRatio: '9:16',
    notes: 'Square or vertical videos up to 3 minutes are automatically indexed as YouTube Shorts.',
  },
  instagram: {
    maxDurationSeconds: 90, // Reels limit
    minDurationSeconds: 3,
    maxFileSizeBytes: 1024 * 1024 * 1024, // 1GB
    allowedAspectRatios: ['9:16'],
    idealAspectRatio: '9:16',
    notes: 'Instagram Reels strictly require 9:16 vertical aspect ratio and maximum 90s duration.',
  },
  facebook: {
    maxDurationSeconds: 90,
    minDurationSeconds: 3,
    maxFileSizeBytes: 1024 * 1024 * 1024, // 1GB
    allowedAspectRatios: ['9:16'],
    idealAspectRatio: '9:16',
    notes: 'Facebook Reels require 9:16 aspect ratio and up to 90 seconds.',
  },
  threads: {
    maxDurationSeconds: 300, // 5 minutes max
    minDurationSeconds: 1,
    maxFileSizeBytes: 1024 * 1024 * 1024, // 1GB
    allowedAspectRatios: ['9:16', '1:1', '16:9'],
    idealAspectRatio: '9:16',
    notes: 'Threads supports vertical, square, and landscape videos up to 5 minutes.',
  },
};

export function validateVideoForPlatform(
  platform: PublishingPlatformKey,
  metadata: VideoMetadataInput
): VideoPlatformValidationResult {
  const spec = PLATFORM_VIDEO_SPECS[platform];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Duration Checks
  if (metadata.durationSeconds > spec.maxDurationSeconds) {
    errors.push(
      `Duration (${Math.round(metadata.durationSeconds)}s) exceeds ${platform}'s limit of ${spec.maxDurationSeconds}s.`
    );
  } else if (metadata.durationSeconds < spec.minDurationSeconds) {
    errors.push(
      `Duration (${metadata.durationSeconds}s) is too short. Minimum allowed is ${spec.minDurationSeconds}s.`
    );
  }

  // 2. Aspect Ratio Check
  const ratio = metadata.width / (metadata.height || 1);
  const isVertical916 = Math.abs(ratio - 9 / 16) < 0.08;
  const isSquare = Math.abs(ratio - 1) < 0.08;

  if (platform === 'instagram' || platform === 'facebook') {
    if (!isVertical916) {
      warnings.push(
        `Video aspect ratio (${metadata.width}x${metadata.height}) is not 9:16 vertical. Platform may crop or pad borders.`
      );
    }
  } else if (platform === 'youtube') {
    if (!isVertical916 && !isSquare) {
      warnings.push(
        `YouTube Shorts best performance requires 9:16 vertical video (currently ${metadata.width}x${metadata.height}).`
      );
    }
  }

  // 3. File Size Check
  if (metadata.fileSizeBytes > spec.maxFileSizeBytes) {
    errors.push(
      `File size (${(metadata.fileSizeBytes / (1024 * 1024)).toFixed(1)}MB) exceeds platform limit of ${
        spec.maxFileSizeBytes / (1024 * 1024)
      }MB.`
    );
  }

  return {
    platform,
    isCompatible: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateVideoForAllPlatforms(
  platforms: PublishingPlatformKey[],
  metadata: VideoMetadataInput
): Record<PublishingPlatformKey, VideoPlatformValidationResult> {
  const results: any = {};
  for (const p of platforms) {
    results[p] = validateVideoForPlatform(p, metadata);
  }
  return results;
}
