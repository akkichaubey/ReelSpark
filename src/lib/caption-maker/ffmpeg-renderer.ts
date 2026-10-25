import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath } from '../config';
import { escapeFilterPath, detectBestVideoEncoder, cleanupTempStorage } from '../ffmpeg';
import { CaptionGroup, CaptionStyle, ImageFitMode, ImagePosition, OutputSettings, SfxCue, TranscriptWord } from './types';
import { generateAssSubtitles } from './ass-generator';
import { buildFfmpegEncodingArgs } from './export-settings';
import { commitStorageFile, createStorageStagingPath, removeStorageFile } from '../storage-files';

const execFileAsync = promisify(execFile);

export { detectBestVideoEncoder, cleanupTempStorage };

export interface RenderReelOptions {
  imagePath: string;
  audioPath: string;
  outputPath: string;
  groups: CaptionGroup[];
  words: TranscriptWord[];
  style: CaptionStyle;
  outputSettings: OutputSettings;
  imageFitMode?: ImageFitMode;
  imagePosition?: ImagePosition;
  imageScale?: number;
  mediaType?: 'image' | 'video';
  voiceVolume?: number; // 0.0 to 2.0 (default 1.0, >1.0 = Boost ⚡)
  voiceMuted?: boolean;
  studioDenoise?: boolean;
  bgMusicPath?: string;
  bgMusicVolume?: number;
  bgMusicMuted?: boolean;
  bgMusicFadeIn?: number;
  bgMusicFadeOut?: number;
  bgMusicAutoDucking?: boolean;
  bgMusicOffset?: number;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Get exact pad (X, Y) and overlay (X, Y) coordinate expressions for all 9 positioning options.
 */
export function getImagePositionPadCoords(position: ImagePosition = 'bottom-left'): {
  padX: string;
  padY: string;
  overlayX: string;
  overlayY: string;
} {
  switch (position) {
    case 'top-left':
      return { padX: '0', padY: '0', overlayX: '0', overlayY: '0' };
    case 'top-center':
      return { padX: '(ow-iw)/2', padY: '0', overlayX: '(W-w)/2', overlayY: '0' };
    case 'top-right':
      return { padX: '(ow-iw)', padY: '0', overlayX: '(W-w)', overlayY: '0' };
    case 'center-left':
      return { padX: '0', padY: '(oh-ih)/2', overlayX: '0', overlayY: '(H-h)/2' };
    case 'center':
      return { padX: '(ow-iw)/2', padY: '(oh-ih)/2', overlayX: '(W-w)/2', overlayY: '(H-h)/2' };
    case 'center-right':
      return { padX: '(ow-iw)', padY: '(oh-ih)/2', overlayX: '(W-w)', overlayY: '(H-h)/2' };
    case 'bottom-left':
      return { padX: '0', padY: '(oh-ih)', overlayX: '0', overlayY: '(H-h)' };
    case 'bottom-center':
      return { padX: '(ow-iw)/2', padY: '(oh-ih)', overlayX: '(W-w)/2', overlayY: '(H-h)' };
    case 'bottom-right':
      return { padX: '(ow-iw)', padY: '(oh-ih)', overlayX: '(W-w)', overlayY: '(H-h)' };
    default:
      return { padX: '0', padY: '(oh-ih)', overlayX: '0', overlayY: '(H-h)' };
  }
}

/**
 * Get exact crop (X, Y) coordinate expressions when media is scaled >100% beyond canvas.
 */
export function getImagePositionCropCoords(position: ImagePosition = 'bottom-left', width: number, height: number): {
  cropX: string;
  cropY: string;
} {
  switch (position) {
    case 'top-left':
      return { cropX: '0', cropY: '0' };
    case 'top-center':
      return { cropX: `(in_w-${width})/2`, cropY: '0' };
    case 'top-right':
      return { cropX: `in_w-${width}`, cropY: '0' };
    case 'center-left':
      return { cropX: '0', cropY: `(in_h-${height})/2` };
    case 'center':
      return { cropX: `(in_w-${width})/2`, cropY: `(in_h-${height})/2` };
    case 'center-right':
      return { cropX: `in_w-${width}`, cropY: `(in_h-${height})/2` };
    case 'bottom-left':
      return { cropX: '0', cropY: `in_h-${height}` };
    case 'bottom-center':
      return { cropX: `(in_w-${width})/2`, cropY: `in_h-${height}` };
    case 'bottom-right':
      return { cropX: `in_w-${width}`, cropY: `in_h-${height}` };
    default:
      return { cropX: '0', cropY: `in_h-${height}` };
  }
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
 * Extract audio stream from a video file into high-quality MP3 for speech-to-text and reel playback.
 */
export async function extractAudioFromVideo(
  videoPath: string,
  outputPath: string
): Promise<{ outputPath: string; duration: number }> {
  const ffmpeg = getFfmpegPath();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = [
    '-y',
    '-i', videoPath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    outputPath,
  ];

  await execFileAsync(ffmpeg, args);
  const duration = await probeAudioDuration(outputPath);
  return { outputPath, duration };
}

/**
 * Synthesize synchronized SFX audio cues into a single aligned track using FFmpeg adelay & amix.
 */
export async function generateSfxTrack(
  sfxCues: SfxCue[],
  duration: number,
  outputPath: string
): Promise<boolean> {
  const validCues = sfxCues.filter((c) => {
    const sfxPath = path.join(process.cwd(), 'public', 'audio', 'sfx', `${c.type}.mp3`);
    return fs.existsSync(sfxPath) && c.time < duration;
  });
  if (validCues.length === 0) return false;

  const ffmpeg = getFfmpegPath();
  const inputArgs: string[] = [];
  const filterParts: string[] = [];

  validCues.forEach((cue, idx) => {
    const sfxPath = path.join(process.cwd(), 'public', 'audio', 'sfx', `${cue.type}.mp3`);
    inputArgs.push('-i', sfxPath);
    const delayMs = Math.max(0, Math.round(cue.time * 1000));
    const vol = Math.max(0, Math.min(1.0, cue.volume ?? 0.7));
    filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=${vol.toFixed(2)}[s${idx}]`);
  });

  const mixInputs = validCues.map((_, idx) => `[s${idx}]`).join('');
  filterParts.push(
    `${mixInputs}amix=inputs=${validCues.length}:duration=longest:dropout_transition=0,apad,atrim=0:${duration.toFixed(2)}[out]`
  );

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterParts.join('; '),
    '-map', '[out]',
    '-c:a', 'libmp3lame',
    outputPath,
  ];

  await execFileAsync(ffmpeg, args);
  return true;
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
    imagePosition = 'center',
    imageScale = 100,
    bgMusicPath,
    onProgress,
    signal,
  } = options;

  if (signal?.aborted) throw new Error('Render cancelled.');

  const ffmpeg = getFfmpegPath();
  const { width, height } = outputSettings;
  const scalePct = Math.max(0.4, Math.min(2.0, (imageScale ?? 100) / 100));
  const targetW = Math.round(width * scalePct);
  const targetH = Math.round(height * scalePct);

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Background image not found at ${imagePath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at ${audioPath}`);
  }

  // 1. Get exact audio duration
  const audioDuration = await probeAudioDuration(audioPath);
  if (signal?.aborted) throw new Error('Render cancelled.');

  // 2. Generate ASS Subtitles file
  const assContent = generateAssSubtitles(groups, words, style, outputSettings);
  const tempDir = path.dirname(outputPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const assPath = path.join(tempDir, `captions_${Date.now()}.ass`);
  await fs.promises.writeFile(assPath, assContent, 'utf8');
  const stagingOutputPath = createStorageStagingPath(outputPath);

  // 3. Build FFmpeg filter complex for image fit mode + burned-in subtitles
  const escapedAss = escapeFilterPath(assPath);
  const { padX, padY } = getImagePositionPadCoords(imagePosition);
  let filterComplex = '';

  if (imageFitMode === 'blur') {
    filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=25:5[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,subtitles='${escapedAss}'[outv]`;
  } else if (imageFitMode === 'contain') {
    if (scalePct <= 1.0) {
      filterComplex = `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${width}:${height}:${padX}:${padY}:color=black,subtitles='${escapedAss}'[outv]`;
    } else {
      const { cropX, cropY } = getImagePositionCropCoords(imagePosition, width, height);
      filterComplex = `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=max(iw\\,${width}):max(ih\\,${height}):${padX}:${padY}:color=black,crop=${width}:${height}:${cropX}:${cropY},subtitles='${escapedAss}'[outv]`;
    }
  } else {
    // Default: 'cover'
    filterComplex = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},subtitles='${escapedAss}'[outv]`;
  }

  const {
    voiceVolume = 1.0,
    voiceMuted = false,
    studioDenoise = false,
    bgMusicVolume = 0.20,
    bgMusicMuted = false,
    bgMusicFadeIn = 0.8,
    bgMusicFadeOut = 1.2,
    bgMusicAutoDucking = true,
    bgMusicOffset = 0,
  } = options;

  const hasBgm = Boolean(bgMusicPath && fs.existsSync(bgMusicPath));

  // 1. Voice audio track processing (Input 1:a)
  const voiceVol = voiceMuted ? 0 : Math.max(0, Math.min(2.0, voiceVolume));
  const voiceFilters: string[] = [];
  if (studioDenoise) {
    voiceFilters.push('afftdn=nf=-25');
  }
  voiceFilters.push(`volume=${voiceVol.toFixed(2)}`);
  const voiceFilterStr = voiceFilters.join(',');

  // 2. Background music track processing & mixing
  let audioFilter = '';
  if (hasBgm) {
    const bgmVol = bgMusicMuted ? 0 : Math.max(0, Math.min(1.0, bgMusicVolume));
    const bgmFilters: string[] = [`volume=${bgmVol.toFixed(2)}`];

    if (bgMusicFadeIn > 0) {
      const fadeInSec = Math.min(audioDuration, Math.max(0.1, bgMusicFadeIn));
      bgmFilters.push(`afade=t=in:ss=0:d=${fadeInSec.toFixed(2)}`);
    }

    if (bgMusicFadeOut > 0) {
      const fadeOutSec = Math.min(audioDuration, Math.max(0.1, bgMusicFadeOut));
      const startFadeOut = Math.max(0, audioDuration - fadeOutSec);
      bgmFilters.push(`afade=t=out:st=${startFadeOut.toFixed(2)}:d=${fadeOutSec.toFixed(2)}`);
    }

    const bgmFilterStr = bgmFilters.join(',');

    if (bgMusicAutoDucking && words.length > 0 && voiceVol > 0 && bgmVol > 0) {
      // VN / CapCut style smart auto-ducking: drops BGM during speech, restores in pauses
      audioFilter = `;[1:a]${voiceFilterStr}[voice];[2:a]${bgmFilterStr}[bgm_raw];[bgm_raw][voice]sidechaincompress=threshold=0.08:ratio=3.5:attack=50:release=350[bgm]`;
    } else {
      audioFilter = `;[1:a]${voiceFilterStr}[voice];[2:a]${bgmFilterStr}[bgm]`;
    }
  } else {
    // Standalone voice track with volume boost, muting, and denoise
    audioFilter = `;[1:a]${voiceFilterStr}[voice]`;
  }

  // 3. AI Sound Effect (SFX) Track Pre-Mix
  const tempSfxPath = path.join(path.dirname(outputPath), `temp_sfx_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  let hasSfxTrack = false;
  if (options.autoSfxEnabled !== false && options.sfxCues && options.sfxCues.length > 0) {
    try {
      hasSfxTrack = await generateSfxTrack(options.sfxCues, audioDuration, tempSfxPath);
    } catch (sfxErr) {
      console.warn('Failed to pre-mix SFX cues:', sfxErr);
      hasSfxTrack = false;
    }
  }

  const sfxInputIdx = hasBgm ? 3 : 2;
  const sfxArgs = hasSfxTrack ? ['-i', tempSfxPath] : [];

  // Final audio composite mix
  if (hasBgm && hasSfxTrack) {
    audioFilter += `;[voice][bgm][${sfxInputIdx}:a]amix=inputs=3:duration=first:dropout_transition=2[outa]`;
  } else if (hasBgm) {
    audioFilter += `;[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
  } else if (hasSfxTrack) {
    audioFilter += `;[voice][${sfxInputIdx}:a]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
  } else {
    audioFilter += `;[voice]anull[outa]`;
  }

  const isVideo =
    options.mediaType === 'video' ||
    /\.(mp4|mov|webm|mkv|avi)$/i.test(imagePath);

  const inputArgs = isVideo
    ? ['-stream_loop', '-1', '-i', imagePath]
    : ['-loop', '1', '-i', imagePath];

  const bgmArgs = hasBgm
    ? bgMusicOffset > 0
      ? ['-ss', bgMusicOffset.toFixed(2), '-stream_loop', '-1', '-i', bgMusicPath!]
      : ['-stream_loop', '-1', '-i', bgMusicPath!]
    : [];

  const encoder = await detectBestVideoEncoder();
  const { videoArgs, audioArgs } = buildFfmpegEncodingArgs(outputSettings, encoder);

  const audioMapArgs = ['-map', '[outa]'];

  const args = [
    '-y',
    ...inputArgs,
    '-i', audioPath,
    ...bgmArgs,
    ...sfxArgs,
    '-filter_complex', filterComplex + audioFilter,
    '-map', '[outv]',
    ...audioMapArgs,
    ...videoArgs,
    ...audioArgs,
    '-shortest',
    '-t', audioDuration.toFixed(2),
    stagingOutputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const cleanupSignal = () => signal?.removeEventListener('abort', abortRender);
    const cleanup = async () => {
      await Promise.all([removeStorageFile(assPath), removeStorageFile(tempSfxPath), removeStorageFile(stagingOutputPath)]);
    };
    const abortRender = () => {
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
      else child.kill('SIGTERM');
    };
    const fail = async (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupSignal();
      await cleanup();
      reject(error);
    };
    signal?.addEventListener('abort', abortRender, { once: true });
    if (signal?.aborted) abortRender();

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
      if (settled) return;
      if (signal?.aborted) return void await fail(new Error('Render cancelled.'));
      if (code === 0 && fs.existsSync(stagingOutputPath) && fs.statSync(stagingOutputPath).size > 1000) {
        try {
          await commitStorageFile(stagingOutputPath, outputPath);
          await Promise.all([removeStorageFile(assPath), removeStorageFile(tempSfxPath)]);
          settled = true;
          cleanupSignal();
          if (onProgress) onProgress(100);
          resolve({ outputPath, duration: audioDuration });
        } catch (error) {
          await fail(error instanceof Error ? error : new Error('Could not save the completed render'));
        }
      } else {
        await fail(new Error(`FFmpeg caption reel render failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      void fail(new Error(`Failed to launch FFmpeg: ${err.message}`));
    });
  });
}
