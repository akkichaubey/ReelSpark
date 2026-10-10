import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from '../config';
import { escapeFilterPath } from '../ffmpeg';
import { CaptionGroup, CaptionStyle, ImageFitMode, OutputSettings, TranscriptWord } from './types';
import { generateAssSubtitles } from './ass-generator';

const execFileAsync = promisify(execFile);

export interface RenderReelOptions {
  imagePath: string;
  audioPath: string;
  outputPath: string;
  groups: CaptionGroup[];
  words: TranscriptWord[];
  style: CaptionStyle;
  outputSettings: OutputSettings;
  imageFitMode?: ImageFitMode;
  onProgress?: (percent: number) => void;
}

/**
 * Probe audio duration using FFprobe.
 */
export async function probeAudioDuration(audioPath: string): Promise<number> {
  const ffprobe = getFfprobePath();
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobe, args);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) || duration <= 0 ? 10 : duration;
  } catch (err: any) {
    console.warn('FFprobe audio probe warning:', err.message);
    return 10;
  }
}

/**
 * Render a complete Animated Caption Reel MP4 using FFmpeg.
 */
export async function renderReelVideo(options: RenderReelOptions): Promise<{ outputPath: string; duration: number }> {
  const {
    imagePath,
    audioPath,
    outputPath,
    groups,
    words,
    style,
    outputSettings,
    imageFitMode = 'cover',
    onProgress,
  } = options;

  const ffmpeg = getFfmpegPath();
  const { width, height } = outputSettings;

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Background image not found at ${imagePath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at ${audioPath}`);
  }

  // 1. Get exact audio duration
  const audioDuration = await probeAudioDuration(audioPath);

  // 2. Generate ASS Subtitles file
  const assContent = generateAssSubtitles(groups, words, style, outputSettings);
  const tempDir = path.dirname(outputPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const assPath = path.join(tempDir, `captions_${Date.now()}.ass`);
  await fs.promises.writeFile(assPath, assContent, 'utf8');

  // 3. Build FFmpeg filter complex for image fit mode + burned-in subtitles
  const escapedAss = escapeFilterPath(assPath);
  let filterComplex = '';

  if (imageFitMode === 'cover') {
    filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},subtitles='${escapedAss}'[outv]`;
  } else if (imageFitMode === 'contain') {
    filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,subtitles='${escapedAss}'[outv]`;
  } else {
    // 'blur' background mode
    filterComplex = `[0:v]split=2[bg][fg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=25:5[bg_blur];[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg_scaled];[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2,subtitles='${escapedAss}'[outv]`;
  }

  const args = [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-i', audioPath,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-t', audioDuration.toFixed(2),
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    child.stderr.on('data', (data) => {
      const line = data.toString();
      const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && onProgress) {
        const curSec =
          parseInt(timeMatch[1], 10) * 3600 +
          parseInt(timeMatch[2], 10) * 60 +
          parseFloat(timeMatch[3]);
        const pct = Math.min(99, Math.round((curSec / audioDuration) * 100));
        onProgress(pct);
      }
    });

    child.on('close', async (code) => {
      // Clean up temporary ASS file
      try {
        if (fs.existsSync(assPath)) {
          await fs.promises.unlink(assPath);
        }
      } catch {
        // Ignore unlink error
      }

      if (code === 0 && fs.existsSync(outputPath)) {
        if (onProgress) onProgress(100);
        resolve({ outputPath, duration: audioDuration });
      } else {
        reject(new Error(`FFmpeg caption reel render failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to launch FFmpeg: ${err.message}`));
    });
  });
}
