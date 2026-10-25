import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from './config';
import { VideoMetadata } from './types';
import { commitStorageFile, createStorageStagingPath, removeStorageFile } from './storage-files';
import { APP_CONFIG } from './config';
import { isStoragePathActive } from './storage-runtime';

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
  signal?: AbortSignal;
}

/**
 * Format Windows filepath for FFmpeg filter arguments (escapes colons and backslashes).
 */
export function escapeFilterPath(filePath: string): string {
  // Convert backslashes to forward slashes, then escape colon after drive letter: C:/ -> C\\:/
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.replace(/^([a-zA-Z]):/, '$1\\:');
}

let cachedVideoEncoder: string | null = null;

/**
 * Auto-detect the fastest available hardware video encoder with safe CPU fallback.
 * Probes NVENC (NVIDIA), QSV (Intel), AMF (AMD), MF (Windows Media Foundation), then libx264.
 */
export async function detectBestVideoEncoder(): Promise<string> {
  if (cachedVideoEncoder) return cachedVideoEncoder;
  const ffmpeg = getFfmpegPath();

  const candidateEncoders = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_mf'];
  for (const enc of candidateEncoders) {
    try {
      await execFileAsync(ffmpeg, [
        '-v', 'error',
        '-f', 'lavfi',
        '-i', 'nullsrc=s=64x64:d=0.04',
        '-c:v', enc,
        '-f', 'null', '-',
      ]);
      cachedVideoEncoder = enc;
      return enc;
    } catch {
      // Hardware encoder not initialized or supported on this system
    }
  }

  cachedVideoEncoder = 'libx264';
  return 'libx264';
}

/**
 * Automatically clean up temporary rendering and transcode files in storage/temp older than maxAgeMs.
 * Defaults to files older than 2 hours.
 */
export async function cleanupTempStorage(
  tempDir = APP_CONFIG.tempDir,
  maxAgeMs = 2 * 60 * 60 * 1000
): Promise<number> {
  if (!fs.existsSync(tempDir)) return 0;
  let deletedCount = 0;
  try {
    const files = await fs.promises.readdir(tempDir, { withFileTypes: true });
    const now = Date.now();
    for (const file of files) {
      if (file.isSymbolicLink()) continue;
      const fullPath = path.join(tempDir, file.name);
      if (isStoragePathActive(fullPath)) continue;
      try {
        const stats = await fs.promises.lstat(fullPath);
        if ((stats.isFile() || stats.isDirectory()) && now - stats.mtimeMs > maxAgeMs) {
          await fs.promises.rm(fullPath, { recursive: stats.isDirectory(), force: true });
          deletedCount++;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Storage temp cleanup warning:', err);
  }
  return deletedCount;
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
    signal,
  } = options;

  if (signal?.aborted) throw new Error('Render cancelled.');

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

  const stagingOutputPath = createStorageStagingPath(outputPath);
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

  const encoder = await detectBestVideoEncoder();
  const encoderArgs: string[] = ['-c:v', encoder];
  if (encoder === 'libx264') {
    encoderArgs.push('-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p');
  } else if (encoder === 'h264_nvenc') {
    encoderArgs.push('-preset', 'p4', '-pix_fmt', 'yuv420p');
  } else if (encoder === 'h264_qsv') {
    encoderArgs.push('-global_quality', '23', '-pix_fmt', 'nv12');
  } else {
    encoderArgs.push('-pix_fmt', 'yuv420p');
  }

  args.push(
    ...encoderArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    stagingOutputPath
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    let settled = false;
    const cleanupSignal = () => signal?.removeEventListener('abort', abortRender);
    const abortRender = () => {
      if (process.platform === 'win32' && proc.pid) spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
      else proc.kill('SIGTERM');
    };
    const fail = async (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupSignal();
      await removeStorageFile(stagingOutputPath);
      reject(error);
    };
    signal?.addEventListener('abort', abortRender, { once: true });
    if (signal?.aborted) abortRender();

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
      if (settled) return;
      if (signal?.aborted) return void await fail(new Error('Render cancelled.'));
      if (code === 0) {
        try {
          const validated = await validateRenderedClip(stagingOutputPath);
          if (!validated.valid) {
            await fail(new Error(validated.error || 'Validation failed for rendered clip'));
            return;
          }
          if (signal?.aborted) return void await fail(new Error('Render cancelled.'));
          await commitStorageFile(stagingOutputPath, outputPath);
          settled = true;
          cleanupSignal();
          resolve({ outputPath, duration: validated.duration });
        } catch (e: any) {
          await fail(e instanceof Error ? e : new Error('Render failed'));
        }
      } else {
        await fail(new Error(`FFmpeg rendering exited with code ${code}. Stderr: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      void fail(err);
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

export interface SpeechInterval {
  start: number;
  end: number;
  duration: number;
}

/**
 * Dynamically detect exact hardware acoustic speech intervals from any audio/video file
 * using FFmpeg silencedetect filter. Returns non-silent speech windows [start, end] in seconds.
 */
export async function detectSpeechIntervals(
  audioFilePath: string,
  noiseDb = -25,
  minSilenceSec = 0.24
): Promise<{ totalDuration: number; intervals: SpeechInterval[] }> {
  if (!fs.existsSync(audioFilePath)) {
    return { totalDuration: 0, intervals: [] };
  }

  let totalDuration = 0;
  try {
    const meta = await probeVideo(audioFilePath);
    totalDuration = meta.duration || 0;
  } catch {
    totalDuration = 0;
  }

  let detectedMeanVolume: number | null = null;
  let detectedMaxVolume: number | null = null;

  const runPass = async (db: number, includeVolumeDetect = false): Promise<SpeechInterval[]> => {
    const ffmpegPath = getFfmpegPath();
    const filterChain = includeVolumeDetect
      ? `volumedetect,silencedetect=noise=${db}dB:d=${minSilenceSec}`
      : `silencedetect=noise=${db}dB:d=${minSilenceSec}`;
    const args = [
      '-hide_banner',
      '-i',
      audioFilePath,
      '-af',
      filterChain,
      '-f',
      'null',
      '-',
    ];

    let stderr = '';
    await new Promise<void>((resolve) => {
      const proc = spawn(ffmpegPath, args);
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });

    if (!totalDuration) {
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        totalDuration =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseFloat(durMatch[3]);
      }
    }

    if (includeVolumeDetect) {
      const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
      if (meanMatch) detectedMeanVolume = parseFloat(meanMatch[1]);
      const maxMatch = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
      if (maxMatch) detectedMaxVolume = parseFloat(maxMatch[1]);
    }

    const silences: Array<{ start: number; end: number }> = [];
    let currentSilenceStart: number | null = null;

    const lines = stderr.split(/\r?\n/);
    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
      if (startMatch) {
        currentSilenceStart = Math.max(0, parseFloat(startMatch[1]));
      }
      const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
      if (endMatch) {
        const sEnd = Math.max(0, parseFloat(endMatch[1]));
        const sStart = currentSilenceStart !== null ? currentSilenceStart : 0;
        if (sEnd - sStart >= minSilenceSec) {
          silences.push({ start: sStart, end: sEnd });
        }
        currentSilenceStart = null;
      }
    }

    if (currentSilenceStart !== null && totalDuration - currentSilenceStart >= minSilenceSec) {
      silences.push({ start: currentSilenceStart, end: totalDuration });
    }

    if (silences.length === 0) {
      return totalDuration > 0
        ? [{ start: 0, end: Number(totalDuration.toFixed(2)), duration: Number(totalDuration.toFixed(2)) }]
        : [];
    }

    const speechIntervals: SpeechInterval[] = [];
    let cursor = 0;

    for (const sil of silences) {
      if (sil.start - cursor >= 0.18) {
        const s = Number(cursor.toFixed(2));
        const e = Number(sil.start.toFixed(2));
        speechIntervals.push({
          start: s,
          end: e,
          duration: Number((e - s).toFixed(2)),
        });
      }
      cursor = Math.max(cursor, sil.end);
    }

    if (totalDuration - cursor >= 0.18) {
      const s = Number(cursor.toFixed(2));
      const e = Number(totalDuration.toFixed(2));
      speechIntervals.push({
        start: s,
        end: e,
        duration: Number((e - s).toFixed(2)),
      });
    }

    return speechIntervals;
  };

  let intervals = await runPass(noiseDb, true);
  const totalSpeechSec = intervals.reduce((acc, iv) => acc + iv.duration, 0);

  // Dynamic volume-adaptive retry:
  // Case A: Quiet audio where fixed noiseDb treated almost everything as silence (0 intervals or < 15% speech)
  if ((intervals.length === 0 || (totalDuration > 3 && totalSpeechSec < totalDuration * 0.15)) && detectedMeanVolume !== null) {
    const quietAdaptiveDb = Math.max(-50, Math.min(noiseDb - 5, Math.round(detectedMeanVolume - 4)));
    const retryQuiet = await runPass(quietAdaptiveDb, false);
    if (retryQuiet.length > 0) {
      intervals = retryQuiet;
    }
  }
  // Case B: Loud audio / background music where fixed noiseDb missed pauses (only 1 giant interval for > 5s audio)
  else if (intervals.length <= 1 && totalDuration > 5) {
    const loudAdaptiveDb =
      detectedMeanVolume !== null
        ? Math.max(-22, Math.min(-14, Math.round(detectedMeanVolume - 2)))
        : -20;
    if (loudAdaptiveDb !== noiseDb) {
      const retryLoud = await runPass(loudAdaptiveDb, false);
      if (retryLoud.length > intervals.length) {
        intervals = retryLoud;
      }
    }
  }

  return { totalDuration, intervals };
}


