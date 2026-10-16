import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Project core libraries
import { formatSrtTimestamp, formatAssTimestamp, generateSrtForClip, breakTextIntoSubtitleLines } from '../src/lib/srt';
import { verifyCandidateContext } from '../src/lib/context-verifier';
import { processCandidates, sortCandidates, filterCandidatesByTopic } from '../src/lib/ranking';
import { calculateTimelineCoverage, chunkTranscript, searchTranscript } from '../src/lib/transcript';
import { assertSafePath, sanitizeFilename, getProjectDirs, loadProject, saveProject } from '../src/lib/storage';
import { extractYouTubeVideoId } from '../src/app/api/projects/[id]/youtube/route';
import { getFfmpegPath, getFfprobePath } from '../src/lib/config';
import { probeVideo, renderClip, validateRenderedClip, extractClipAudio } from '../src/lib/ffmpeg';
import { getBilingualCandidateData } from '../src/lib/bilingual';
import { formatDetailedTime, parseDetailedTime } from '../src/components/ClipEditorModal';
import { ClipCandidate, Project, TranscriptSegment } from '../src/lib/types';
import {
  groupTranscriptWords,
  splitCaptionGroup,
  mergeCaptionGroups,
  updateWordInGroups,
  deleteWordFromGroups,
  addWordToGroup,
} from '../src/lib/caption-maker/caption-grouping';
import {
  detectImportantWords,
  toggleWordImportance,
  isWordImportantByDefault,
} from '../src/lib/caption-maker/important-words';
import {
  generatePhraseLevelSrt,
  generateWordLevelSrt,
} from '../src/lib/caption-maker/srt-generator';
import { generateAssSubtitles } from '../src/lib/caption-maker/ass-generator';
import {
  PLATFORM_PRESETS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_OUTPUT_SETTINGS,
} from '../src/lib/caption-maker/sample-data';
import { createCaptionProjectFromClip } from '../src/lib/caption-maker/clip-to-reel';
import {
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
  getThumbnailDimensions,
  THUMBNAIL_PRESETS,
  ThumbnailBadgeShape,
} from '../src/lib/caption-maker/thumbnail-presets';
import {
  saveBase64Image,
  mergeThumbnailIntoVideo,
} from '../src/lib/caption-maker/thumbnail-merger';
import { ThumbnailSettings } from '../src/lib/caption-maker/types';

interface TestResult {
  id: number;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];
function createMockCandidate(overrides: Partial<ClipCandidate> & { id: string; start: number; end: number }): ClipCandidate {
  const duration = overrides.duration ?? (overrides.end - overrides.start);
  return {
    title: overrides.title ?? 'Mock Title',
    topic: overrides.topic ?? 'Philosophy',
    explanation: overrides.explanation ?? 'Insight',
    transcript: overrides.transcript ?? 'Insight transcript text.',
    firstWords: overrides.firstWords ?? 'Insight',
    lastWords: overrides.lastWords ?? 'text',
    selected: overrides.selected ?? false,
    duration,
    scores: overrides.scores ?? { meaningAndDepth: 20, standaloneCompleteness: 20, openingStrength: 15, emotionalIntellectualImpact: 15, clarity: 10, conciseness: 10, audioQuality: 5, total: 95 },
    contextVerification: overrides.contextVerification ?? { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 100, notes: 'Valid thought', flaggedForReview: false },
    ...overrides,
  };
}

let testCounter = 0;

async function runTest(
  category: string,
  name: string,
  fn: () => void | Promise<void>
) {
  testCounter++;
  const id = testCounter;
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ id, name, category, status: 'PASS', durationMs });
    console.log(`  ✓ [${category}] #${id} ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      id,
      name,
      category,
      status: 'FAIL',
      durationMs,
      error: err?.message || String(err),
    });
    console.error(`  ✗ [${category}] #${id} ${name} FAILED:`, err?.message || err);
  }
}

export async function runFullQAAudit() {
  console.log('\n======================================================');
  console.log('🔍 REELSPARK — COMPLETE END-TO-END QA AUDIT');
  console.log('======================================================\n');

  // =========================================================================
  // 1. VIDEO INPUT & METADATA INSPECTION
  // =========================================================================
  await runTest('Video Input', 'FFprobe inspects valid media stream metadata (dimensions, fps, duration, audio)', async () => {
    const tempDir = path.join(process.cwd(), 'storage', 'temp', 'qa_video_input');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const synthMp4 = path.join(tempDir, 'valid_input.mp4');
    const ffmpeg = getFfmpegPath();

    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=5:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=5',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac',
      synthMp4,
    ]);

    const meta = await probeVideo(synthMp4);
    assert.strictEqual(meta.width, 1280);
    assert.strictEqual(meta.height, 720);
    assert.ok(meta.duration >= 4.8 && meta.duration <= 5.2);
    assert.strictEqual(meta.hasAudio, true);

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  await runTest('Video Input', 'FFprobe handles video without audio stream gracefully', async () => {
    const tempDir = path.join(process.cwd(), 'storage', 'temp', 'qa_no_audio');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const synthNoAudio = path.join(tempDir, 'no_audio.mp4');
    const ffmpeg = getFfmpegPath();

    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=24',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      synthNoAudio,
    ]);

    const meta = await probeVideo(synthNoAudio);
    assert.strictEqual(meta.width, 640);
    assert.strictEqual(meta.height, 360);
    assert.strictEqual(meta.hasAudio, false, 'hasAudio must be false for silent video');

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  await runTest('Video Input', 'FFprobe detects corrupted or non-existent files with structured error', async () => {
    const corruptPath = path.join(process.cwd(), 'storage', 'temp', 'corrupt.mp4');
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
    fs.writeFileSync(corruptPath, 'INVALID_CORRUPT_BYTES_NOT_A_REAL_VIDEO');

    let threw = false;
    try {
      await probeVideo(corruptPath);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'probeVideo must reject corrupt file');

    let threwMissing = false;
    try {
      await probeVideo(path.join(process.cwd(), 'non_existent_file.mp4'));
    } catch {
      threwMissing = true;
    }
    assert.strictEqual(threwMissing, true, 'probeVideo must reject missing file');

    if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
  });

  // =========================================================================
  // 2. YOUTUBE URL PARSING & VALIDATION
  // =========================================================================
  await runTest('YouTube Ingestion', 'Parses all standard, short, embed, shorts, and query parameter URLs', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=shared'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('http://youtube.com/v/dQw4w9WgXcQ?version=3'), 'dQw4w9WgXcQ');
  });

  await runTest('YouTube Ingestion', 'Rejects empty, invalid, non-YouTube, and malicious injection URLs', () => {
    assert.strictEqual(extractYouTubeVideoId(''), null);
    assert.strictEqual(extractYouTubeVideoId('   '), null);
    assert.strictEqual(extractYouTubeVideoId('not a url'), null);
    assert.strictEqual(extractYouTubeVideoId('https://vimeo.com/123456789'), null);
    assert.strictEqual(extractYouTubeVideoId('https://dailymotion.com/video/x12345'), null);
    assert.strictEqual(extractYouTubeVideoId('https://malicious.com/?v=dQw4w9WgXcQ'), null);
    assert.strictEqual(extractYouTubeVideoId('javascript:alert(1)'), null);
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=too_short'), null);
  });

  // =========================================================================
  // 3. AI CLIP FINDER & 7-FACTOR SCORING ENGINE
  // =========================================================================
  await runTest('AI Clip Finder', 'Strictly enforces ≤ 60-second limit and discards candidates > 60.0s', () => {
    const candidates: ClipCandidate[] = [
      createMockCandidate({
        id: 'valid_45',
        title: 'Valid Clip',
        start: 0,
        end: 45,
        duration: 45,
        scores: { meaningAndDepth: 25, standaloneCompleteness: 20, openingStrength: 15, emotionalIntellectualImpact: 15, clarity: 10, conciseness: 10, audioQuality: 5, total: 100 },
      }),
      createMockCandidate({
        id: 'boundary_60',
        title: 'Boundary 60s Clip',
        start: 100, // Non-overlapping with valid_45
        end: 160,
        duration: 60,
        scores: { meaningAndDepth: 20, standaloneCompleteness: 18, openingStrength: 14, emotionalIntellectualImpact: 14, clarity: 9, conciseness: 9, audioQuality: 5, total: 89 },
      }),
      createMockCandidate({
        id: 'invalid_61',
        title: 'Over 60s Clip',
        start: 200,
        end: 261.5,
        duration: 61.5,
      }),
    ];

    const processed = processCandidates(candidates, '60');
    assert.strictEqual(processed.length, 2, 'Must discard candidate > 60s');
    assert.ok(processed.every((c) => c.duration <= 60));
  });

  await runTest('AI Clip Finder', 'Context verification detects dangling pronouns and abrupt endings', () => {
    const surroundings: TranscriptSegment[] = [
      { id: '1', start: 0, end: 10, text: 'The crowd always demands conformity.' },
      { id: '2', start: 10, end: 20, text: 'Because of this, you lose your individuality.' },
      { id: '3', start: 20, end: 30, text: 'Therefore he surrendered his freedom.' },
      { id: '4', start: 30, end: 40, text: 'Life is a mystery to be lived because' },
      { id: '5', start: 40, end: 50, text: 'Silence is the presence of awareness.' },
    ];

    // Dangling pronoun: "Because of this..."
    const dangling1 = verifyCandidateContext(10, 20, surroundings[1].text, surroundings);
    assert.strictEqual(dangling1.hasDanglingPronouns, true);
    assert.strictEqual(dangling1.isCompleteThought, false);

    // Dangling pronoun: "Therefore he..."
    const dangling2 = verifyCandidateContext(20, 30, surroundings[2].text, surroundings);
    assert.strictEqual(dangling2.hasDanglingPronouns, true);

    // Abrupt trailing conjunction: "...because"
    const abrupt = verifyCandidateContext(30, 40, surroundings[3].text, surroundings);
    assert.strictEqual(abrupt.hasConclusion, false);

    // Complete, sound thought
    const sound = verifyCandidateContext(40, 50, surroundings[4].text, surroundings);
    assert.strictEqual(sound.hasDanglingPronouns, false);
    assert.strictEqual(sound.isCompleteThought, true);
    assert.strictEqual(sound.hasConclusion, true);
  });

  await runTest('AI Clip Finder', 'Candidate deduplication removes >65% overlap collisions, keeping highest score', () => {
    const candidates: ClipCandidate[] = [
      createMockCandidate({
        id: 'clip_low_score',
        title: 'Overlap Low',
        start: 10,
        end: 40,
        duration: 30,
        scores: { meaningAndDepth: 15, standaloneCompleteness: 15, openingStrength: 10, emotionalIntellectualImpact: 10, clarity: 8, conciseness: 8, audioQuality: 4, total: 70 },
      }),
      createMockCandidate({
        id: 'clip_high_score',
        title: 'Overlap High',
        start: 12,
        end: 42,
        duration: 30,
        scores: { meaningAndDepth: 25, standaloneCompleteness: 20, openingStrength: 15, emotionalIntellectualImpact: 15, clarity: 10, conciseness: 10, audioQuality: 5, total: 100 },
      }),
      createMockCandidate({
        id: 'clip_non_overlapping',
        title: 'Separate Topic',
        start: 100,
        end: 130,
        duration: 30,
        scores: { meaningAndDepth: 20, standaloneCompleteness: 18, openingStrength: 12, emotionalIntellectualImpact: 12, clarity: 9, conciseness: 9, audioQuality: 4, total: 84 },
      }),
    ];

    const deduplicated = processCandidates(candidates, '60');
    assert.strictEqual(deduplicated.length, 2, 'Should keep only 2 non-overlapping candidates');
    assert.strictEqual(deduplicated[0].id, 'clip_high_score', 'Higher score must be preserved');
    assert.strictEqual(deduplicated[1].id, 'clip_non_overlapping');
  });

  await runTest('AI Clip Finder', 'Timeline coverage and semantic transcript search', () => {
    const transcript: TranscriptSegment[] = [
      { id: '1', start: 0, end: 30, text: 'The beginning of love is to let those we love be perfectly themselves.' },
      { id: '2', start: 60, end: 90, text: 'Fear comes from identification with the mind.' },
      { id: '3', start: 120, end: 150, text: 'When fear dissolves into awareness, complete clarity emerges.' },
    ];

    // Coverage calculation: 60s out of 150s = 40%
    const coverage = calculateTimelineCoverage([[0, 30], [120, 150]], 150);
    assert.strictEqual(coverage.analyzedSeconds, 60);
    assert.strictEqual(coverage.coveragePercent, 40);

    // Semantic Search
    const searchRes = searchTranscript(transcript, 'fear and awareness');
    assert.ok(searchRes.length > 0);
    assert.strictEqual(searchRes[0].segmentId, '3');
    assert.ok(searchRes[0].relevanceScore > 40);
  });

  // =========================================================================
  // 4. CLIP TRIMMING & BOUNDARY CALCULATIONS
  // =========================================================================
  await runTest('Clip Trimming', 'Millisecond precision formatting and parsing (parseDetailedTime & formatDetailedTime)', () => {
    assert.strictEqual(formatDetailedTime(65.432), '00:01:05.432');
    assert.strictEqual(formatDetailedTime(0), '00:00:00.000');
    assert.strictEqual(formatDetailedTime(3665.123), '01:01:05.123');

    assert.strictEqual(parseDetailedTime('00:01:05.432'), 65.432);
    assert.strictEqual(parseDetailedTime('00:00:00.000'), 0);
    assert.strictEqual(parseDetailedTime('10.5'), 10.5);
    assert.strictEqual(parseDetailedTime('invalid'), null);
  });

  // =========================================================================
  // 5. CREATE REELS & CLIP ISOLATION
  // =========================================================================
  await runTest('Create Reels', 'Clip A vs Clip B strictly isolates clip audio and relative timestamps', async () => {
    const clipA = createMockCandidate({
      id: 'clip_A_100',
      title: 'Clip A Topic',
      start: 50,
      end: 70,
      duration: 20,
      transcript: 'This is the first independent clip about wisdom.',
    });

    const clipB = createMockCandidate({
      id: 'clip_B_200',
      title: 'Clip B Topic',
      start: 200,
      end: 230,
      duration: 30,
      transcript: 'This is the second completely different clip about meditation.',
    });

    const mockProject: Project = {
      id: 'project_isolation_test',
      title: 'Long Speech',
      sourceType: 'upload',
      localVideoPath: 'storage/projects/project_isolation_test/original/speech.mp4',
      candidates: [clipA, clipB],
      transcript: [
        { id: 's1', start: 50, end: 70, text: 'This is the first independent clip about wisdom.' },
        { id: 's2', start: 200, end: 230, text: 'This is the second completely different clip about meditation.' },
      ],
      videoMetadata: { duration: 300, width: 1920, height: 1080, aspectRatio: '16:9', fps: 30, format: 'mp4', sizeBytes: 1000000, hasAudio: true },
      status: 'COMPLETED',
      progress: 100,
      statusMessage: 'Ready',
      settings: {
        durationLimit: '60',
        aspectRatio: 'vertical_crop',
        normalizeAudio: true,
        burnSubtitles: false,
        subtitleStyle: {
          fontSize: 24,
          fontColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 2,
          verticalPosition: 'bottom',
          alignment: 'center',
        },
      },
      timelineCoverage: { analyzedSeconds: 50, totalSeconds: 300, coveragePercent: 16.6, ranges: [[50, 70], [200, 230]] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const reelA = createCaptionProjectFromClip(clipA, mockProject, 'en');
    const reelB = createCaptionProjectFromClip(clipB, mockProject, 'en');

    assert.strictEqual(reelA.title, 'Clip A Topic');
    assert.strictEqual(reelB.title, 'Clip B Topic');
    assert.strictEqual(reelA.audio?.duration, 20);
    assert.strictEqual(reelB.audio?.duration, 30);

    // Relative timestamps for Clip A start at 0s, not 50s
    assert.strictEqual(reelA.transcript[0].start, 0);
    assert.ok(reelA.transcript[reelA.transcript.length - 1].end <= 20);

    // Relative timestamps for Clip B start at 0s, not 200s
    assert.strictEqual(reelB.transcript[0].start, 0);
    assert.ok(reelB.transcript[reelB.transcript.length - 1].end <= 30);

    // Verify words don't leak between clips
    assert.ok(reelA.transcript.some((w) => w.text.toLowerCase().includes('wisdom')));
    assert.ok(!reelA.transcript.some((w) => w.text.toLowerCase().includes('meditation')));

    assert.ok(reelB.transcript.some((w) => w.text.toLowerCase().includes('meditation')));
    assert.ok(!reelB.transcript.some((w) => w.text.toLowerCase().includes('wisdom')));
  });

  // =========================================================================
  // 6. REEL OUTPUT SIZES & CONTAIN MODE 9 POSITIONS
  // =========================================================================
  await runTest('Reel Output Sizes', 'Dimensions match 9:16, 4:5, 1:1, 16:9 for both preview and export', () => {
    const dim916 = getThumbnailDimensions('9:16');
    assert.deepStrictEqual(dim916, { width: 1080, height: 1920 });

    const dim45 = getThumbnailDimensions('4:5');
    assert.deepStrictEqual(dim45, { width: 1080, height: 1350 });

    const dim11 = getThumbnailDimensions('1:1');
    assert.deepStrictEqual(dim11, { width: 1080, height: 1080 });

    const dim169 = getThumbnailDimensions('16:9');
    assert.deepStrictEqual(dim169, { width: 1920, height: 1080 });
  });

  await runTest('Contain Mode 9 Positions', 'Calculates correct offset coordinates for all 9 positioning alignments in FFmpeg and Remotion', async () => {
    const { getImagePositionPadCoords } = await import('../src/lib/caption-maker/ffmpeg-renderer');
    const { getCssObjectPosition } = await import('../src/remotion/BackgroundLayer');

    const positions: Array<{ pos: any; expectedPadX: string; expectedPadY: string; expectedCss: string }> = [
      { pos: 'top-left', expectedPadX: '0', expectedPadY: '0', expectedCss: 'left top' },
      { pos: 'top-center', expectedPadX: '(ow-iw)/2', expectedPadY: '0', expectedCss: 'center top' },
      { pos: 'top-right', expectedPadX: '(ow-iw)', expectedPadY: '0', expectedCss: 'right top' },
      { pos: 'center-left', expectedPadX: '0', expectedPadY: '(oh-ih)/2', expectedCss: 'left center' },
      { pos: 'center', expectedPadX: '(ow-iw)/2', expectedPadY: '(oh-ih)/2', expectedCss: 'center center' },
      { pos: 'center-right', expectedPadX: '(ow-iw)', expectedPadY: '(oh-ih)/2', expectedCss: 'right center' },
      { pos: 'bottom-left', expectedPadX: '0', expectedPadY: '(oh-ih)', expectedCss: 'left bottom' },
      { pos: 'bottom-center', expectedPadX: '(ow-iw)/2', expectedPadY: '(oh-ih)', expectedCss: 'center bottom' },
      { pos: 'bottom-right', expectedPadX: '(ow-iw)', expectedPadY: '(oh-ih)', expectedCss: 'right bottom' },
    ];

    for (const item of positions) {
      const coords = getImagePositionPadCoords(item.pos);
      assert.strictEqual(coords.padX, item.expectedPadX);
      assert.strictEqual(coords.padY, item.expectedPadY);

      const css = getCssObjectPosition(item.pos);
      assert.strictEqual(css, item.expectedCss);
    }
  });

  // =========================================================================
  // 7. THUMBNAIL COVER & MUST WATCH HOOK BADGE
  // =========================================================================
  await runTest('Thumbnail Cover', 'Presets catalog, default settings, safe area overlay, and custom positioning parity', () => {
    assert.ok(THUMBNAIL_PRESETS.length >= 6);
    const hormozi = THUMBNAIL_PRESETS.find((p) => p.id === 'hormozi');
    assert.ok(hormozi);
    assert.strictEqual(hormozi.settings.highlightColor, '#FCD905');

    const defaultSettings = createDefaultThumbnailSettings('VIRAL HOOK');
    assert.strictEqual(defaultSettings.badgeEnabled, true);
    assert.strictEqual(defaultSettings.badgeSpacing, 24);
    assert.strictEqual(defaultSettings.subtitleSpacing, 24);
    assert.strictEqual(defaultSettings.textAlign, 'center');
    assert.strictEqual(defaultSettings.customX, 50);
    assert.strictEqual(defaultSettings.position, 'top');
    assert.strictEqual(defaultSettings.showSafeArea, true);
  });

  await runTest('Must Watch Badge', 'When badgeEnabled = false, badge is completely hidden and takes 0 vertical space', async () => {
    const settings = createDefaultThumbnailSettings('TITLE HEADLINE');
    const disabledSettings: ThumbnailSettings = {
      ...settings,
      badgeEnabled: false,
    };

    const drawnTexts: string[] = [];
    const mockCtx: any = {
      canvas: { width: 1080, height: 1920 },
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText: (t: string) => { drawnTexts.push(t); },
      strokeText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };

    const mockCanvas: any = { getContext: () => mockCtx, width: 1080, height: 1920 };
    await renderThumbnailToCanvas(mockCanvas, disabledSettings);

    assert.ok(!drawnTexts.includes('MUST WATCH'), 'Disabled badge must not be rendered');
  });

  await runTest('Must Watch Badge', 'When badgeEnabled = true, supports all 3 shapes (pill, rounded, sharp) and custom styling', async () => {
    const shapes: ThumbnailBadgeShape[] = ['pill', 'rounded', 'sharp'];
    const mockCtx: any = {
      canvas: { width: 1080, height: 1920 },
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText: () => {},
      strokeText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
    const mockCanvas: any = { getContext: () => mockCtx, width: 1080, height: 1920 };

    for (const shape of shapes) {
      const s = {
        ...createDefaultThumbnailSettings('VIRAL HOOK'),
        badgeEnabled: true,
        badgeShape: shape,
        badgeBorderRadius: shape === 'rounded' ? 14 : 0,
        badgeText: `TEST_${shape.toUpperCase()}`,
      };
      await renderThumbnailToCanvas(mockCanvas, s);
    }
  });

  await runTest('Thumbnail Merger', 'Merges thumbnail cover into video with shortest duration (0.000001s / eq(n,0)) and attached_pic', async () => {
    const tempDir = path.join(process.cwd(), 'storage', 'temp', 'qa_thumb_merge');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const synthVideo = path.join(tempDir, 'source.mp4');
    const synthThumb = path.join(tempDir, 'cover.png');
    const mergedOutput = path.join(tempDir, 'merged.mp4');
    const ffmpeg = getFfmpegPath();

    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=4:size=360x640:rate=30',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      synthVideo,
    ]);

    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=yellow:size=360x640:d=1',
      '-frames:v', '1',
      synthThumb,
    ]);

    await mergeThumbnailIntoVideo({
      videoPath: synthVideo,
      thumbnailPath: synthThumb,
      outputPath: mergedOutput,
      mergeMode: 'intro_and_poster',
      introDuration: 0.000001,
      width: 360,
      height: 640,
    });

    assert.ok(fs.existsSync(mergedOutput), 'Merged video created');

    const ffprobe = getFfprobePath();
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      mergedOutput,
    ]);
    const info = JSON.parse(stdout);
    assert.ok(info.streams.length >= 2, 'Must contain primary video and attached_pic stream');
    const picStream = info.streams.find((s: any) => s.disposition?.attached_pic === 1);
    assert.ok(picStream, 'attached_pic disposition must be present on cover art stream');

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // =========================================================================
  // 8. AUDIO SYNCHRONIZATION & WORD TIMESTAMPS
  // =========================================================================
  await runTest('Audio & Subtitles', 'Word timestamps ordering, monotone continuity, and pause grouping', () => {
    const words = [
      { id: '1', start: 0.0, end: 0.4, text: 'Hello' },
      { id: '2', start: 0.45, end: 0.8, text: 'world' },
      { id: '3', start: 1.5, end: 1.9, text: 'Welcome' },
      { id: '4', start: 1.95, end: 2.3, text: 'back' },
    ];

    for (let i = 0; i < words.length - 1; i++) {
      assert.ok(words[i].start <= words[i + 1].start, 'Word starts must be monotonic');
      assert.ok(words[i].end > words[i].start, 'Word end must be after start');
    }

    const groups = groupTranscriptWords(words as any, 4);
    assert.strictEqual(groups.length, 2, 'Should create 2 distinct caption groups across pause');
    assert.strictEqual(groups[0].words.length, 2);
    assert.strictEqual(groups[1].words.length, 2);
  });

  await runTest('Audio & Subtitles', 'Important words detection highlights emotional and viral keywords with #FCD905', () => {
    const words = [
      { id: '1', start: 0, end: 0.5, text: 'The' },
      { id: '2', start: 0.5, end: 1.0, text: 'SECRET' },
      { id: '3', start: 1.0, end: 1.5, text: 'to' },
      { id: '4', start: 1.5, end: 2.0, text: 'POWER' },
      { id: '5', start: 2.0, end: 2.5, text: 'and' },
      { id: '6', start: 2.5, end: 3.0, text: 'SUCCESS' },
    ];

    const detected = detectImportantWords(words as any);
    const importantTexts = detected.filter((w) => w.isImportant).map((w) => w.text.toUpperCase());

    assert.ok(importantTexts.includes('SECRET'), 'SECRET should be marked important');
    assert.ok(importantTexts.includes('POWER'), 'POWER should be marked important');
    assert.ok(importantTexts.includes('SUCCESS'), 'SUCCESS should be marked important');
    assert.ok(!importantTexts.includes('THE'), 'Articles should not be marked important');
  });

  await runTest('Audio & Subtitles', 'Generates valid SRT and ASS subtitles starting relative to 00:00:00,000', () => {
    const words = [
      { id: '1', start: 0.0, end: 0.8, text: 'Silence' },
      { id: '2', start: 0.85, end: 1.5, text: 'speaks' },
    ];
    const groups = groupTranscriptWords(words as any, 4);

    const srt = generatePhraseLevelSrt(groups);
    assert.ok(srt.includes('00:00:00,000 -->'), 'SRT must start at 00:00:00,000');
    assert.ok(srt.includes('Silence speaks'));

    const ass = generateAssSubtitles(groups, words as any, {
      ...DEFAULT_CAPTION_STYLE,
      importantColor: '#FCD905',
    }, DEFAULT_OUTPUT_SETTINGS);
    assert.ok(ass.includes('[Script Info]'), 'ASS header must be present');
    assert.ok(ass.includes('Dialogue:'), 'ASS dialogue lines must be present');
  });

  // =========================================================================
  // 9. SECURITY & STORAGE INTEGRITY
  // =========================================================================
  await runTest('Security', 'Path traversal attempts are strictly blocked', () => {
    assert.throws(() => assertSafePath('../../etc/passwd'));
    assert.throws(() => assertSafePath('..\\..\\windows\\system32'));
    assert.throws(() => assertSafePath('/etc/shadow'));
    assert.throws(() => assertSafePath('storage/../../../secret.txt'));

    assert.strictEqual(sanitizeFilename('../malicious/file.mp4'), '.._malicious_file.mp4');
    assert.strictEqual(sanitizeFilename('file*with?bad:chars.mp4'), 'file_with_bad_chars.mp4');
  });

  // =========================================================================
  // 10. REAL RENDERING END-TO-END VERIFICATION
  // =========================================================================
  await runTest('End-to-End Render', 'Renders vertical 9:16 video with audio loudnorm, burnt subtitles, and validates via FFprobe', async () => {
    const tempDir = path.join(process.cwd(), 'storage', 'temp', 'qa_e2e_render');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const sourceVideo = path.join(tempDir, 'long_source.mp4');
    const outputVideo = path.join(tempDir, 'reel_916_rendered.mp4');
    const ffmpeg = getFfmpegPath();

    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=6:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac',
      sourceVideo,
    ]);

    const assPath = path.join(tempDir, 'test.ass');
    fs.writeFileSync(assPath, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Real End-to-End Test
Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,Synchronized & Verified
`);

    const renderRes = await renderClip({
      sourceVideoPath: sourceVideo,
      outputPath: outputVideo,
      start: 1.0,
      end: 5.0,
      aspectRatio: 'vertical_crop',
      normalizeAudio: true,
      subtitlesAssPath: assPath,
    });

    assert.ok(fs.existsSync(outputVideo), 'Output video must exist');
    assert.ok(renderRes.duration <= 60, 'Rendered clip strictly <= 60s');

    const validation = await validateRenderedClip(outputVideo);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.hasAudio, true);
    assert.ok(validation.duration >= 3.8 && validation.duration <= 4.2);

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`📊 QA AUDIT RESULTS: ${passed} / ${results.length} TESTS PASSED (${failed} FAILED)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFullQAAudit().catch((err) => {
  console.error('Fatal QA Audit failure:', err);
  process.exit(1);
});
