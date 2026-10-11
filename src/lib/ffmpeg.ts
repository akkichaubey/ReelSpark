import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from './config';
import { VideoMetadata } from './types';

const execFileAsync = promisify(execFile);

/**
 * Inspect video using FFprobe.
 */
export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const ffprobePath = getFfprobePath();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration,size,format_name:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
    '-of', 'json',
    filePath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobePath, args);
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');

    const duration = parseFloat(data.format?.duration || videoStream?.duration || audioStream?.duration || '0');
    const isAudioOnly = !videoStream && Boolean(audioStream);
    const width = videoStream?.width || (isAudioOnly ? 1080 : 0);
    const height = videoStream?.height || (isAudioOnly ? 1920 : 0);
    const sizeBytes = parseInt(data.format?.size || '0', 10);
    const format = data.format?.format_name || (isAudioOnly ? 'audio' : 'unknown');

    // Parse FPS from r_frame_rate e.g. "30/1" or "30000/1001"
    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den && num) {
        fps = Math.round((num / den) * 100) / 100;
      }
    }

    let aspectRatio = '16:9';
    if (videoStream && width && height) {
      const ratio = width / height;
      if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
      else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
      else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
      else if (Math.abs(ratio - 1) < 0.1) aspectRatio = '1:1';
      else aspectRatio = `${width}:${height}`;
    } else if (isAudioOnly) {
      aspectRatio = 'Audio';
    }

    return {
      duration,
      width,
      height,
      aspectRatio,
      fps,
      format,
      sizeBytes,
      hasAudio: Boolean(audioStream),
      audioCodec: audioStream?.codec_name,
      videoCodec: videoStream?.codec_name,
    };
  } catch (err: any) {
    throw new Error(`FFprobe inspection failed: ${err.message}`);
  }
}

export interface RenderClipOptions {
  sourceVideoPath: string;
  outputPath: string;
  start: number;
  end: number;
  aspectRatio: 'original' | 'vertical_crop' | 'vertical_blur';
  normalizeAudio?: boolean;
  subtitlesAssPath?: string;
  onProgress?: (percent: number) => void;
}

/**
 * Format Windows filepath for FFmpeg filter arguments (escapes colons and backslashes).
 */
export function escapeFilterPath(filePath: string): string {
  // Convert backslashes to forward slashes, then escape colon after drive letter: C:/ -> C\\:/
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.replace(/^([a-zA-Z]):/, '$1\\:');
}

/**
 * Render a cut clip using FFmpeg with high precision, aspect ratio handling, audio normalization, and optional burned-in subtitles.
 */
export async function renderClip(options: RenderClipOptions): Promise<{ outputPath: string; duration: number }> {
  const {
    sourceVideoPath,
    outputPath,
    start,
    end,
    aspectRatio,
    normalizeAudio = true,
    subtitlesAssPath,
    onProgress,
  } = options;

  const ffmpegPath = getFfmpegPath();
  const duration = Math.max(0.5, end - start);

  if (duration > 60.5) {
    throw new Error(`Clip duration (${duration.toFixed(1)}s) exceeds 60 seconds limit.`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build filter graph
  const filterParts: string[] = [];

  if (aspectRatio === 'vertical_crop') {
    // 9:16 Center crop to 1080x1920
    filterParts.push('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  } else if (aspectRatio === 'vertical_blur') {
    // Vertical 9:16 with blurred backdrop to preserve full framing and speaker visibility
    const blurGraph =
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg];' +
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2';
    filterParts.push(blurGraph);
  }

  // Burn in subtitles if provided
  if (subtitlesAssPath && fs.existsSync(subtitlesAssPath)) {
    const escapedAss = escapeFilterPath(subtitlesAssPath);
    if (filterParts.length > 0) {
      // Append ass filter to the last video stream
      const lastIndex = filterParts.length - 1;
      filterParts[lastIndex] = `${filterParts[lastIndex]},ass='${escapedAss}'`;
    } else {
      filterParts.push(`ass='${escapedAss}'`);
    }
  }

  const audioFilters: string[] = [];
  if (normalizeAudio) {
    audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }

  const meta = await probeVideo(sourceVideoPath);
  const isAudioOnly = !meta.videoCodec && meta.hasAudio;

  const args: string[] = ['-y'];

  if (isAudioOnly) {
    args.push(
      '-f', 'lavfi',
      '-i', 'color=c=black:s=1080x1920:r=30',
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-i', sourceVideoPath,
      '-t', duration.toFixed(3)
    );
  } else {
    args.push(
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-i', sourceVideoPath
    );
  }

  if (isAudioOnly) {
    if (subtitlesAssPath && fs.existsSync(subtitlesAssPath)) {
      const escapedAss = escapeFilterPath(subtitlesAssPath);
      args.push('-vf', `ass='${escapedAss}'`);
    }
    args.push('-map', '0:v', '-map', '1:a');
  } else if (filterParts.length > 0) {
    const combinedFilter = filterParts.join(';');
    // If complex graph with labels was used:
    if (combinedFilter.includes(';')) {
      args.push('-filter_complex', combinedFilter);
    } else {
      args.push('-vf', combinedFilter);
    }
  }

  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','));
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString();
      stderr += msg;

      // Parse time progress: time=00:00:05.20
      const match = msg.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match && onProgress && duration > 0) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = parseFloat(match[3]);
        const currentTime = h * 3600 + m * 60 + s;
        const pct = Math.min(100, Math.round((currentTime / duration) * 100));
        onProgress(pct);
      }
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          const validated = await validateRenderedClip(outputPath);
          if (!validated.valid) {
            reject(new Error(validated.error || 'Validation failed for rendered clip'));
            return;
          }
          resolve({ outputPath, duration: validated.duration });
        } catch (e: any) {
          reject(e);
        }
      } else {
        reject(new Error(`FFmpeg rendering exited with code ${code}. Stderr: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Validate rendered clip using FFprobe.
 * Verifies file exists, readable, non-empty, duration <= 60s, audio present if expected.
 */
export async function validateRenderedClip(filePath: string): Promise<{
  valid: boolean;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  error?: string;
}> {
  if (!fs.existsSync(filePath)) {
    return { valid: false, duration: 0, error: 'Output file was not created' };
  }

  const stat = fs.statSync(filePath);
  if (stat.size < 1000) {
    return { valid: false, duration: 0, error: 'Rendered file is suspiciously small or empty' };
  }

  try {
    const meta = await probeVideo(filePath);

    if (meta.duration > 60.5) {
      return {
        valid: false,
        duration: meta.duration,
        error: `Rendered clip duration (${meta.duration.toFixed(1)}s) exceeds 60s limit`,
      };
    }

    if (meta.width <= 0 || meta.height <= 0) {
      return { valid: false, duration: meta.duration, error: 'Invalid video dimensions' };
    }

    return {
      valid: true,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      hasAudio: meta.hasAudio,
    };
  } catch (err: any) {
    return { valid: false, duration: 0, error: `FFprobe validation failed: ${err.message}` };
  }
}

/**
 * Extract audio from video into lightweight 16kHz mono WAV or MP3 for speech-to-text transcription.
 */
export async function extractAudioForTranscription(videoPath: string, outputAudioPath: string): Promise<string> {
  const ffmpegPath = getFfmpegPath();
  const dir = path.dirname(outputAudioPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = [
    '-y',
    '-i', videoPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libmp3lame',
    '-b:a', '64k',
    outputAudioPath,
  ];

  await execFileAsync(ffmpegPath, args);
  return outputAudioPath;
}

export interface ExtractClipAudioOptions {
  sourceVideoPath: string;
  outputPath: string;
  start: number;
  end: number;
  normalizeAudio?: boolean;
}

/**
 * Extract an isolated audio segment from a video or audio file for a specific clip timeframe.
 * Produces a high-quality 192k MP3 ready for playback, scrub timeline, and video render compositing.
 */
export async function extractClipAudio(options: ExtractClipAudioOptions): Promise<{
  outputPath: string;
  duration: number;
}> {
  const {
    sourceVideoPath,
    outputPath,
    start,
    end,
    normalizeAudio = false,
  } = options;

  const ffmpegPath = getFfmpegPath();
  const duration = Math.max(0.5, end - start);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const args: string[] = [
    '-y',
    '-ss', start.toFixed(3),
    '-to', end.toFixed(3),
    '-i', sourceVideoPath,
    '-vn',
  ];

  if (normalizeAudio) {
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
  }

  args.push(
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    outputPath
  );

  await execFileAsync(ffmpegPath, args);

  return {
    outputPath,
    duration,
  };
}

