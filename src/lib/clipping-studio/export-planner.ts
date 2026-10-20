import path from 'path';
import {
  Clip,
  MediaAsset,
  formatMsToTimestamp,
} from './contracts';

/**
 * Format custom filename template using tokens (browser & server safe)
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

export interface ClipExportOptions {
  clip: Clip;
  mediaAsset: MediaAsset;
  outputFormat: 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav';
  outputType: 'video_and_audio' | 'video_only' | 'audio_only' | 'separate_video_and_audio';
  qualityProfile: 'source' | 'high' | 'medium' | 'fast';
  targetResolution?: 'source' | '1080p' | '720p' | '4k';
  normalizeAudio?: boolean;
  outputPath: string;
}

/**
 * Builds safe argument array for clipping an individual media clip
 */
export function buildSingleClipExportFfmpegArgs(options: ClipExportOptions): string[] {
  const {
    clip,
    mediaAsset,
    outputFormat,
    outputType,
    qualityProfile,
    targetResolution,
    normalizeAudio,
    outputPath,
  } = options;

  const startSec = (clip.startMs / 1000).toFixed(3);
  const endSec = (clip.endMs / 1000).toFixed(3);

  // Fast lossless stream copy condition
  const inputExt = (mediaAsset.localPath.split('.').pop() || '').toLowerCase();
  const canStreamCopy =
    qualityProfile === 'source' &&
    inputExt === outputFormat &&
    outputType === 'video_and_audio' &&
    (!targetResolution || targetResolution === 'source') &&
    !normalizeAudio;

  if (canStreamCopy) {
    return [
      '-y',
      '-ss', startSec,
      '-to', endSec,
      '-i', mediaAsset.localPath,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      outputPath,
    ];
  }

  const args: string[] = [
    '-y',
    '-ss', startSec,
    '-to', endSec,
    '-i', mediaAsset.localPath,
  ];

  // Video processing
  if (outputType === 'audio_only' || outputFormat === 'mp3' || outputFormat === 'wav') {
    args.push('-vn');
  } else {
    // Scaling filter if targetResolution is set
    const scaleFilters: string[] = [];
    if (targetResolution === '1080p') {
      scaleFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1');
    } else if (targetResolution === '720p') {
      scaleFilters.push('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1');
    } else if (targetResolution === '4k') {
      scaleFilters.push('scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2,setsar=1');
    }

    if (scaleFilters.length > 0) {
      args.push('-vf', scaleFilters.join(','));
    }

    const crf = qualityProfile === 'high' ? '18' : qualityProfile === 'medium' ? '23' : '28';
    const preset = qualityProfile === 'high' ? 'slow' : qualityProfile === 'medium' ? 'medium' : 'veryfast';

    if (outputFormat === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0');
    } else {
      args.push('-c:v', 'libx264', '-crf', crf, '-preset', preset);
    }
  }

  // Audio processing
  if (outputType === 'video_only') {
    args.push('-an');
  } else {
    if (normalizeAudio) {
      args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    if (outputFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', '320k');
    } else if (outputFormat === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else if (outputFormat === 'webm') {
      args.push('-c:a', 'libopus', '-b:a', '160k');
    } else {
      args.push('-c:a', 'aac', '-b:a', '192k');
    }
  }

  args.push(outputPath);
  return args;
}

/**
 * Parses timestamp from FFmpeg progress output to calculate completion percentage (0 - 100)
 */
export function parseFfmpegProgress(stderrChunk: string, totalDurationMs: number): number | null {
  if (totalDurationMs <= 0) return null;

  const timeMatch = stderrChunk.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (timeMatch) {
    const hours = parseFloat(timeMatch[1]);
    const minutes = parseFloat(timeMatch[2]);
    const seconds = parseFloat(timeMatch[3]);
    const currentMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    const percent = Math.min(100, Math.max(0, Math.round((currentMs / totalDurationMs) * 100)));
    return percent;
  }

  const outTimeMsMatch = stderrChunk.match(/out_time_ms=(\d+)/);
  if (outTimeMsMatch) {
    const currentMs = parseInt(outTimeMsMatch[1], 10) / 1000;
    const percent = Math.min(100, Math.max(0, Math.round((currentMs / totalDurationMs) * 100)));
    return percent;
  }

  return null;
}
