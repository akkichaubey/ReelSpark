import { OutputSettings, ResolutionTier, VideoCodec, VideoFps, VideoQuality } from './types';

export interface ResolutionDimension {
  width: number;
  height: number;
  label: string;
}

/**
 * Standard dimension matrix for all standard aspect ratios across 4 resolution tiers:
 * 720p (HD), 1080p (Full HD), 1440p (2K), 4k (Ultra HD).
 */
export const RESOLUTION_DIMENSIONS: Record<
  string,
  Record<ResolutionTier, { width: number; height: number; label: string }>
> = {
  '9:16': {
    '720p': { width: 720, height: 1280, label: '720 × 1280 (HD)' },
    '1080p': { width: 1080, height: 1920, label: '1080 × 1920 (Full HD)' },
    '1440p': { width: 1440, height: 2560, label: '1440 × 2560 (2K QHD)' },
    '4k': { width: 2160, height: 3840, label: '2160 × 3840 (4K UHD)' },
  },
  '16:9': {
    '720p': { width: 1280, height: 720, label: '1280 × 720 (HD)' },
    '1080p': { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' },
    '1440p': { width: 2560, height: 1440, label: '2560 × 1440 (2K QHD)' },
    '4k': { width: 3840, height: 2160, label: '3840 × 2160 (4K UHD)' },
  },
  '1:1': {
    '720p': { width: 720, height: 720, label: '720 × 720 (HD)' },
    '1080p': { width: 1080, height: 1080, label: '1080 × 1080 (Full HD)' },
    '1440p': { width: 1440, height: 1440, label: '1440 × 1440 (2K)' },
    '4k': { width: 2160, height: 2160, label: '2160 × 2160 (4K)' },
  },
  '4:5': {
    '720p': { width: 720, height: 900, label: '720 × 900 (HD)' },
    '1080p': { width: 1080, height: 1350, label: '1080 × 1350 (Full HD)' },
    '1440p': { width: 1440, height: 1800, label: '1440 × 1800 (2K)' },
    '4k': { width: 2160, height: 2700, label: '2160 × 2700 (4K)' },
  },
};

/**
 * Supported Frame Rates with user-facing metadata
 */
export const SUPPORTED_FRAME_RATES: {
  fps: VideoFps;
  label: string;
  description: string;
}[] = [
  { fps: 24, label: '24 FPS', description: 'Cinematic / Film look' },
  { fps: 25, label: '25 FPS', description: 'PAL / European broadcast' },
  { fps: 30, label: '30 FPS', description: 'Social Default (Instagram / Shorts)' },
  { fps: 60, label: '60 FPS', description: 'Ultra Smooth / High Motion' },
];

/**
 * Quality Profiles with CRF, presets, and bitrates
 */
export interface QualityProfile {
  id: VideoQuality;
  label: string;
  badge: string;
  desc: string;
  crf: number;
  x264Preset: string;
  targetBitrate: string;
  audioBitrate: string;
  bitrateMbps: number;
}

export const QUALITY_PROFILES: Record<VideoQuality, QualityProfile> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    badge: 'FAST',
    desc: 'Rapid test render for quick review',
    crf: 28,
    x264Preset: 'veryfast',
    targetBitrate: '3M',
    audioBitrate: '128k',
    bitrateMbps: 3.5,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    badge: 'OPTIMAL',
    desc: 'Recommended for Instagram Reels & YouTube Shorts',
    crf: 22,
    x264Preset: 'fast',
    targetBitrate: '8M',
    audioBitrate: '192k',
    bitrateMbps: 8.5,
  },
  high: {
    id: 'high',
    label: 'High Quality',
    badge: 'CRISP',
    desc: 'High-fidelity export with crisp typography and edges',
    crf: 18,
    x264Preset: 'medium',
    targetBitrate: '16M',
    audioBitrate: '256k',
    bitrateMbps: 16.5,
  },
  pro: {
    id: 'pro',
    label: 'Pro Studio',
    badge: 'MASTER',
    desc: 'Master archival grade for 2K/4K and professional screens',
    crf: 14,
    x264Preset: 'slow',
    targetBitrate: '28M',
    audioBitrate: '320k',
    bitrateMbps: 28.5,
  },
};

/**
 * Get dimensions for a target aspect ratio and resolution tier.
 */
export function getDimensionsForAspectAndTier(
  aspectRatio: string,
  tier: ResolutionTier = '1080p'
): { width: number; height: number; label: string } {
  const table = RESOLUTION_DIMENSIONS[aspectRatio];
  if (table && table[tier]) {
    return table[tier];
  }

  // Fallback for custom or unmapped aspect ratios based on tier height multiplier
  const multiplier = tier === '720p' ? 0.6667 : tier === '1440p' ? 1.3333 : tier === '4k' ? 2.0 : 1.0;
  const baseW = 1080;
  const baseH = 1920;
  const width = Math.round((baseW * multiplier) / 2) * 2;
  const height = Math.round((baseH * multiplier) / 2) * 2;
  return {
    width,
    height,
    label: `${width} × ${height} (${tier.toUpperCase()})`,
  };
}

/**
 * Detect ResolutionTier from width and height dimensions.
 */
export function detectResolutionTier(width: number, height: number): ResolutionTier {
  const maxDim = Math.max(width, height);
  if (maxDim <= 1300) return '720p';
  if (maxDim <= 1950) return '1080p';
  if (maxDim <= 2600) return '1440p';
  return '4k';
}

/**
 * Estimate final export file size in MB or GB based on video duration, quality tier, and resolution.
 */
export function estimateExportFileSize(
  durationSec: number,
  quality: VideoQuality = 'standard',
  resolution: ResolutionTier = '1080p',
  fps: number = 30
): string {
  if (!durationSec || durationSec <= 0) return '0.0 MB';

  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.standard;

  // Scale bitrate by resolution tier
  const resMultiplier =
    resolution === '720p' ? 0.6 : resolution === '1440p' ? 1.5 : resolution === '4k' ? 2.6 : 1.0;

  // High FPS (60fps) adds approx 25% data overhead
  const fpsMultiplier = fps > 45 ? 1.25 : 1.0;

  const effectiveMbps = profile.bitrateMbps * resMultiplier * fpsMultiplier;
  const totalMbits = effectiveMbps * durationSec;
  const totalMB = totalMbits / 8;

  if (totalMB >= 1000) {
    return `~${(totalMB / 1024).toFixed(2)} GB`;
  }
  return `~${totalMB.toFixed(1)} MB`;
}

/**
 * Build precise FFmpeg encoding arguments according to output settings and hardware encoder.
 */
export function buildFfmpegEncodingArgs(
  outputSettings: OutputSettings,
  encoder: string
): { videoArgs: string[]; audioArgs: string[] } {
  const quality = outputSettings.quality || 'standard';
  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.standard;
  const fps = outputSettings.fps || 30;
  const audioBitrate = outputSettings.audioBitrate || profile.audioBitrate;

  const videoArgs: string[] = [
    '-r', String(fps),
    '-c:v', encoder,
  ];

  if (encoder === 'libx264') {
    videoArgs.push(
      '-preset', profile.x264Preset,
      '-crf', String(profile.crf),
      '-pix_fmt', 'yuv420p'
    );
    if (outputSettings.bitrate && outputSettings.bitrate !== 'auto') {
      videoArgs.push('-b:v', outputSettings.bitrate);
    }
  } else if (encoder === 'h264_nvenc') {
    const nvencPreset = quality === 'draft' ? 'p2' : quality === 'pro' ? 'p6' : 'p4';
    videoArgs.push(
      '-preset', nvencPreset,
      '-cq', String(profile.crf + 2),
      '-pix_fmt', 'yuv420p'
    );
    if (outputSettings.bitrate && outputSettings.bitrate !== 'auto') {
      videoArgs.push('-b:v', outputSettings.bitrate);
    }
  } else if (encoder === 'h264_qsv') {
    videoArgs.push(
      '-global_quality', String(profile.crf + 1),
      '-pix_fmt', 'nv12'
    );
    if (outputSettings.bitrate && outputSettings.bitrate !== 'auto') {
      videoArgs.push('-b:v', outputSettings.bitrate);
    }
  } else {
    videoArgs.push('-pix_fmt', 'yuv420p');
  }

  const audioArgs: string[] = [
    '-c:a', 'aac',
    '-b:a', audioBitrate,
  ];

  return { videoArgs, audioArgs };
}
