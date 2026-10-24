import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFfmpegPath } from '../src/lib/config';
import { probeVideo } from '../src/lib/ffmpeg';
import { renderRemotionReelVideo } from '../src/lib/caption-maker/remotion-renderer';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from '../src/lib/caption-maker/sample-data';
import type { TranscriptWord } from '../src/lib/caption-maker/types';

async function main() {
  assert.equal(process.platform, 'linux', 'This verification must run in the Linux container');
  assert.ok(process.env.CHROME_PATH, 'Use the container-installed Chromium');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-linux-render-'));
  const run = promisify(execFile);
  try {
    const ffmpeg = getFfmpegPath();
    const image = path.join(directory, 'background.png');
    const audio = path.join(directory, 'voice.wav');
    const output = path.join(directory, 'hindi-reel.mp4');
    const font = await run('fc-match', ['Noto Sans Devanagari'], { timeout: 10000 });
    assert.ok(font.stdout.includes('Noto Sans Devanagari'), 'Hindi font must be installed, not a fallback');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x568', '-frames:v', '1', '-threads', '1', image], { timeout: 30000 });
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', audio], { timeout: 30000 });
    const words: TranscriptWord[] = [{ id: 'one', text: 'नमस्ते', start: 0, end: 0.5 }, { id: 'two', text: 'दुनिया', start: 0.5, end: 1 }];
    await renderRemotionReelVideo({
      imagePath: image, audioPath: audio, outputPath: output, words,
      groups: [{ id: 'group', text: 'नमस्ते दुनिया', start: 0, end: 1, words }],
      style: { ...DEFAULT_CAPTION_STYLE, fontFamily: 'Noto Sans Devanagari', fontSize: 32, showSafeArea: false, showEmojis: false },
      outputSettings: { ...DEFAULT_OUTPUT_SETTINGS, width: 320, height: 568, fps: 10 },
    });
    const metadata = await probeVideo(output);
    assert.ok(metadata.sizeBytes > 0 && metadata.hasAudio);
    assert.equal(metadata.width, 320);
    assert.equal(metadata.height, 568);
    assert.ok(Math.abs(metadata.duration - 1) < 0.2);
    console.log('PASS: Linux Chromium/Remotion Hindi-caption render, packaged binaries, audio and MP4 verification');
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
