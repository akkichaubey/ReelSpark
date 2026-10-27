import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getActiveTranscriptWordAtTime,
  getCaptionTimingSegments,
  getStaggeredAnimationTiming,
  getWordAnimationWindow,
  getWordHighlightProgress,
  interpolateCssColor,
  isTranscriptWordActiveAtTime,
} from '../src/lib/caption-maker/caption-timing';
import { generateAssSubtitles } from '../src/lib/caption-maker/ass-generator';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from '../src/lib/caption-maker/sample-data';
import type {
  AnimationPreset,
  CaptionGroup,
  CaptionStyle,
  HighlightAnimation,
  TranscriptWord,
} from '../src/lib/caption-maker/types';

const words: TranscriptWord[] = [
  { id: 'w1', text: 'पहला', start: 0, end: 0.2, isImportant: false },
  { id: 'w2', text: 'दूसरा', start: 0.6, end: 0.8, isImportant: true },
];
const group: CaptionGroup = {
  id: 'g1',
  text: 'पहला दूसरा',
  start: 0,
  end: 0.9,
  words,
};

function testWordBoundariesAndPauses() {
  assert.equal(isTranscriptWordActiveAtTime(words[0], 0), true, 'Word start is inclusive');
  assert.equal(isTranscriptWordActiveAtTime(words[0], 0.2), false, 'Word end is exclusive');
  assert.equal(getActiveTranscriptWordAtTime(words, 0.199)?.id, 'w1');
  assert.equal(getActiveTranscriptWordAtTime(words, 0.2), undefined, 'Speech gap must not retain old word');
  assert.equal(getActiveTranscriptWordAtTime(words, 0.6)?.id, 'w2', 'New word owns its exact start');
  assert.equal(getActiveTranscriptWordAtTime(words, 0.8), undefined, 'Trailing gap must be neutral');
  assert.equal(getActiveTranscriptWordAtTime(words, Number.NaN), undefined, 'Invalid playhead is neutral');

  const segments = getCaptionTimingSegments(group);
  assert.deepEqual(
    segments.map(({ start, end, activeWord }) => [start, end, activeWord?.id]),
    [
      [0, 0.2, 'w1'],
      [0.2, 0.6, undefined],
      [0.6, 0.8, 'w2'],
      [0.8, 0.9, undefined],
    ],
    'Phrase timing should preserve visible phrase across pauses without stale highlighting'
  );

  const overlapping: TranscriptWord[] = [
    { id: 'old', text: 'old', start: 1, end: 2 },
    { id: 'new', text: 'new', start: 1.4, end: 1.6 },
  ];
  assert.equal(getActiveTranscriptWordAtTime(overlapping, 1.5)?.id, 'new');
  assert.equal(
    getActiveTranscriptWordAtTime(overlapping, 1.7),
    undefined,
    'A superseded overlapping word must not resume after the later word ends'
  );
}

function testAnimationWindows() {
  const short = getWordAnimationWindow(3, 3.05, 0.22, 0.06);
  assert.equal(short.end, 3.05);
  assert.ok(short.entryDuration + short.exitDuration <= short.duration + 1e-9);
  assert.equal(short.exitStart + short.exitDuration, short.end);
  assert.equal(getWordHighlightProgress(3, 3.05, 3), 0);
  assert.ok(getWordHighlightProgress(3, 3.05, 3.016) > 0);
  assert.equal(getWordHighlightProgress(3, 3.05, 3.05), 0, 'No active styling at exact word end');

  const stagger = getStaggeredAnimationTiming(40, 0.08, 0.3, 0.025);
  assert.ok(stagger.totalDuration <= 0.08 + 1e-9, 'Long letter sequences must fit phrase duration');
  assert.equal(getStaggeredAnimationTiming(Number.NaN, 0.1, 0.1, 0.1).totalDuration, 0.1);
  assert.equal(interpolateCssColor('#000', '#ffffff', 0.5), 'rgba(128, 128, 128, 1.000)');
}


function testAssPauseAndShortWordOutput() {
  const ass = generateAssSubtitles([group], words, DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS);
  const dialogueLines = ass.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:'));
  assert.equal(dialogueLines.length, 4, 'ASS should emit active/pause segments for the full phrase window');
  assert.match(dialogueLines[0], /0:00:00\.00,0:00:00\.20/);
  assert.match(dialogueLines[1], /0:00:00\.20,0:00:00\.60/);
  assert.match(dialogueLines[2], /0:00:00\.60,0:00:00\.80/);
  assert.match(dialogueLines[3], /0:00:00\.80,0:00:00\.90/);
  assert.match(dialogueLines[0], /\\b1/);
  assert.doesNotMatch(dialogueLines[1], /\\b1/, 'Pause event must not bold/highlight a stale word');
  assert.ok(
    dialogueLines[1].includes('पहला') && dialogueLines[1].includes('दूसरा'),
    'The phrase remains visible during a pause even though ASS override tags separate words'
  );

  const soloStyle: CaptionStyle = { ...DEFAULT_CAPTION_STYLE, captionMode: 'word-by-word' };
  const shortWord: TranscriptWord = { id: 'short', text: 'छोटा', start: 0, end: 0.05 };
  const soloAss = generateAssSubtitles([], [shortWord], soloStyle, DEFAULT_OUTPUT_SETTINGS);
  assert.match(soloAss, /0:00:00\.00,0:00:00\.05/, 'Word event ends at its transcript end, not an arbitrary minimum');
  assert.doesNotMatch(soloAss, /0:00:00\.15/);

  const belowAssPrecision: TranscriptWord = { id: 'tiny', text: 'x', start: 0.001, end: 0.008 };
  const tinyAss = generateAssSubtitles([], [belowAssPrecision], soloStyle, DEFAULT_OUTPUT_SETTINGS);
  assert.equal(tinyAss.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:')).length, 0);
}

function testEveryAnimationCombinationGeneratesValidAss() {
  const animationPresets: AnimationPreset[] = [
    'clean', 'pop', 'kinetic', 'punch', 'minimal', 'words-slide-up',
    'words-rotate-in', 'letters-slide-up', 'letters-slide-down',
  ];
  const highlightAnimations: HighlightAnimation[] = [
    'none', 'scale', 'pop', 'glow', 'background', 'underline', 'color-change',
  ];
  let combinations = 0;

  for (const captionMode of ['phrase-highlight', 'word-by-word'] as const) {
    for (const animationPreset of animationPresets) {
      for (const highlightAnimation of highlightAnimations) {
        const style: CaptionStyle = {
          ...DEFAULT_CAPTION_STYLE,
          captionMode,
          animationPreset,
          highlightAnimation,
        };
        const output = generateAssSubtitles([group], words, style, DEFAULT_OUTPUT_SETTINGS);
        assert.match(output, /\[Events\]/);
        assert.ok(output.includes('Dialogue:'), `${captionMode}/${animationPreset}/${highlightAnimation} emits subtitles`);
        for (const line of output.split(/\r?\n/).filter((entry) => entry.startsWith('Dialogue:'))) {
          const times = line.match(/^Dialogue: \d+,([^,]+),([^,]+)/);
          assert.ok(times, 'Every generated event has start and end fields');
          assert.notEqual(times?.[1], times?.[2], 'No zero-length ASS dialogue event');
        }
        combinations += 1;
      }
    }
  }
  assert.equal(combinations, 126, 'Cover all supported animation/highlight combinations in both caption modes');
}

function countFrameColors(frame: Buffer) {
  let yellow = 0;
  let white = 0;
  for (let index = 0; index + 2 < frame.length; index += 3) {
    const red = frame[index];
    const green = frame[index + 1];
    const blue = frame[index + 2];
    if (red > 155 && green > 100 && blue < 100 && red > blue * 1.8) yellow += 1;
    if (red > 190 && green > 190 && blue > 190 && Math.max(red, green, blue) - Math.min(red, green, blue) < 35) white += 1;
  }
  return { yellow, white };
}

function renderAndInspectFfmpegFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reelspark-caption-sync-'));
  try {
    const assPath = join(directory, 'captions.ass');
    const outputPath = join(directory, 'captions.mp4');
    const latinWords: TranscriptWord[] = [
      { id: 'a', text: 'FIRST', start: 0, end: 0.2 },
      { id: 'b', text: 'SECOND', start: 0.6, end: 0.8 },
    ];
    const latinGroup: CaptionGroup = { id: 'latin', text: 'FIRST SECOND', start: 0, end: 0.9, words: latinWords };
    const fixtureOutput = {
      ...DEFAULT_OUTPUT_SETTINGS,
      preset: 'youtube-landscape' as const,
      width: 640,
      height: 360,
      aspectRatio: '16:9',
      fps: 30,
    };
    writeFileSync(assPath, generateAssSubtitles([latinGroup], latinWords, DEFAULT_CAPTION_STYLE, fixtureOutput), 'utf8');
    const subtitlePath = assPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-vf', `subtitles='${subtitlePath}'`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-shortest', outputPath,
    ], { stdio: 'pipe' });

    const duration = Number(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', outputPath,
    ], { encoding: 'utf8' }).trim());
    assert.ok(duration >= 0.95 && duration <= 1.1, `Rendered fixture duration should be ~1s, got ${duration}s`);

    const getFrameAt = (time: string) => execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-ss', time, '-i', outputPath,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ], { maxBuffer: 5 * 1024 * 1024 });
    const activeFirst = countFrameColors(getFrameAt('0.10'));
    const pause = countFrameColors(getFrameAt('0.40'));
    const activeSecond = countFrameColors(getFrameAt('0.70'));
    assert.ok(activeFirst.yellow > 5, `First spoken word should render highlighted: ${JSON.stringify(activeFirst)}`);
    assert.ok(pause.yellow < activeFirst.yellow, `Pause must not keep the first word highlighted: ${JSON.stringify({ activeFirst, pause })}`);
    assert.ok(activeSecond.yellow > pause.yellow, `Second word should become highlighted at its start: ${JSON.stringify({ activeSecond, pause })}`);

    const streamInfo = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate', '-of', 'csv=p=0', outputPath,
    ], { encoding: 'utf8' });
    assert.match(streamInfo, /video,30\/1/);
    assert.match(streamInfo, /audio/);
    return { duration, activeFirst, pause, activeSecond };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function run() {
  testWordBoundariesAndPauses();
  testAnimationWindows();
  testAssPauseAndShortWordOutput();
  testEveryAnimationCombinationGeneratesValidAss();
  const rendered = renderAndInspectFfmpegFixture();
  console.log('✓ Caption sync QA passed: intervals, pauses, overlap, short words, stagger bounds, ASS, and 126 style combinations.');
  console.log(`✓ FFmpeg fixture rendered 640×360 @30fps with audio; duration ${rendered.duration.toFixed(3)}s; active/pause/active caption frames checked.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
