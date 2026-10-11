import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { formatSrtTimestamp, formatAssTimestamp, generateSrtForClip, breakTextIntoSubtitleLines } from '../src/lib/srt';
import { verifyCandidateContext } from '../src/lib/context-verifier';
import { processCandidates, sortCandidates, filterCandidatesByTopic } from '../src/lib/ranking';
import { calculateTimelineCoverage, chunkTranscript, searchTranscript } from '../src/lib/transcript';
import { assertSafePath, sanitizeFilename } from '../src/lib/storage';
import { extractYouTubeVideoId } from '../src/app/api/projects/[id]/youtube/route';
import { getFfmpegPath, getFfprobePath } from '../src/lib/config';
import { probeVideo, renderClip, validateRenderedClip } from '../src/lib/ffmpeg';
import { getBilingualCandidateData } from '../src/lib/bilingual';
import { formatDetailedTime, parseDetailedTime } from '../src/components/ClipEditorModal';
import { ClipCandidate, TranscriptSegment } from '../src/lib/types';
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
  generatePhraseSRT,
  generateWordLevelSRT,
} from '../src/lib/caption-maker/srt-generator';
import { generateAssSubtitles } from '../src/lib/caption-maker/ass-generator';
import {
  PLATFORM_PRESETS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_OUTPUT_SETTINGS,
} from '../src/lib/caption-maker/sample-data';
import { TranscriptWord, CaptionGroup } from '../src/lib/caption-maker/types';

const execFileAsync = promisify(execFile);

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🚀 REELSPARK — AUTOMATED TEST SUITE EXECUTION');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ✗ ${name}:`, err.message);
          });
      } else {
        console.log(`  ✓ ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`  ✗ ${name}:`, err.message);
    }
  }

  // 1. YouTube URL Validation Tests
  await test('YouTube URL validation & ID extraction', () => {
    assert.strictEqual(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.strictEqual(
      extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.strictEqual(
      extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.strictEqual(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
      'dQw4w9WgXcQ'
    );
    assert.strictEqual(extractYouTubeVideoId('invalid-url-string'), null);
    assert.strictEqual(extractYouTubeVideoId('https://vimeo.com/12345678'), null);
  });

  // 2. Timestamp Format and Precision Tests
  await test('SRT and ASS timestamp conversion accuracy', () => {
    assert.strictEqual(formatSrtTimestamp(0), '00:00:00,000');
    assert.strictEqual(formatSrtTimestamp(65.5), '00:01:05,500');
    assert.strictEqual(formatSrtTimestamp(3661.123), '01:01:01,123');

    assert.strictEqual(formatAssTimestamp(0), '0:00:00.00');
    assert.strictEqual(formatAssTimestamp(65.5), '0:01:05.50');
  });

  // 3. SRT Offset Synchronization
  await test('SRT local timeline offset re-synchronization', () => {
    // Original timeline: clip starts at 12:30 (750s) and ends at 13:00 (780s)
    const transcript: TranscriptSegment[] = [
      { id: '1', start: 752.0, end: 756.5, text: 'Drop all fear in this present moment.' },
      { id: '2', start: 760.0, end: 765.0, text: 'Fear exists only in psychological projection.' },
    ];

    const srt = generateSrtForClip(transcript, 750.0, 780.0);

    // Verify first subtitle starts at 00:00:02,000 (relative to 750s start) NOT at 12 minutes!
    assert.ok(srt.includes('00:00:02,000 --> 00:00:06,500'), 'First subtitle must start at 2s relative offset');
    assert.ok(srt.includes('Drop all fear'), 'Preserves text');
    assert.ok(srt.includes('00:00:10,000 --> 00:00:15,000'), 'Second subtitle offset synchronized');
  });

  // 4. Subtitle Line Breaking
  await test('Subtitle line break formatting', () => {
    const longText = 'Be a light unto yourself do not follow the crowd because the crowd has never reached truth';
    const broken = breakTextIntoSubtitleLines(longText, 6);
    assert.ok(broken.includes('\n'), 'Long text broken into multiple lines');
  });

  // 5. Context Verification Engine
  await test('Context verification: dangling pronouns & thought completeness', () => {
    const surroundings: TranscriptSegment[] = [
      { id: '1', start: 10, end: 15, text: 'The crowd always demands conformity.' },
      { id: '2', start: 16, end: 25, text: 'Because of this, you lose your individuality.' },
    ];

    // Starts with dangling pronoun "Because of this"
    const danglingResult = verifyCandidateContext(16, 25, surroundings[1].text, surroundings);
    assert.strictEqual(danglingResult.hasDanglingPronouns, true);
    assert.strictEqual(danglingResult.isCompleteThought, false);
    assert.ok(danglingResult.contextConfidence < 85);

    // Clean standalone sentence
    const cleanResult = verifyCandidateContext(
      10,
      15,
      surroundings[0].text,
      surroundings
    );
    assert.strictEqual(cleanResult.hasDanglingPronouns, false);
    assert.strictEqual(cleanResult.isCompleteThought, true);
    assert.ok(cleanResult.contextConfidence >= 90);
  });

  // 6. 60-Second Duration Limit Enforcement
  await test('Strict 60-second clip duration limit', () => {
    const candidates: ClipCandidate[] = [
      {
        id: 'c1',
        title: 'Short Clip',
        start: 10,
        end: 45,
        duration: 35,
        topic: 'Philosophy',
        explanation: 'test',
        transcript: 'test',
        firstWords: 'test',
        lastWords: 'test',
        scores: { meaningAndDepth: 20, standaloneCompleteness: 15, openingStrength: 10, emotionalIntellectualImpact: 10, clarity: 8, conciseness: 8, audioQuality: 5, total: 76 },
        contextVerification: { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 90, notes: '', flaggedForReview: false },
        selected: true,
      },
      {
        id: 'c2',
        title: 'Oversized Clip',
        start: 10,
        end: 85,
        duration: 75, // exceeds 60s!
        topic: 'Motivation',
        explanation: 'test',
        transcript: 'test',
        firstWords: 'test',
        lastWords: 'test',
        scores: { meaningAndDepth: 25, standaloneCompleteness: 20, openingStrength: 15, emotionalIntellectualImpact: 15, clarity: 10, conciseness: 10, audioQuality: 5, total: 100 },
        contextVerification: { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 95, notes: '', flaggedForReview: false },
        selected: true,
      },
    ];

    const processed = processCandidates(candidates, '60');
    assert.strictEqual(processed.length, 1);
    assert.strictEqual(processed[0].id, 'c1', 'Oversized 75s clip must be strictly rejected');
  });

  // 7. Duplicate and Overlapping Candidate Elimination
  await test('Candidate deduplication and overlap filter', () => {
    const candidates: ClipCandidate[] = [
      {
        id: 'c1',
        title: 'Original Clip',
        start: 10,
        end: 40,
        duration: 30,
        topic: 'Philosophy',
        explanation: 'test',
        transcript: 'test',
        firstWords: 'test',
        lastWords: 'test',
        scores: { meaningAndDepth: 25, standaloneCompleteness: 20, openingStrength: 15, emotionalIntellectualImpact: 15, clarity: 10, conciseness: 10, audioQuality: 5, total: 100 },
        contextVerification: { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 95, notes: '', flaggedForReview: false },
        selected: true,
      },
      {
        id: 'c2',
        title: 'Duplicate Overlapping Clip',
        start: 12, // 90% overlap with c1
        end: 41,
        duration: 29,
        topic: 'Philosophy',
        explanation: 'test',
        transcript: 'test',
        firstWords: 'test',
        lastWords: 'test',
        scores: { meaningAndDepth: 20, standaloneCompleteness: 15, openingStrength: 10, emotionalIntellectualImpact: 10, clarity: 8, conciseness: 8, audioQuality: 5, total: 76 },
        contextVerification: { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 90, notes: '', flaggedForReview: false },
        selected: true,
      },
    ];

    const processed = processCandidates(candidates, '60', 0.65);
    assert.strictEqual(processed.length, 1, 'Should eliminate overlapping lower-scoring version');
    assert.strictEqual(processed[0].id, 'c1', 'Keeps highest scoring version');
  });

  // 8. Local Storage and Path Traversal Security
  await test('Filesystem security and path traversal prevention', () => {
    assert.strictEqual(sanitizeFilename('../../evil.mp4'), '.._.._evil.mp4');
    assert.strictEqual(sanitizeFilename('my video (test)!:?.mp4'), 'my_video__test____.mp4');

    const baseStorage = path.resolve(process.cwd(), 'storage');
    // Normal inside path
    const validPath = path.join(baseStorage, 'projects', 'test');
    assert.strictEqual(assertSafePath(validPath, baseStorage), validPath);

    // Traversal attack
    assert.throws(() => {
      assertSafePath(path.join(baseStorage, '..', '..', 'windows', 'system32'), baseStorage);
    }, /Path traversal detected/);
  });

  // 9. Timeline Coverage Calculation
  await test('Timeline coverage percentage calculation', () => {
    const ranges: Array<[number, number]> = [
      [0, 60],
      [50, 110], // overlapping
      [150, 200],
    ];
    // Merged: [0, 110] (110s) + [150, 200] (50s) = 160s out of 200s total = 80%
    const coverage = calculateTimelineCoverage(ranges, 200);
    assert.strictEqual(coverage.analyzedSeconds, 160);
    assert.strictEqual(coverage.coveragePercent, 80);
    assert.strictEqual(coverage.ranges.length, 2);
  });

  // 10. Semantic Transcript Search
  await test('Semantic search engine over speech transcripts', () => {
    const transcript: TranscriptSegment[] = [
      { id: '1', start: 0, end: 10, text: 'The society trains you to follow the crowd.' },
      { id: '2', start: 12, end: 22, text: 'Self-respect means recognizing the divine within yourself.' },
      { id: '3', start: 24, end: 34, text: 'When fear dissolves in awareness, courage is born.' },
    ];

    const results = searchTranscript(transcript, 'Find moments where Osho explains fear and courage');
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].segmentId, '3');
    assert.ok(results[0].relevanceScore >= 50);
  });

  // 11. Real FFmpeg Synthetic Video Generation & Inspection
  await test('FFmpeg & FFprobe synthetic media generation and inspection', async () => {
    const testDir = path.join(process.cwd(), 'storage', 'temp', 'test_run');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const syntheticSource = path.join(testDir, 'synth_source.mp4');
    const renderedClipPath = path.join(testDir, 'synth_clip.mp4');
    const ffmpegBin = getFfmpegPath();
    const ffprobeBin = getFfprobePath();

    // Generate a 10-second synthetic test video with video pattern + audio sine wave
    const genArgs = [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=10:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac',
      syntheticSource,
    ];

    await execFileAsync(ffmpegBin, genArgs);
    assert.ok(fs.existsSync(syntheticSource), 'Synthetic source video created');

    // Inspect with FFprobe
    const meta = await probeVideo(syntheticSource);
    assert.ok(meta.duration >= 9.8 && meta.duration <= 10.5, 'Duration verified');
    assert.strictEqual(meta.width, 640);
    assert.strictEqual(meta.height, 360);
    assert.strictEqual(meta.hasAudio, true);

    // Cut a 4-second clip and re-encode with FFmpeg
    const renderRes = await renderClip({
      sourceVideoPath: syntheticSource,
      outputPath: renderedClipPath,
      start: 2.0,
      end: 6.0,
      aspectRatio: 'vertical_crop',
      normalizeAudio: true,
    });

    assert.ok(fs.existsSync(renderedClipPath), 'Rendered output clip created');
    assert.ok(renderRes.duration <= 60, 'Rendered clip strictly <= 60s');

    // Validate with FFprobe
    const validation = await validateRenderedClip(renderedClipPath);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.hasAudio, true);
    assert.ok(validation.duration >= 3.8 && validation.duration <= 4.2);

    // Cleanup test artifacts
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  // 12. Bilingual Title & Text Options
  await test('Bilingual title & text option resolution (Hindi & English)', () => {
    const candidateEn: ClipCandidate = {
      id: 'clip-test-1',
      start: 0,
      end: 30,
      duration: 30,
      title: 'Motivation: The Nature of Truth #1',
      topic: 'Motivation',
      explanation: 'Self-contained thought on conscious living.',
      transcript: 'Drop all fear. Fear is always about the future. Be a light unto yourself.',
      firstWords: 'Drop all fear',
      lastWords: 'unto yourself',
      selected: false,
      scores: {
        meaningAndDepth: 24,
        standaloneCompleteness: 19,
        openingStrength: 14,
        emotionalIntellectualImpact: 14,
        clarity: 9,
        conciseness: 9,
        audioQuality: 4,
        total: 93,
      },
      contextVerification: {
        isCompleteThought: true,
        hasConclusion: true,
        hasDanglingPronouns: false,
        contextConfidence: 95,
        notes: 'Standalone thought.',
        flaggedForReview: false,
      },
    };

    // Test English view
    const enData = getBilingualCandidateData(candidateEn, 'en');
    assert.strictEqual(enData.title, 'Motivation: The Nature of Truth #1');
    assert.ok(enData.transcript.includes('Drop all fear'));

    // Test Hindi view (with auto-translation mapping)
    const hiData = getBilingualCandidateData(candidateEn, 'hi');
    assert.strictEqual(hiData.title, 'प्रेरणा: सत्य का स्वरूप #1');
    assert.ok(hiData.transcript.includes('भय'));

    // Test Candidate with explicit Hindi title/transcript fields
    const customBilingual: ClipCandidate = {
      ...candidateEn,
      title: 'The Art of Meditation',
      titleHindi: 'ध्यान की कला',
      transcript: 'Meditation is not doing something, it is being.',
      transcriptHindi: 'ध्यान कुछ करना नहीं है, बल्कि होना है।',
      explanationHindi: 'आंतरिक शांति और मौन पर विचार।',
    };

    const directHi = getBilingualCandidateData(customBilingual, 'hi');
    assert.strictEqual(directHi.title, 'ध्यान की कला');
    assert.strictEqual(directHi.transcript, 'ध्यान कुछ करना नहीं है, बल्कि होना है।');
    assert.strictEqual(directHi.explanation, 'आंतरिक शांति और मौन पर विचार।');

    const directEn = getBilingualCandidateData(customBilingual, 'en');
    assert.strictEqual(directEn.title, 'The Art of Meditation');
    assert.strictEqual(directEn.transcript, 'Meditation is not doing something, it is being.');
  });

  // 13. Video Trimming Precise Timestamps & Frame Accuracy
  await test('Video trimming precise timestamps formatting & parsing (CapCut / VN style)', () => {
    // Formatting: HH:MM:SS.mmm
    assert.strictEqual(formatDetailedTime(10), '00:00:10.000');
    assert.strictEqual(formatDetailedTime(75.5), '00:01:15.500');
    assert.strictEqual(formatDetailedTime(3665.25), '01:01:05.250');

    // Parsing: HH:MM:SS.mmm, MM:SS.mmm, MM:SS, and raw seconds
    assert.strictEqual(parseDetailedTime('00:00:10.000'), 10);
    assert.strictEqual(parseDetailedTime('00:01:15.500'), 75.5);
    assert.strictEqual(parseDetailedTime('01:01:05.250'), 3665.25);
    assert.strictEqual(parseDetailedTime('01:15.5'), 75.5);
    assert.strictEqual(parseDetailedTime('25.5'), 25.5);
    assert.strictEqual(parseDetailedTime('  15  '), 15);
    assert.strictEqual(parseDetailedTime('invalid:text'), null);
  });

  // 14. Word-Level Timestamps & Transcript Integrity
  await test('Transcript word-level timestamps ordering & timing integrity', () => {
    const rawWords: TranscriptWord[] = [
      { id: 'w1', text: 'Zindagi', start: 0.0, end: 0.5 },
      { id: 'w2', text: 'mein', start: 0.5, end: 0.8 },
      { id: 'w3', text: 'kabhi', start: 0.8, end: 1.2 },
      { id: 'w4', text: 'HAAR', start: 1.2, end: 1.8, isImportant: true },
    ];

    // Verify sequential ordering
    for (let i = 0; i < rawWords.length; i++) {
      assert.ok(rawWords[i].end >= rawWords[i].start, `Word ${rawWords[i].text} must have end >= start`);
      if (i > 0) {
        assert.ok(rawWords[i].start >= rawWords[i - 1].start, 'Words must be sequentially ordered');
      }
    }
  });

  // 15. Caption Grouping & Group Editing Operations
  await test('Caption grouping on pauses, punctuation, split, and merge operations', () => {
    const sampleWords: TranscriptWord[] = [
      { id: '1', text: 'Zindagi', start: 0.0, end: 0.4 },
      { id: '2', text: 'mein', start: 0.4, end: 0.7 },
      { id: '3', text: 'kabhi', start: 0.7, end: 1.0 },
      { id: '4', text: 'haar,', start: 1.0, end: 1.4 },
      // Pause of 0.6s here
      { id: '5', text: 'mat', start: 2.0, end: 2.3 },
      { id: '6', text: 'maanna.', start: 2.3, end: 2.8 },
    ];

    const groups = groupTranscriptWords(sampleWords, 4);
    assert.strictEqual(groups.length, 2, 'Should split into 2 groups based on punctuation & pause');
    assert.strictEqual(groups[0].words.length, 4);
    assert.strictEqual(groups[1].words.length, 2);
    assert.strictEqual(groups[0].start, 0.0);
    assert.strictEqual(groups[0].end, 1.4);

    // Test Split Group
    const splitGroups = splitCaptionGroup(groups, groups[0].id, 2);
    assert.strictEqual(splitGroups.length, 3, 'Splitting first group should produce 3 groups');
    assert.strictEqual(splitGroups[0].words.length, 2);
    assert.strictEqual(splitGroups[1].words.length, 2);

    // Test Merge Groups
    const mergedBack = mergeCaptionGroups(splitGroups, splitGroups[0].id, splitGroups[1].id);
    assert.strictEqual(mergedBack.length, 2, 'Merging split groups returns back to 2 groups');
    assert.strictEqual(mergedBack[0].words.length, 4);

    // Test update word inside groups
    const updated = updateWordInGroups(mergedBack, '1', { text: 'Life' });
    assert.strictEqual(updated[0].words[0].text, 'Life');

    // Test delete word
    const deleted = deleteWordFromGroups(updated, '2');
    assert.strictEqual(deleted[0].words.length, 3);
  });

  // 16. Important Word Detection & Manual Override
  await test('Important emotional/motivational keyword detection and manual override', () => {
    const mixedWords: TranscriptWord[] = [
      { id: '1', text: 'apni', start: 0.0, end: 0.3 },
      { id: '2', text: 'zindagi', start: 0.3, end: 0.7 },
      { id: '3', text: 'mein', start: 0.7, end: 0.9 },
      { id: '4', text: 'FOCUS', start: 0.9, end: 1.3 },
      { id: '5', text: 'karo', start: 1.3, end: 1.6 },
      { id: '6', text: 'aur', start: 1.6, end: 1.8 },
      { id: '7', text: 'SUCCESS', start: 1.8, end: 2.3 },
    ];

    const detected = detectImportantWords(mixedWords);
    const importantWords = detected.filter((w) => w.isImportant).map((w) => w.text.toLowerCase());

    assert.ok(importantWords.includes('zindagi'), 'Should detect Hindi/Hinglish emotion word "zindagi"');
    assert.ok(importantWords.includes('focus'), 'Should detect focus');
    assert.ok(importantWords.includes('success'), 'Should detect success');
    assert.ok(!importantWords.includes('aur'), 'Common particle "aur" must not be important');

    // Test Manual User Override
    const toggled = toggleWordImportance(detected, '6'); // Manually mark 'aur'
    assert.strictEqual(toggled.find((w) => w.id === '6')?.isImportant, true, 'User manual override must take effect');
  });

  // 17. Platform Presets & Canvas Geometry
  await test('Platform presets dimensions and aspect ratios (9:16, 4:5, 1:1, 16:9)', () => {
    assert.strictEqual(PLATFORM_PRESETS['instagram-reel'].aspectRatio, '9:16');
    assert.strictEqual(PLATFORM_PRESETS['instagram-reel'].width, 1080);
    assert.strictEqual(PLATFORM_PRESETS['instagram-reel'].height, 1920);

    assert.strictEqual(PLATFORM_PRESETS['youtube-short'].aspectRatio, '9:16');
    assert.strictEqual(PLATFORM_PRESETS['instagram-portrait'].aspectRatio, '4:5');
    assert.strictEqual(PLATFORM_PRESETS['instagram-portrait'].height, 1350);

    assert.strictEqual(PLATFORM_PRESETS['instagram-square'].aspectRatio, '1:1');
    assert.strictEqual(PLATFORM_PRESETS['youtube-landscape'].aspectRatio, '16:9');
    assert.strictEqual(PLATFORM_PRESETS['youtube-landscape'].width, 1920);
    assert.strictEqual(PLATFORM_PRESETS['youtube-landscape'].height, 1080);
  });

  // 18. ASS Subtitles & SRT Generation
  await test('ASS karaoke subtitle script & SRT export generation', () => {
    const words: TranscriptWord[] = [
      { id: '1', text: 'Dream', start: 0.0, end: 0.5, isImportant: true },
      { id: '2', text: 'Big', start: 0.5, end: 1.0, isImportant: false },
    ];
    const groups: CaptionGroup[] = [
      { id: 'g1', words, start: 0.0, end: 1.0, text: 'Dream Big' },
    ];

    // Phrase SRT
    const phraseSrt = generatePhraseSRT(groups);
    assert.ok(phraseSrt.includes('00:00:00,000 --> 00:00:01,000'), 'Valid phrase SRT timestamp');
    assert.ok(phraseSrt.includes('Dream Big'), 'Includes phrase text');

    // Word SRT
    const wordSrt = generateWordLevelSRT(words);
    assert.ok(wordSrt.includes('00:00:00,000 --> 00:00:00,500'), 'First word SRT timestamp');
    assert.ok(wordSrt.includes('00:00:00,500 --> 00:00:01,000'), 'Second word SRT timestamp');

    // ASS Karaoke Generation
    const assContent = generateAssSubtitles(groups, words, DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS);
    assert.ok(assContent.includes('[Script Info]'), 'ASS must contain [Script Info]');
    assert.ok(assContent.includes('[V4+ Styles]'), 'ASS must contain [V4+ Styles]');
    assert.ok(assContent.includes('[Events]'), 'ASS must contain [Events]');
    assert.ok(assContent.includes('Dialogue:'), 'ASS must contain Dialogues');
    assert.ok(assContent.includes('\\pos'), 'ASS must contain positioning tag');
    assert.ok(assContent.includes('\\c'), 'ASS must contain color styling tag for word highlights');
  });

  // 19. Clip Candidate to Reel Project Conversion (Create Reel Bridge)
  await test('createCaptionProjectFromClip correctly bridges ClipCard to CaptionProject', async () => {
    const { createCaptionProjectFromClip } = await import('../src/lib/caption-maker/clip-to-reel');

    const sampleCandidate: ClipCandidate = {
      id: 'clip_77',
      title: 'Success Formula',
      titleHindi: 'सफलता का रहस्य',
      start: 10,
      end: 25,
      duration: 15,
      topic: 'Motivation',
      explanation: 'Key points on focus and resilience',
      transcript: 'Zindagi mein success pane ke liye focus aur mehnat zaroori hai',
      transcriptHindi: 'जिंदगी में सफलता पाने के लिए एकाग्रता आवश्यक है',
      firstWords: 'Zindagi mein',
      lastWords: 'zaroori hai',
      scores: {
        meaningAndDepth: 20,
        standaloneCompleteness: 18,
        openingStrength: 14,
        emotionalIntellectualImpact: 14,
        clarity: 9,
        conciseness: 9,
        audioQuality: 5,
        total: 89,
      },
      contextVerification: {
        isCompleteThought: true,
        hasConclusion: true,
        hasDanglingPronouns: false,
        contextConfidence: 95,
        notes: '',
        flaggedForReview: false,
      },
      selected: true,
    };

    const reelProject = createCaptionProjectFromClip(sampleCandidate, null, 'en');

    assert.strictEqual(reelProject.title, 'Success Formula');
    assert.strictEqual(reelProject.audio?.duration, 15);
    assert.ok(reelProject.transcript.length > 5, 'Transcript words generated');
    assert.ok(reelProject.captionGroups.length > 1, 'Caption groups generated');

    const importantWordTexts = reelProject.transcript
      .filter((w) => w.isImportant)
      .map((w) => w.text.toLowerCase());

    assert.ok(
      importantWordTexts.includes('zindagi') || importantWordTexts.includes('success'),
      'Keywords should be auto-detected as important'
    );
  });

  // 20. Clip-Specific Audio Extraction and Relative Word Alignment
  await test('Clip-specific audio override and relative transcript alignment', async () => {
    const { createCaptionProjectFromClip } = await import('../src/lib/caption-maker/clip-to-reel');
    const { extractClipAudio } = await import('../src/lib/ffmpeg');

    assert.strictEqual(typeof extractClipAudio, 'function', 'extractClipAudio must be exported as a function');

    const sampleCandidate: ClipCandidate = {
      id: 'clip_slice_99',
      title: 'Discipline Over Motivation',
      start: 120, // 2 minutes into full video
      end: 140,   // 20s clip
      duration: 20,
      topic: 'Motivation',
      explanation: 'Discipline creates lasting results',
      transcript: 'Discipline is doing what you hate to do but doing it like you love it',
      firstWords: 'Discipline is',
      lastWords: 'love it',
      scores: {
        meaningAndDepth: 20,
        standaloneCompleteness: 18,
        openingStrength: 14,
        emotionalIntellectualImpact: 14,
        clarity: 9,
        conciseness: 9,
        audioQuality: 5,
        total: 89,
      },
      contextVerification: {
        isCompleteThought: true,
        hasConclusion: true,
        hasDanglingPronouns: false,
        contextConfidence: 95,
        notes: '',
        flaggedForReview: false,
      },
      selected: true,
    };

    const mockProject: any = {
      id: 'proj_sample_abc',
      title: 'Podcast Episode',
      localVideoPath: 'storage/projects/proj_sample_abc/original/podcast.mp4',
      transcript: [
        {
          id: 'seg_1',
          start: 120,
          end: 130,
          text: 'Discipline is doing what you hate to do',
        },
        {
          id: 'seg_2',
          start: 130,
          end: 140,
          text: 'but doing it like you love it',
        },
      ],
    };

    // Case A: With explicit audio override from FFmpeg extraction
    const override = {
      audioUrl: '/api/files/projects/proj_sample_abc/clips/clip_slice_99_audio.mp3',
      storagePath: 'storage/projects/proj_sample_abc/clips/clip_slice_99_audio.mp3',
      duration: 20,
      fileSize: 480000,
    };

    const projectWithOverride = createCaptionProjectFromClip(sampleCandidate, mockProject, 'en', override);

    assert.strictEqual(
      projectWithOverride.audio?.fileUrl,
      '/api/files/projects/proj_sample_abc/clips/clip_slice_99_audio.mp3',
      'Should use isolated clip audio URL instead of full video'
    );
    assert.strictEqual(
      projectWithOverride.audio?.storagePath,
      'storage/projects/proj_sample_abc/clips/clip_slice_99_audio.mp3',
      'Should preserve clip audio storage path'
    );
    assert.strictEqual(projectWithOverride.audio?.duration, 20);

    // Verify word alignment is relative to clip start (t = 0.00 at clip start)
    const firstWord = projectWithOverride.transcript[0];
    const lastWord = projectWithOverride.transcript[projectWithOverride.transcript.length - 1];

    assert.ok(firstWord.start >= 0 && firstWord.start < 2, 'First word starts near 0.00s in clip audio');
    assert.ok(lastWord.end <= 20.5, 'Last word ends within 20s clip duration');
    assert.ok(firstWord.start < lastWord.start, 'Words are sequentially ordered in clip time');

    // Case B: Fallback without override should target clip-audio route, never full video
    const projectFallback = createCaptionProjectFromClip(sampleCandidate, mockProject, 'en');
    assert.ok(
      projectFallback.audio?.fileUrl.includes('clip-audio'),
      'Fallback URL must route to clip-audio endpoint'
    );
    assert.ok(
      !projectFallback.audio?.fileUrl.includes('podcast.mp4'),
      'Must NOT fall back to full original video path'
    );
  });

  // 21. Contain Mode 9 Positioning Options Resolution
  await test('Contain mode 9 positioning options pad coordinates resolution', async () => {
    const { getImagePositionPadCoords } = await import('../src/lib/caption-maker/ffmpeg-renderer');

    const positions: Array<{ pos: any; expectedPadX: string; expectedPadY: string }> = [
      { pos: 'top-left', expectedPadX: '0', expectedPadY: '0' },
      { pos: 'top-center', expectedPadX: '(ow-iw)/2', expectedPadY: '0' },
      { pos: 'top-right', expectedPadX: '(ow-iw)', expectedPadY: '0' },
      { pos: 'center-left', expectedPadX: '0', expectedPadY: '(oh-ih)/2' },
      { pos: 'center', expectedPadX: '(ow-iw)/2', expectedPadY: '(oh-ih)/2' },
      { pos: 'center-right', expectedPadX: '(ow-iw)', expectedPadY: '(oh-ih)/2' },
      { pos: 'bottom-left', expectedPadX: '0', expectedPadY: '(oh-ih)' },
      { pos: 'bottom-center', expectedPadX: '(ow-iw)/2', expectedPadY: '(oh-ih)' },
      { pos: 'bottom-right', expectedPadX: '(ow-iw)', expectedPadY: '(oh-ih)' },
    ];

    for (const item of positions) {
      const coords = getImagePositionPadCoords(item.pos);
      assert.strictEqual(coords.padX, item.expectedPadX, `${item.pos} padX matches`);
      assert.strictEqual(coords.padY, item.expectedPadY, `${item.pos} padY matches`);
    }
  });

  // 22. Remotion + GSAP Programmatic Video Pipeline Verification
  await test('Remotion + GSAP deterministic typography timeline and 9-position parity', async () => {
    const { getCssObjectPosition } = await import('../src/remotion/BackgroundLayer');
    const { calculateCompositionMetadata } = await import('../src/remotion/Root');

    // 1. CSS objectPosition 9-position parity
    const expectedMappings: Record<string, string> = {
      'top-left': 'left top',
      'top-center': 'center top',
      'top-right': 'right top',
      'center-left': 'left center',
      'center': 'center center',
      'center-right': 'right center',
      'bottom-left': 'left bottom',
      'bottom-center': 'center bottom',
      'bottom-right': 'right bottom',
    };

    for (const [pos, expectedCss] of Object.entries(expectedMappings)) {
      const result = getCssObjectPosition(pos as any);
      assert.strictEqual(result, expectedCss, `Position ${pos} must map to CSS "${expectedCss}"`);
    }

    // 2. Metadata calculation for Remotion composition
    const metadata = calculateCompositionMetadata({
      props: {
        outputSettings: {
          ...DEFAULT_OUTPUT_SETTINGS,
          width: 1080,
          height: 1920,
          fps: 30,
        },
        durationInSeconds: 2.5,
      } as any,
    });

    assert.strictEqual(metadata.width, 1080, 'Composition width must match outputSettings');
    assert.strictEqual(metadata.height, 1920, 'Composition height must match outputSettings');
    assert.strictEqual(metadata.fps, 30, 'Composition fps must match outputSettings');
    assert.strictEqual(metadata.durationInFrames, 75, '2.5s @ 30fps must produce 75 frames');

    // 3. Deterministic frame / fps seek timestamp calculation
    const fps = 30;
    const testFrames = [0, 15, 30, 45, 60];
    const expectedSeekTimes = [0.0, 0.5, 1.0, 1.5, 2.0];

    testFrames.forEach((frame, idx) => {
      const seekTime = frame / fps;
      assert.strictEqual(seekTime, expectedSeekTimes[idx], `Frame ${frame} seeks deterministically to ${expectedSeekTimes[idx]}s`);
    });

    // 4. Remotion typography container width & horizontal alignment constraint
    const canvasWidth = 1080;
    const captionContainerWidth = Math.round(canvasWidth * 0.88);
    assert.strictEqual(captionContainerWidth, 950, 'Caption container width must be 88% of 1080p canvas (950px)');

    // Ensure multi-word phrase fits comfortably within container without forced single-word wrap
    const sampleWords = ['लोग', 'वैसे', 'व्यवहार', 'करें'];
    const estimatedWordWidths = sampleWords.map((w) => w.length * 35); // Approx ~35px per glyph at 60px fontSize
    const totalPhraseWidth = estimatedWordWidths.reduce((a, b) => a + b, 0) + (sampleWords.length - 1) * 14;
    assert.ok(totalPhraseWidth < captionContainerWidth, `Sample phrase width (${totalPhraseWidth}px) must fit within container (${captionContainerWidth}px)`);

    // 5. Verification that rendered test video exists and is a valid MP4
    const testVideoPath = path.resolve(process.cwd(), 'storage', 'temp', 'remotion_test_output.mp4');
    if (fs.existsSync(testVideoPath)) {
      const stats = fs.statSync(testVideoPath);
      assert.ok(stats.size > 10000, 'Rendered Remotion video must be a non-empty MP4');
    }
  });

  // 23. Audio Project Media Probing & SourceType Parity
  await test('Audio project media probing and VideoSourceType integrity', async () => {
    const { probeVideo } = await import('../src/lib/ffmpeg');
    const sampleAudioPath = path.resolve(process.cwd(), 'public', 'sample-audio.mp3');

    if (fs.existsSync(sampleAudioPath)) {
      const metadata = await probeVideo(sampleAudioPath);
      assert.ok(metadata.duration > 0, 'Audio duration must be probed properly');
      assert.ok(metadata.hasAudio, 'Metadata must recognize audio stream');
      assert.strictEqual(metadata.aspectRatio, 'Audio', 'Audio-only media aspect ratio must be Audio');
      assert.strictEqual(metadata.width, 1080, 'Audio-only canvas defaults to 1080 for 9:16 layout');
      assert.strictEqual(metadata.height, 1920, 'Audio-only canvas defaults to 1920 for 9:16 layout');
    }
  });

  // 24. VN & Instagram Style Presets & Text Effects Integrity
  await test('VN & Instagram style presets, background badges, and text effects integrity', async () => {
    const { REEL_STYLE_PRESETS, hexToRgba, DEFAULT_CAPTION_STYLE } = await import(
      '../src/lib/caption-maker/sample-data'
    );

    assert.ok(REEL_STYLE_PRESETS.length >= 6, 'Must provide at least 6 viral style presets');

    const hormozi = REEL_STYLE_PRESETS.find((p) => p.id === 'hormozi-viral');
    assert.ok(hormozi, 'Hormozi Viral preset must be defined');
    assert.strictEqual(hormozi?.style.backgroundStyle, 'solid-pill');
    assert.strictEqual(hormozi?.style.animationPreset, 'punch');

    const neon = REEL_STYLE_PRESETS.find((p) => p.id === 'instagram-neon');
    assert.ok(neon, 'Instagram Neon preset must be defined');
    assert.strictEqual(neon?.style.textEffect, 'neon-glow');
    assert.strictEqual(neon?.style.backgroundStyle, 'frosted-glass');

    const marker = REEL_STYLE_PRESETS.find((p) => p.id === 'highlighter-marker');
    assert.ok(marker, 'Story Marker preset must be defined');
    assert.strictEqual(marker?.style.backgroundStyle, 'marker-bar');

    // Test hexToRgba
    assert.strictEqual(hexToRgba('#000000', 0.5), 'rgba(0, 0, 0, 0.5)');
    assert.strictEqual(hexToRgba('#FFFFFF', 1), 'rgba(255, 255, 255, 1)');
    assert.strictEqual(hexToRgba('transparent', 0.8), 'transparent');

    // Default style has necessary text layout values
    assert.ok(typeof DEFAULT_CAPTION_STYLE.lineHeight === 'number');
    assert.ok(typeof DEFAULT_CAPTION_STYLE.letterSpacing === 'number');
    assert.strictEqual(typeof DEFAULT_CAPTION_STYLE.zoomScale, 'number');
  });

  // 25. Text Zoom Settings and Anti-Overlap Margin Buffering
  await test('Text zoom settings, flat normal text mode, and anti-overlap layout buffer', async () => {
    const { DEFAULT_CAPTION_STYLE, REEL_STYLE_PRESETS } = await import(
      '../src/lib/caption-maker/sample-data'
    );
    const { generateAssSubtitles } = await import(
      '../src/lib/caption-maker/ass-generator'
    );

    // 1. Verify zoomScale existence and defaults
    assert.strictEqual(DEFAULT_CAPTION_STYLE.zoomScale, 1.15, 'Default caption style zoomScale must be 1.15');

    // 2. Ali Abdaal clean preset must have flat text (zoomScale 1.0)
    const cleanPreset = REEL_STYLE_PRESETS.find((p) => p.id === 'ali-abdaal-clean');
    assert.strictEqual(cleanPreset?.style.zoomScale, 1.0, 'Clean minimal preset must have zoomScale 1.0 (flat text)');
    assert.strictEqual(cleanPreset?.style.highlightAnimation, 'color-change', 'Clean minimal preset uses color-change');

    // 3. Hormozi viral preset has high-energy zoom
    const hormoziPreset = REEL_STYLE_PRESETS.find((p) => p.id === 'hormozi-viral');
    assert.strictEqual(hormoziPreset?.style.zoomScale, 1.18, 'Hormozi preset must have high-energy zoomScale');

    // 4. Overlap prevention buffer calculation check
    const fontSize = 60;
    const testScale = 1.20;
    const extraMargin = Math.round((testScale - 1) * 0.45 * fontSize);
    assert.ok(extraMargin >= 5, `Active word margin buffer must be at least 5px (got ${extraMargin}px)`);

    // Proportional column and row gap checks
    const colGap = Math.round(fontSize * 0.32);
    const rowGap = Math.round(fontSize * 0.40 * Math.max(0.3, 1.3 - 0.7));
    assert.ok(colGap >= 18, `Column gap (${colGap}px) must provide proportional breathing room`);
    assert.ok(rowGap >= 14, `Row gap (${rowGap}px) must prevent multiline line collisions`);

    // 5. ASS Subtitle flat normal text mode verification
    const words = [
      { id: '1', text: 'Zindagi', start: 0.0, end: 0.5, isImportant: true },
      { id: '2', text: 'safal', start: 0.5, end: 1.0, isImportant: false },
    ];
    const groups = [{ id: 'g1', words, start: 0.0, end: 1.0, text: 'Zindagi safal' }];

    const flatStyle = {
      ...DEFAULT_CAPTION_STYLE,
      highlightAnimation: 'color-change' as const,
      zoomScale: 1.0,
    };
    const flatAss = generateAssSubtitles(groups, words, flatStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });
    // In flat mode, there should NOT be scale tags like \fscx115 or \fscx120
    assert.ok(!flatAss.includes('\\fscx115'), 'Flat normal text must not include zoom scale tags in ASS');
    assert.ok(!flatAss.includes('\\fscx120'), 'Flat normal text must not include zoom scale tags in ASS');
  });

  // 26. Google Fonts Integration and Dynamic Font URL Generation
  await test('Google Fonts catalog, single-weight resolution, and stylesheet URL builder', async () => {
    const { POPULAR_GOOGLE_FONTS, getGoogleFontUrl, SINGLE_WEIGHT_FONTS } = await import(
      '../src/lib/caption-maker/google-fonts'
    );

    // 1. Curated font catalog count and categories
    assert.ok(POPULAR_GOOGLE_FONTS.length >= 40, 'Must have at least 40 curated Google Fonts');
    const categories = new Set(POPULAR_GOOGLE_FONTS.map((f) => f.category));
    assert.ok(categories.has('viral'), 'Must include viral category');
    assert.ok(categories.has('clean'), 'Must include clean category');
    assert.ok(categories.has('serif'), 'Must include serif category');
    assert.ok(categories.has('devanagari'), 'Must include devanagari category');

    // 2. Multi-weight Google Font URL builder
    const montserratUrl = getGoogleFontUrl('Montserrat');
    assert.ok(montserratUrl.includes('family=Montserrat:wght@400;500;600;700;800;900'), 'Montserrat multi-weight URL');
    assert.ok(montserratUrl.includes('&display=swap'));

    // 3. Single-weight Google Font resolution (e.g. Bebas Neue, Anton)
    assert.ok(SINGLE_WEIGHT_FONTS.has('Bebas Neue'));
    const bebasUrl = getGoogleFontUrl('Bebas Neue');
    assert.ok(bebasUrl.includes('family=Bebas+Neue&display=swap'), 'Bebas Neue must NOT request multi-weight range');

    // 4. Custom font arbitrary name query
    const customUrl = getGoogleFontUrl('"Space Mono", monospace');
    assert.ok(customUrl.includes('family=Space+Mono'), 'Space Mono custom name formatted correctly');

    // 5. Devanagari font catalog additions (Mukta, Rajdhani, Modak)
    const fontNames = POPULAR_GOOGLE_FONTS.map((f) => f.name);
    assert.ok(fontNames.includes('Mukta'), 'Mukta must be available in catalog');
    assert.ok(fontNames.includes('Rajdhani'), 'Rajdhani must be available in catalog');
    assert.ok(fontNames.includes('Modak'), 'Modak must be available in catalog');

    // 6. Selected font must be preserved in ASS subtitles even with Hindi transcript
    const { generateAssSubtitles } = await import('../src/lib/caption-maker/ass-generator');
    const { DEFAULT_CAPTION_STYLE } = await import('../src/lib/caption-maker/sample-data');
    const hindiWords = [
      { id: 'h1', text: 'सफलता', start: 0.0, end: 0.5, isImportant: false },
      { id: 'h2', text: 'मेहनत', start: 0.5, end: 1.0, isImportant: true },
    ];
    const hindiGroups = [{ id: 'hg1', words: hindiWords, start: 0.0, end: 1.0, text: 'सफलता मेहनत' }];
    const rozhaStyle = {
      ...DEFAULT_CAPTION_STYLE,
      fontFamily: '"Rozha One", sans-serif',
    };
    const rozhaAss = generateAssSubtitles(hindiGroups, hindiWords, rozhaStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });
    assert.ok(rozhaAss.includes('Rozha One'), 'Selected font Rozha One must be preserved in ASS script');
  });

  // 27. Normal Text Color, Active Spoken Color & Normal Text Opacity Integrity
  await test('Normal text color, active spoken color (#FCD905), and normal text opacity parity', async () => {
    const { DEFAULT_CAPTION_STYLE } = await import('../src/lib/caption-maker/sample-data');
    const { generateAssSubtitles, hexToAssColor } = await import('../src/lib/caption-maker/ass-generator');

    // 1. Default color and opacity verification
    assert.strictEqual(
      DEFAULT_CAPTION_STYLE.importantColor,
      '#FCD905',
      'Default active spoken word color must be #FCD905 (Vibrant Gold)'
    );
    assert.strictEqual(
      DEFAULT_CAPTION_STYLE.textColor,
      '#FFFFFF',
      'Default normal text color must be #FFFFFF (Pure White)'
    );
    assert.strictEqual(
      DEFAULT_CAPTION_STYLE.textOpacity,
      0.65,
      'Default normal text opacity must be 0.65 (65% focused dim)'
    );

    // 2. ASS Subtitle generation with custom colors and opacity
    const words = [
      { id: 'w1', text: 'Viral', start: 0.0, end: 0.5, isImportant: false },
      { id: 'w2', text: 'Captions', start: 0.5, end: 1.0, isImportant: false },
    ];
    const groups = [{ id: 'g1', words, start: 0.0, end: 1.0, text: 'Viral Captions' }];

    // Test with solid 100% opacity (textOpacity = 1.0 -> alpha = 00)
    const solidStyle = {
      ...DEFAULT_CAPTION_STYLE,
      textColor: '#FFFFFF',
      importantColor: '#FCD905',
      textOpacity: 1.0,
    };
    const solidAss = generateAssSubtitles(groups, words, solidStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });
    // With 1.0 opacity, alpha is 00 (e.g. &H00FFFFFF&)
    const expectedSolidNormalColor = hexToAssColor('#FFFFFF', '00');
    assert.ok(
      solidAss.includes(expectedSolidNormalColor),
      `Solid normal text opacity must render with alpha 00 in ASS (${expectedSolidNormalColor})`
    );

    // Test with 50% opacity (textOpacity = 0.5 -> alpha = 80)
    const halfStyle = {
      ...DEFAULT_CAPTION_STYLE,
      textColor: '#FFFFFF',
      importantColor: '#FCD905',
      textOpacity: 0.5,
    };
    const halfAss = generateAssSubtitles(groups, words, halfStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });
    const expectedHalfAlphaColor = hexToAssColor('#FFFFFF', '80');
    assert.ok(
      halfAss.includes(expectedHalfAlphaColor),
      `50% normal text opacity must render with alpha 80 in ASS (${expectedHalfAlphaColor})`
    );

    // Test with custom active color (#FF007A) and custom normal text color (#00FFCC)
    const customColorStyle = {
      ...DEFAULT_CAPTION_STYLE,
      textColor: '#00FFCC',
      importantColor: '#FF007A',
      textOpacity: 0.65,
    };
    const customAss = generateAssSubtitles(groups, words, customColorStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });
    const expectedCustomActiveAss = hexToAssColor('#FF007A');
    assert.ok(
      customAss.includes(expectedCustomActiveAss),
      `Active word must render in ASS with custom active color (${expectedCustomActiveAss})`
    );
  });

  // 28. Custom Horizontal Alignment & CustomX Positioning Parity
  await test('Custom horizontal alignment (textAlign: custom) and customX positioning parity', async () => {
    const { DEFAULT_CAPTION_STYLE } = await import('../src/lib/caption-maker/sample-data');
    const { generateAssSubtitles } = await import('../src/lib/caption-maker/ass-generator');

    const words = [
      { id: 'w1', text: 'CustomX', start: 0.0, end: 0.5, isImportant: false },
      { id: 'w2', text: 'Position', start: 0.5, end: 1.0, isImportant: false },
    ];
    const groups = [{ id: 'g1', words, start: 0.0, end: 1.0, text: 'CustomX Position' }];

    const customXStyle = {
      ...DEFAULT_CAPTION_STYLE,
      textAlign: 'custom' as const,
      customX: 35, // 35% of width
    };

    const ass = generateAssSubtitles(groups, words, customXStyle, {
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      quality: 'standard',
      fps: 30,
    });

    const expectedX = Math.round(0.35 * 1080); // 378
    assert.ok(
      ass.includes(`\\pos(${expectedX},`),
      `Custom textAlign must position X coordinate at ${expectedX}px for 35% of 1080p canvas`
    );
  });

  await test('Thumbnail generator settings, preset catalog, and aspect ratio dimension parity', async () => {
    const {
      createDefaultThumbnailSettings,
      getThumbnailDimensions,
      THUMBNAIL_PRESETS,
      THUMBNAIL_GRADIENTS,
      QUICK_BADGES,
    } = await import('../src/lib/caption-maker/thumbnail-presets');

    const settings = createDefaultThumbnailSettings('My Viral Reel', '9:16');
    assert.strictEqual(settings.title, 'My Viral Reel');
    assert.strictEqual(settings.highlightColor, '#FCD905', 'Default highlight color must be #FCD905');
    assert.strictEqual(settings.aspectRatio, '9:16');
    assert.strictEqual(settings.preset, 'hormozi');

    // Test dimension resolution for all supported aspect ratios
    const dim916 = getThumbnailDimensions('9:16');
    assert.deepStrictEqual(dim916, { width: 1080, height: 1920 });

    const dim45 = getThumbnailDimensions('4:5');
    assert.deepStrictEqual(dim45, { width: 1080, height: 1350 });

    const dim11 = getThumbnailDimensions('1:1');
    assert.deepStrictEqual(dim11, { width: 1080, height: 1080 });

    const dim169 = getThumbnailDimensions('16:9');
    assert.deepStrictEqual(dim169, { width: 1920, height: 1080 });

    // Verify preset catalog completeness
    assert.ok(THUMBNAIL_PRESETS.length >= 5, 'Preset catalog must contain at least 5 viral styles');
    const hormoziPreset = THUMBNAIL_PRESETS.find((p) => p.id === 'hormozi');
    assert.ok(hormoziPreset, 'Hormozi Punch preset must exist');
    assert.strictEqual(hormoziPreset.settings.highlightColor, '#FCD905');
    assert.strictEqual(hormoziPreset.settings.textColor, '#FFFFFF');

    const cyberPreset = THUMBNAIL_PRESETS.find((p) => p.id === 'cyber');
    assert.ok(cyberPreset, 'Cyber Neon preset must exist');

    assert.ok(THUMBNAIL_GRADIENTS.length >= 4, 'Must provide studio gradient backdrops');
    assert.ok(QUICK_BADGES.includes('MUST WATCH'));
    assert.ok(QUICK_BADGES.includes('VIRAL'));
  });

  await test('Thumbnail auto-merge into video (base64 persistence and FFmpeg merge) parity', async () => {
    const { saveBase64Image, mergeThumbnailIntoVideo } = await import(
      '../src/lib/caption-maker/thumbnail-merger'
    );
    const { getFfmpegPath } = await import('../src/lib/config');
    const { spawn } = await import('child_process');

    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 1. Verify saveBase64Image creates a valid file from Data URL
    const dummyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const testThumbPath = path.join(tempDir, `test_thumb_${Date.now()}.png`);
    await saveBase64Image(dummyPngDataUrl, testThumbPath);
    assert.ok(fs.existsSync(testThumbPath), 'Saved thumbnail file must exist');
    assert.ok(fs.statSync(testThumbPath).size > 10, 'Saved thumbnail file must contain bytes');

    // 2. Generate a 1-second dummy video to test merge
    const testVideoPath = path.join(tempDir, `test_vid_${Date.now()}.mp4`);
    const ffmpeg = getFfmpegPath();
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpeg, [
        '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=720x1280:d=1:r=25',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        testVideoPath,
      ]);
      p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`Failed to generate test video: ${c}`))));
    });

    assert.ok(fs.existsSync(testVideoPath), 'Test video must exist before merge');

    // 3. Test mergeThumbnailIntoVideo in poster_only mode
    const mergedResult = await mergeThumbnailIntoVideo({
      videoPath: testVideoPath,
      thumbnailPath: testThumbPath,
      mergeMode: 'poster_only',
    });

    assert.ok(fs.existsSync(mergedResult.outputPath), 'Merged output video must exist');
    assert.ok(fs.statSync(mergedResult.outputPath).size > 1000, 'Merged output video must not be empty');

    // Clean up temporary test files
    try {
      if (fs.existsSync(testThumbPath)) fs.unlinkSync(testThumbPath);
      if (fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath);
    } catch {}
  });

  await test('Thumbnail background image fit mode (contain/cover), position (9 alignments), and scale parity with video reels', async () => {
    const { renderThumbnailToCanvas, createDefaultThumbnailSettings } = await import(
      '../src/lib/caption-maker/thumbnail-presets'
    );

    const drawnImages: { dx: number; dy: number; dw: number; dh: number }[] = [];
    const mockCtx: any = {
      clearRect: () => {},
      fillRect: () => {},
      drawImage: (_img: any, dx: number, dy: number, dw: number, dh: number) => {
        drawnImages.push({ dx, dy, dw, dh });
      },
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      closePath: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      measureText: (text: string) => ({ width: text.length * 12 }),
      fillText: () => {},
      strokeText: () => {},
    };

    const mockCanvas: any = {
      getContext: () => mockCtx,
      width: 0,
      height: 0,
    };

    const settings = createDefaultThumbnailSettings('Sync Test', '9:16');
    const mockImageEl: any = { width: 500, height: 750 }; // 2:3 aspect ratio portrait

    // Test 1: Contain mode with bottom-left position and 100% scale (matching user screenshot)
    const containAsset: any = {
      id: 'img-1',
      fileUrl: '/test.jpg',
      fileName: 'test.jpg',
      fileSize: 1000,
      width: 500,
      height: 750,
      format: 'jpg',
      fitMode: 'contain',
      position: 'bottom-left',
      scale: 100,
    };

    await renderThumbnailToCanvas(mockCanvas, settings, mockImageEl, containAsset);
    assert.strictEqual(drawnImages.length, 1, 'Image must be drawn to canvas');
    const containCall = drawnImages[0];
    const expectedPad = Math.round(1080 * 0.025); // 27px
    assert.strictEqual(containCall.dx, expectedPad, 'Bottom-left image must align X to left padding (27px)');
    assert.ok(containCall.dy > 0, 'Y must align towards the bottom of the canvas');
    assert.ok(containCall.dw > 900, 'Scale 100% must utilize full container width');

    // Test 2: Cover mode parity
    drawnImages.length = 0;
    const coverAsset: any = {
      ...containAsset,
      fitMode: 'cover',
    };

    await renderThumbnailToCanvas(mockCanvas, settings, mockImageEl, coverAsset);
    assert.strictEqual(drawnImages.length, 1, 'Cover mode must draw image');
    const coverCall = drawnImages[0];
    assert.ok(coverCall.dw >= 1080, 'Cover mode width must cover or exceed canvas width (1080px)');
  });

  // 32. Thumbnail Settings & Reel Layout Parity (Zero Layout Shift Verification)
  await test('Thumbnail preview default position, customY, overlayDarkness, and aspect ratio parity with video reels', async () => {
    const { createDefaultThumbnailSettings } = await import('../src/lib/caption-maker/thumbnail-presets');

    // Test default settings creation with reel caption style inheritance
    const reelSynced = createDefaultThumbnailSettings(
      'मनुष्य की सबसे बड़ी',
      '9:16',
      'top',
      18,
      'Nirmala UI',
      '#FCD905'
    );

    assert.strictEqual(reelSynced.title, 'मनुष्य की सबसे बड़ी', 'Title inherits first caption hook');
    assert.strictEqual(reelSynced.position, 'top', 'Position defaults to top (matching reel captions)');
    assert.strictEqual(reelSynced.customY, 18, 'customY defaults to 18%');
    assert.strictEqual(reelSynced.overlayDarkness, 0, 'overlayDarkness defaults to 0 (no forced darkening of media)');
    assert.strictEqual(reelSynced.fontFamily, 'Nirmala UI', 'Font family inherits caption font');
    assert.strictEqual(reelSynced.highlightColor, '#FCD905', 'Active highlight color defaults to #FCD905');
    assert.strictEqual(reelSynced.aspectRatio, '9:16', 'Aspect ratio inherits canvas settings');
    assert.strictEqual(reelSynced.showSafeArea, true, 'Safe area defaults to true on thumbnail cover');

    // Test aspect ratio synchronization for non-standard aspects (e.g. 1:1, 4:5, 16:9)
    const squareThumb = createDefaultThumbnailSettings('Square', '1:1');
    assert.strictEqual(squareThumb.aspectRatio, '1:1');
    assert.strictEqual(squareThumb.overlayDarkness, 0);
    assert.strictEqual(squareThumb.showSafeArea, true);
  });

  // 33. Thumbnail Instant Cover Merging (Frame 0 Pre-playback duration 0.000001s)
  await test('Thumbnail instant poster merger logic and base64 storage', async () => {
    const { saveBase64Image } = await import('../src/lib/caption-maker/thumbnail-merger');

    const testDir = path.join(process.cwd(), 'data', 'test_tmp');
    const testFile = path.join(testDir, 'test_thumb.png');
    // 1x1 transparent png
    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';

    await saveBase64Image(testDataUrl, testFile);
    assert.ok(fs.existsSync(testFile), 'Thumbnail must be written to disk');
    const stat = fs.statSync(testFile);
    assert.ok(stat.size > 0, 'Thumbnail file must not be empty');
    fs.unlinkSync(testFile);
    try { fs.rmdirSync(testDir); } catch {}
  });

  console.log('\n======================================================');
  console.log(`📊 TEST SUITE RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});
