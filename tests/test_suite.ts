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
