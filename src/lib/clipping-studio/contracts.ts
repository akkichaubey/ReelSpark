import { z } from 'zod';

/**
 * -----------------------------------------------------------------------------
 * Timestamp Parsing & Formatting Utilities (Integer Milliseconds)
 * -----------------------------------------------------------------------------
 */

/**
 * Parses timestamp strings like:
 * - "01:02:03.500" or "01:02:03,500"
 * - "00:02:15"
 * - "02:15"
 * - "02:15.500"
 * Returns integer milliseconds, or throws an Error if invalid.
 */
export function parseTimestampToMs(timestampStr: string): number {
  if (typeof timestampStr !== 'string') {
    throw new Error('Timestamp must be a string');
  }

  const trimmed = timestampStr.trim().replace(',', '.');
  if (!trimmed) {
    throw new Error('Timestamp cannot be empty');
  }

  // Regex for HH:MM:SS.mmm or MM:SS.mmm or SS.mmm
  const parts = trimmed.split(':');
  if (parts.length > 3 || parts.length < 2) {
    throw new Error(`Invalid timestamp format: "${timestampStr}". Expected MM:SS or HH:MM:SS[.mmm]`);
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2]);
  } else {
    minutes = Number(parts[0]);
    seconds = Number(parts[1]);
  }

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    throw new Error(`Non-numeric values in timestamp: "${timestampStr}"`);
  }

  if (hours < 0 || minutes < 0 || seconds < 0) {
    throw new Error(`Negative values are not allowed in timestamp: "${timestampStr}"`);
  }

  if (minutes >= 60 && parts.length === 3) {
    throw new Error(`Minutes must be between 0 and 59 in HH:MM:SS format: "${timestampStr}"`);
  }

  if (seconds >= 60) {
    throw new Error(`Seconds must be between 0 and 59.999: "${timestampStr}"`);
  }

  const totalMs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  return totalMs;
}

/**
 * Formats integer milliseconds to "HH:MM:SS.mmm" or "MM:SS.mmm"
 */
export function formatMsToTimestamp(totalMs: number, includeHours = true): string {
  if (totalMs < 0 || isNaN(totalMs)) totalMs = 0;
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');

  if (includeHours || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

/**
 * Parses a single bulk line: e.g. "00:00:10.000 to 00:00:20.000" or "01:15 - 01:35"
 */
export function parseTimestampRangeLine(
  line: string,
  lineNumber: number,
  maxDurationMs?: number
): {
  valid: boolean;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  error?: string;
  originalText: string;
} {
  const trimmed = line.trim();
  if (!trimmed) {
    return { valid: false, error: 'Empty line', originalText: line };
  }

  // Support "to", "-", "->", "=>" separators
  const separatorRegex = /\s+(?:to|->|=>|-)\s+/i;
  const parts = trimmed.split(separatorRegex);

  if (parts.length !== 2) {
    return {
      valid: false,
      error: `Line ${lineNumber}: Invalid delimiter. Use "START to END" or "START - END" (e.g. 00:01:15 to 00:01:35)`,
      originalText: line,
    };
  }

  try {
    const startMs = parseTimestampToMs(parts[0]);
    const endMs = parseTimestampToMs(parts[1]);

    if (startMs >= endMs) {
      return {
        valid: false,
        error: `Line ${lineNumber}: Start time (${formatMsToTimestamp(startMs)}) must be less than end time (${formatMsToTimestamp(endMs)})`,
        originalText: line,
      };
    }

    if (maxDurationMs && endMs > maxDurationMs) {
      return {
        valid: false,
        error: `Line ${lineNumber}: End time (${formatMsToTimestamp(endMs)}) exceeds media duration (${formatMsToTimestamp(maxDurationMs)})`,
        originalText: line,
      };
    }

    return {
      valid: true,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      originalText: line,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Line ${lineNumber}: ${err.message}`,
      originalText: line,
    };
  }
}

export interface ParsedBulkClip {
  lineNumber: number;
  valid: boolean;
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  error?: string;
  rawText: string;
}

/**
 * Parses multi-line bulk timestamp text, supporting optional titles via pipe "|" or comma.
 * E.g.:
 * 00:00:10.000 to 00:00:20.000 | Intro Hook
 * 00:01:15 to 00:01:35
 */
export function parseBulkTimestamps(text: string, maxDurationMs?: number): {
  items: ParsedBulkClip[];
  validCount: number;
  invalidCount: number;
} {
  const lines = text.split('\n');
  const items: ParsedBulkClip[] = [];
  let validCount = 0;
  let invalidCount = 0;

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return; // Skip empty lines

    const lineNum = idx + 1;
    let rangePart = trimmed;
    let customName = `Clip ${items.length + 1}`;

    // Check for optional title separated by "|"
    if (trimmed.includes('|')) {
      const [r, n] = trimmed.split('|');
      rangePart = r.trim();
      if (n && n.trim()) {
        customName = n.trim();
      }
    }

    const res = parseTimestampRangeLine(rangePart, lineNum, maxDurationMs);

    if (res.valid && res.startMs !== undefined && res.endMs !== undefined && res.durationMs !== undefined) {
      validCount++;
      items.push({
        lineNumber: lineNum,
        valid: true,
        name: customName,
        startMs: res.startMs,
        endMs: res.endMs,
        durationMs: res.durationMs,
        rawText: trimmed,
      });
    } else {
      invalidCount++;
      items.push({
        lineNumber: lineNum,
        valid: false,
        name: customName,
        startMs: 0,
        endMs: 0,
        durationMs: 0,
        error: res.error || `Line ${lineNum}: Invalid format`,
        rawText: trimmed,
      });
    }
  });

  return { items, validCount, invalidCount };
}

/**
 * Frame conversion helpers for frame-accurate video clipping
 */
export function msToFrame(ms: number, fps = 30): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

export function frameToMs(frame: number, fps = 30): number {
  return Math.max(0, Math.round((frame / fps) * 1000));
}

/**
 * Convert local file path to browser-accessible /api/files/ URL
 */
export function getMediaAssetWebUrl(asset: { localPath: string; projectId: string; filename: string }): string {
  if (asset.localPath) {
    const normalized = asset.localPath.replace(/\\/g, '/');
    const storageRoot = 'storage';
    const idx = normalized.indexOf(storageRoot);
    if (idx !== -1) {
      const rel = normalized.slice(idx + storageRoot.length).replace(/^\/+/, '');
      return `/api/files/${rel}`;
    }
  }
  return `/api/files/clipping-studio/projects/${asset.projectId}/media/${asset.filename}`;
}

/**
 * -----------------------------------------------------------------------------
 * Zod Schemas for Clipping Studio Domain Models
 * -----------------------------------------------------------------------------
 */

export const MediaStreamSchema = z.object({
  index: z.number(),
  codec_type: z.enum(['video', 'audio', 'subtitle', 'data']),
  codec_name: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  r_frame_rate: z.string().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().optional(),
  bit_rate: z.string().optional(),
});

export const MediaMetadataSchema = z.object({
  durationSeconds: z.number().min(0),
  durationMs: z.number().min(0),
  sizeBytes: z.number().min(0),
  formatName: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  aspectRatio: z.string(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  audioChannels: z.number().optional(),
  sampleRate: z.number().optional(),
  streams: z.array(MediaStreamSchema).optional(),
});
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;

export const MediaAssetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  filename: z.string(),
  localPath: z.string(),
  fileSizeBytes: z.number(),
  metadata: MediaMetadataSchema,
  createdAt: z.string(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const ClipSchema = z.object({
  id: z.string(),
  sourceCandidateKey: z.string().optional(),
  projectId: z.string(),
  mediaAssetId: z.string(),
  name: z.string().min(1, 'Clip name is required'),
  startMs: z.number().min(0),
  endMs: z.number().min(1),
  durationMs: z.number().min(1),
  orderIndex: z.number().default(0),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Clip = z.infer<typeof ClipSchema>;

export const MergeRecipeItemSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  clipId: z.string(),
  orderIndex: z.number(),
  transition: z.enum(['none', 'crossfade', 'cut']).default('none'),
});
export type MergeRecipeItem = z.infer<typeof MergeRecipeItemSchema>;

export const MergeRecipeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1, 'Recipe name is required'),
  description: z.string().optional(),
  items: z.array(MergeRecipeItemSchema).default([]),
  outputFormat: z.enum(['mp4', 'mov', 'webm', 'mp3', 'wav']).default('mp4'),
  targetResolution: z.enum(['source', '1080p', '720p', '4k']).default('source'),
  normalizeAudio: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MergeRecipe = z.infer<typeof MergeRecipeSchema>;

export const ExportSourceMappingSchema = z.object({
  id: z.string(),
  exportJobId: z.string(),
  clipId: z.string().optional(),
  sourceAssetId: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  sequenceIndex: z.number(),
});
export type ExportSourceMapping = z.infer<typeof ExportSourceMappingSchema>;

export const ExportJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  jobType: z.enum(['single_clip', 'selected_clips', 'all_clips', 'merge_recipe']),
  targetId: z.string(), // clipId or recipeId
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  progressPercent: z.number().min(0).max(100).default(0),
  outputPath: z.string().optional(),
  errorMessage: z.string().optional(),
  outputSettings: z.record(z.string(), z.any()).optional(),
  sourceMappings: z.array(ExportSourceMappingSchema).default([]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
});
export type ExportJob = z.infer<typeof ExportJobSchema>;

export const ClippingProjectSchema = z.object({
  id: z.string(),
  sourceProjectId: z.string().optional(),
  sourceMediaAssetId: z.string().optional(),
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  mediaAssets: z.array(MediaAssetSchema).default([]),
  clips: z.array(ClipSchema).default([]),
  mergeRecipes: z.array(MergeRecipeSchema).default([]),
  exportJobs: z.array(ExportJobSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClippingProject = z.infer<typeof ClippingProjectSchema>;

/**
 * -----------------------------------------------------------------------------
 * Local Media Service API Contracts
 * -----------------------------------------------------------------------------
 */

export const MediaServiceHealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('reelspark-media-service'),
  version: z.string(),
  host: z.string(),
  port: z.number(),
  uptimeSeconds: z.number(),
  ffmpeg: z.object({
    available: z.boolean(),
    path: z.string(),
    version: z.string().optional(),
    error: z.string().optional(),
  }),
  ffprobe: z.object({
    available: z.boolean(),
    path: z.string(),
    version: z.string().optional(),
    error: z.string().optional(),
  }),
});
export type MediaServiceHealthResponse = z.infer<typeof MediaServiceHealthResponseSchema>;

export const ProbeRequestSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

export const ValidatePathRequestSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

export const ValidatePathResponseSchema = z.object({
  exists: z.boolean(),
  readable: z.boolean(),
  fileSizeBytes: z.number().optional(),
  filename: z.string().optional(),
  extension: z.string().optional(),
  isMedia: z.boolean(),
  error: z.string().optional(),
});

export const CreateExportJobRequestSchema = z.object({
  projectId: z.string(),
  jobType: z.enum(['single_clip', 'selected_clips', 'all_clips', 'merge_recipe']),
  targetId: z.string(), // clipId or recipeId
  selectedClipIds: z.array(z.string()).optional(),
  outputFormat: z.enum(['mp4', 'mov', 'webm', 'mp3', 'wav']).default('mp4'),
  outputType: z.enum(['video_and_audio', 'video_only', 'audio_only', 'separate_video_and_audio']).default('video_and_audio'),
  qualityProfile: z.enum(['source', 'high', 'medium', 'fast']).default('high'),
  targetResolution: z.enum(['source', '1080p', '720p', '4k']).default('source'),
  outputDir: z.string().optional(),
  filenameTemplate: z.string().default('{project}_{name}_{index}_{time}'),
  normalizeAudio: z.boolean().default(false),
});
export type CreateExportJobRequest = z.infer<typeof CreateExportJobRequestSchema>;

/**
 * Format custom filename template using tokens
 */
export function formatFilenameTemplate(
  template: string,
  tokens: {
    project: string;
    name: string;
    index: number | string;
    time: string;
    res?: string;
  }
): string {
  let result = template || '{project}_{name}_{index}';
  result = result.replace(/\{project\}/gi, tokens.project.replace(/[^a-zA-Z0-9_-]/g, '_'));
  result = result.replace(/\{name\}/gi, tokens.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
  result = result.replace(/\{index\}/gi, String(tokens.index));
  result = result.replace(/\{time\}/gi, tokens.time.replace(/[^a-zA-Z0-9_-]/g, '_'));
  if (tokens.res) {
    result = result.replace(/\{res\}/gi, tokens.res);
  } else {
    result = result.replace(/_?\{res\}/gi, '');
  }
  return result.replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
}
