import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFfmpegPath } from '../src/lib/config';
import { probeVideo } from '../src/lib/ffmpeg';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from '../src/lib/caption-maker/sample-data';
import { renderRemotionReelVideo } from '../src/lib/caption-maker/remotion-renderer';
import type { CaptionGroup, CaptionStyle, TranscriptWord } from '../src/lib/caption-maker/types';

function countYellowPixels(frame: Buffer) {
  let count = 0;
  for (let index = 0; index + 2 < frame.length; index += 3) {
    const red = frame[index];
    const green = frame[index + 1];
    const blue = frame[index + 2];
    if (red > 150 && green > 100 && blue < 100 && red > blue * 1.8) count += 1;
  }
  return count;
}

async function main() {
  const chrome = process.env.CHROME_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  process.env.CHROME_PATH = chrome;
  const ffmpeg = getFfmpegPath();
  const directory = mkdtempSync(join(tmpdir(), 'reelspark-remotion-sync-'));
  const image = join(directory, 'background.png');
  const audio = join(directory, 'voice.wav');
  const video = join(directory, 'remotion-caption-sync.mp4');
  const soloVideo = join(directory, 'remotion-solo-caption-sync.mp4');

  try {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
      '-i', 'color=c=black:s=320x568:r=10:d=1', '-frames:v', '1', image,
    ], { stdio: 'pipe' });
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
      '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:a', 'pcm_s16le', audio,
    ], { stdio: 'pipe' });

    const words: TranscriptWord[] = [
      { id: 'first', text: 'FIRST', start: 0.1, end: 0.3 },
      { id: 'second', text: 'SECOND', start: 0.6, end: 0.8 },
    ];
    const group: CaptionGroup = {
      id: 'phrase', text: 'FIRST SECOND', start: 0.1, end: 0.9, words,
    };

    const common = {
      imagePath: image,
      audioPath: audio,
      groups: [group],
      words,
      outputSettings: {
        ...DEFAULT_OUTPUT_SETTINGS,
        preset: 'instagram-reel' as const,
        width: 320,
        height: 568,
        aspectRatio: '9:16',
        fps: 10,
        quality: 'draft' as const,
      },
    };
    const baseStyle: CaptionStyle = {
        ...DEFAULT_CAPTION_STYLE,
        fontFamily: 'Arial, sans-serif',
        fontSize: 40,
        fontWeight: 'bold',
        captionMode: 'phrase-highlight',
        animationPreset: 'clean',
        highlightAnimation: 'background',
        activeWordBgColor: '#FCD905',
        backgroundStyle: 'none',
        textEffect: 'none',
        strokeWidth: 0,
        showEmojis: false,
        showSafeArea: false,
      };
    await renderRemotionReelVideo({
      ...common,
      outputPath: video,
      style: { ...baseStyle, captionMode: 'phrase-highlight', animationPreset: 'clean' },
    });

    await renderRemotionReelVideo({
      ...common,
      outputPath: soloVideo,
      style: { ...baseStyle, captionMode: 'word-by-word', animationPreset: 'words-slide-up' },
    });

    async function inspectRender(path: string, label: string) {
      const metadata = await probeVideo(path);
      assert.equal(metadata.width, 320, `${label} width`);
      assert.equal(metadata.height, 568, `${label} height`);
      assert.ok(metadata.hasAudio, `${label} must preserve synchronized audio`);
      assert.ok(Math.abs(metadata.duration - 1) < 0.15, `${label} duration should be about one second, got ${metadata.duration}`);

      const frameSize = metadata.width * metadata.height * 3;
      const decoded = execFileSync(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-i', path,
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
      ], { maxBuffer: 16 * 1024 * 1024 });
      assert.ok(decoded.length >= frameSize * 9, `${label} expected at least 9 frames; got ${decoded.length / frameSize}`);
      const getFrame = (frameNumber: number) => decoded.subarray(frameNumber * frameSize, (frameNumber + 1) * frameSize);
      const firstActive = countYellowPixels(getFrame(2));
      const pause = countYellowPixels(getFrame(4));
      const secondActive = countYellowPixels(getFrame(7));
      assert.ok(firstActive > 5, `${label} should highlight the first spoken word: ${firstActive}`);
      assert.ok(pause < firstActive, `${label} pause must not retain the previous highlight: ${pause} vs ${firstActive}`);
      assert.ok(secondActive > pause, `${label} should highlight the second word at its timestamp: ${secondActive} vs ${pause}`);
      return { duration: metadata.duration, firstActive, pause, secondActive };
    }

    const phraseMetrics = await inspectRender(video, 'Phrase Remotion render');
    const soloMetrics = await inspectRender(soloVideo, 'Solo Remotion render');

    console.log(`✓ Remotion phrase render passed: 320×568 @10fps, audio present, ${phraseMetrics.duration.toFixed(3)}s.`);
    console.log(`✓ Phrase active/pause/active yellow pixels: ${phraseMetrics.firstActive}/${phraseMetrics.pause}/${phraseMetrics.secondActive}.`);
    console.log(`✓ Remotion solo word render passed: 320×568 @10fps, audio present, ${soloMetrics.duration.toFixed(3)}s.`);
    console.log(`✓ Solo active/pause/active yellow pixels: ${soloMetrics.firstActive}/${soloMetrics.pause}/${soloMetrics.secondActive}.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
