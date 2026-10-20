import path from 'path';
import fs from 'fs';
import { CaptionGroup, CaptionStyle, ImageFitMode, ImagePosition, OutputSettings, SfxCue, TranscriptWord } from './types';
import { RemotionCaptionProps } from '../../remotion/types';
import { probeAudioDuration } from './ffmpeg-renderer';

export interface RenderRemotionOptions {
  imagePath?: string;
  imageUrl?: string;
  audioPath?: string;
  audioUrl?: string;
  outputPath: string;
  groups: CaptionGroup[];
  words: TranscriptWord[];
  style: CaptionStyle;
  outputSettings: OutputSettings;
  imageFitMode?: ImageFitMode;
  imagePosition?: ImagePosition;
  imageScale?: number;
  mediaType?: 'image' | 'video';
  voiceVolume?: number;
  voiceMuted?: boolean;
  bgMusicPath?: string;
  bgMusicUrl?: string;
  bgMusicVolume?: number;
  bgMusicMuted?: boolean;
  bgMusicFadeIn?: number;
  bgMusicFadeOut?: number;
  bgMusicAutoDucking?: boolean;
  bgMusicOffset?: number;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  speaker1Color?: string;
  speaker2Color?: string;
  onProgress?: (percent: number) => void;
}

// In-memory cache for the Webpack bundle location across render requests
let cachedBundleLocation: string | null = null;
let bundlingPromise: Promise<string> | null = null;

function getLatestRemotionMtime(): number {
  const remotionDir = path.resolve(process.cwd(), 'src/remotion');
  try {
    if (!fs.existsSync(remotionDir)) return 0;
    const files = fs.readdirSync(remotionDir);
    let maxMtime = 0;
    for (const file of files) {
      const full = path.join(remotionDir, file);
      const stat = fs.statSync(full);
      if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    }
    return maxMtime;
  } catch {
    return 0;
  }
}

export async function getRemotionBundle(): Promise<string> {
  if (cachedBundleLocation && fs.existsSync(/*turbopackIgnore: true*/ cachedBundleLocation)) {
    try {
      const bundleStat = fs.statSync(/*turbopackIgnore: true*/ cachedBundleLocation);
      const latestMtime = getLatestRemotionMtime();
      if (bundleStat.mtimeMs >= latestMtime) {
        return cachedBundleLocation;
      }
      console.log('[Remotion] Composition source updated, re-bundling...');
      cachedBundleLocation = null;
    } catch {
      cachedBundleLocation = null;
    }
  }

  if (bundlingPromise) {
    return bundlingPromise;
  }

  bundlingPromise = (async () => {
    const { bundle } = await import('@remotion/bundler');
    const entryPoint = path.resolve(process.cwd(), 'src/remotion/index.ts');
    console.log('[Remotion] Bundling composition entry:', entryPoint);

    const bundleLocation = await bundle({
      entryPoint,
      onProgress: (progress) => {
        if (progress % 25 === 0) {
          console.log(`[Remotion] Bundling progress: ${progress}%`);
        }
      },
    });

    cachedBundleLocation = bundleLocation;
    console.log('[Remotion] Bundle generated at:', bundleLocation);
    return bundleLocation;
  })();

  try {
    return await bundlingPromise;
  } finally {
    bundlingPromise = null;
  }
}

/**
 * Convert local file to base64 Data URL for zero-latency, CORS-free loading in Headless Chrome.
 */
function fileToDataUrl(filePath: string, mimeType: string): string {
  const buffer = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Programmatically render MP4 video with GSAP typography animations via Remotion.
 */
export async function renderRemotionReelVideo(
  options: RenderRemotionOptions
): Promise<{ outputPath: string; duration: number }> {
  const {
    imagePath,
    imageUrl,
    audioPath,
    audioUrl,
    outputPath,
    groups,
    words,
    style,
    outputSettings,
    imageFitMode = 'cover',
    imagePosition = 'center',
    imageScale = 100,
    mediaType,
    onProgress,
  } = options;

  // 1. Get exact audio duration
  let duration = 10;
  if (audioPath && fs.existsSync(audioPath)) {
    duration = await probeAudioDuration(audioPath);
  } else if (words.length > 0) {
    const maxWordEnd = Math.max(...words.map((w) => w.end));
    duration = Math.max(3, maxWordEnd + 0.5);
  }

  // 2. Resolve image/video source (prefer Data URL if image, file:// if video)
  const isVideo =
    mediaType === 'video' ||
    Boolean(imagePath && /\.(mp4|mov|webm|mkv|avi)$/i.test(imagePath)) ||
    Boolean(imageUrl && /\.(mp4|mov|webm|mkv|avi)($|\?)/i.test(imageUrl));
  const resolvedMediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

  let resolvedImageSrc = imageUrl;
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const mime = getMimeType(imagePath);
      // For large video files, Data URL in base64 can exceed Node memory; use file:// URI instead!
      if (resolvedMediaType === 'video' || mime.startsWith('video/')) {
        resolvedImageSrc = `file://${path.resolve(imagePath).replace(/\\/g, '/')}`;
      } else {
        resolvedImageSrc = fileToDataUrl(imagePath, mime);
      }
    } catch {
      resolvedImageSrc = imageUrl;
    }
  }

  // 3. Resolve audio source (prefer Data URL if local file exists)
  let resolvedAudioSrc = audioUrl;
  if (audioPath && fs.existsSync(audioPath)) {
    try {
      const mime = getMimeType(audioPath);
      resolvedAudioSrc = fileToDataUrl(audioPath, mime);
    } catch {
      resolvedAudioSrc = audioUrl;
    }
  }

  // 3b. Resolve background music source if provided
  let resolvedBgMusicSrc = options.bgMusicUrl;
  if (options.bgMusicPath && fs.existsSync(options.bgMusicPath)) {
    try {
      const mime = getMimeType(options.bgMusicPath);
      resolvedBgMusicSrc = fileToDataUrl(options.bgMusicPath, mime);
    } catch {
      resolvedBgMusicSrc = options.bgMusicUrl;
    }
  }

  // 3c. Resolve AI sound effect cues with self-contained data URLs
  const resolvedSfxCues: SfxCue[] = (options.sfxCues || []).map((cue) => {
    const sfxFile = path.join(process.cwd(), 'public', 'audio', 'sfx', `${cue.type}.mp3`);
    let dataUrl: string | undefined;
    if (fs.existsSync(sfxFile)) {
      try {
        dataUrl = fileToDataUrl(sfxFile, 'audio/mpeg');
      } catch {}
    }
    return {
      ...cue,
      audioSrc: dataUrl || `/audio/sfx/${cue.type}.mp3`,
    };
  });

  // 4. Ensure Remotion composition bundle is ready
  const bundleLocation = await getRemotionBundle();

  // 5. Prepare Remotion Input Props
  const inputProps: RemotionCaptionProps = {
    imageSrc: resolvedImageSrc,
    audioSrc: resolvedAudioSrc,
    voiceVolume: options.voiceVolume,
    voiceMuted: options.voiceMuted,
    bgMusicSrc: resolvedBgMusicSrc,
    bgMusicVolume: options.bgMusicVolume ?? 0.20,
    bgMusicMuted: options.bgMusicMuted,
    bgMusicFadeIn: options.bgMusicFadeIn ?? 0.8,
    bgMusicFadeOut: options.bgMusicFadeOut ?? 1.2,
    bgMusicAutoDucking: options.bgMusicAutoDucking ?? true,
    bgMusicOffset: options.bgMusicOffset ?? 0,
    sfxCues: resolvedSfxCues,
    autoSfxEnabled: options.autoSfxEnabled,
    speaker1Color: options.speaker1Color,
    speaker2Color: options.speaker2Color,
    transcript: words,
    captionGroups: groups,
    captionStyle: style,
    outputSettings,
    imageFitMode,
    imagePosition,
    imageScale,
    mediaType: resolvedMediaType,
    durationInSeconds: duration,
  };

  // 6. Select Composition
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'CaptionReel',
    inputProps: inputProps as unknown as Record<string, unknown>,
  });

  const tempDir = path.dirname(outputPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 7. Render frames and encode to MP4 via Remotion Renderer
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: inputProps as unknown as Record<string, unknown>,
    imageFormat: 'jpeg',
    binariesDirectory: path.resolve(process.cwd(), 'bin'),
    logLevel: 'warn',
    onProgress: ({ progress }) => {
      if (onProgress) {
        onProgress(Math.min(99, Math.round(progress * 100)));
      }
    },
  });

  if (onProgress) {
    onProgress(100);
  }

  return {
    outputPath,
    duration,
  };
}
