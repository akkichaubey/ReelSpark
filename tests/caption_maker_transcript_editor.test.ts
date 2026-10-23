import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  groupTranscriptWords,
  splitCaptionGroup,
  mergeCaptionGroups,
  updateWordInGroups,
  deleteWordFromGroups,
  addWordToGroup,
  deleteCaptionGroup,
  updateCaptionGroupPhrase,
  addCaptionGroup,
} from '../src/lib/caption-maker/caption-grouping';
import {
  detectImportantWords,
  isWordImportantHeuristic,
} from '../src/lib/caption-maker/important-words';
import {
  createDefaultCaptionProject,
  createEmptyCaptionProject,
  SAMPLE_TRANSCRIPT_WORDS,
} from '../src/lib/caption-maker/sample-data';
import { switchProjectLanguage } from '../src/lib/caption-maker/clip-to-reel';
import { TranscriptWord } from '../src/lib/caption-maker/types';

describe('Caption Maker — Transcript & Captions Editor Pipeline', () => {
  it('1. Verifies phrase-level group editing with dynamic token redistribution and timing bounds', () => {
    const sampleWords: TranscriptWord[] = [
      { id: 'w1', text: 'Zindagi', start: 0.0, end: 0.52, isImportant: true },
      { id: 'w2', text: 'mein', start: 0.52, end: 0.8, isImportant: false },
      { id: 'w3', text: 'kabhi', start: 0.8, end: 1.15, isImportant: false },
      { id: 'w4', text: 'HAAR', start: 1.15, end: 1.7, isImportant: true },
    ];
    const initialGroups = groupTranscriptWords(sampleWords, 4);
    assert.strictEqual(initialGroups.length, 1);
    assert.strictEqual(initialGroups[0].words.length, 4);

    // Edit full phrase text and expand end timing
    const updated = updateCaptionGroupPhrase(
      initialGroups,
      initialGroups[0].id,
      'Zindagi mein hamesha JEET ki ummeed rakho',
      0.0,
      2.5
    );

    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].text, 'Zindagi mein hamesha JEET ki ummeed rakho');
    assert.strictEqual(updated[0].start, 0.0);
    assert.strictEqual(updated[0].end, 2.5);
    assert.strictEqual(updated[0].words.length, 7);

    // Words should be sequentially ordered within [0.0, 2.5]
    for (let i = 0; i < updated[0].words.length; i++) {
      assert.ok(updated[0].words[i].start >= 0.0);
      assert.ok(updated[0].words[i].end <= 2.5);
      if (i > 0) {
        assert.ok(updated[0].words[i].start >= updated[0].words[i - 1].start);
      }
    }
  });

  it('2. Verifies group deletion removes the group cleanly without affecting other groups', () => {
    const sampleWords: TranscriptWord[] = [
      { id: 'w1', text: 'Sentence', start: 0.0, end: 1.0 },
      { id: 'w2', text: 'one.', start: 1.0, end: 2.0 },
      { id: 'w3', text: 'Sentence', start: 2.5, end: 3.5 },
      { id: 'w4', text: 'two.', start: 3.5, end: 4.5 },
    ];
    const groups = groupTranscriptWords(sampleWords, 2);
    assert.strictEqual(groups.length, 2);

    const afterDelete = deleteCaptionGroup(groups, groups[0].id);
    assert.strictEqual(afterDelete.length, 1);
    assert.strictEqual(afterDelete[0].id, groups[1].id);
    assert.strictEqual(afterDelete[0].text, 'Sentence two.');
  });

  it('3. Verifies adding a brand-new caption group inserts at proper position', () => {
    const sampleWords: TranscriptWord[] = [
      { id: 'w1', text: 'First', start: 0.0, end: 1.0 },
      { id: 'w2', text: 'phrase.', start: 1.0, end: 2.0 },
    ];
    const groups = groupTranscriptWords(sampleWords, 2);
    assert.strictEqual(groups.length, 1);

    const withAdded = addCaptionGroup(
      groups,
      groups[0].id,
      'Second newly added phrase',
      2.2,
      4.5
    );
    assert.strictEqual(withAdded.length, 2);
    assert.strictEqual(withAdded[1].text, 'Second newly added phrase');
    assert.strictEqual(withAdded[1].start, 2.2);
    assert.strictEqual(withAdded[1].end, 4.5);
    assert.strictEqual(withAdded[1].words.length, 4);
  });

  it('4. Verifies keyword detection heuristic works for both Latin and Devanagari Hindi keywords', () => {
    // Latin keywords
    assert.strictEqual(isWordImportantHeuristic('Zindagi'), true);
    assert.strictEqual(isWordImportantHeuristic('HAAR'), true);
    assert.strictEqual(isWordImportantHeuristic('JEET'), true);
    assert.strictEqual(isWordImportantHeuristic('sapna'), true);
    assert.strictEqual(isWordImportantHeuristic('DREAM'), true);
    assert.strictEqual(isWordImportantHeuristic('the'), false);
    assert.strictEqual(isWordImportantHeuristic('mein'), false);

    // Devanagari keywords
    assert.strictEqual(isWordImportantHeuristic('ज़िंदगी'), true);
    assert.strictEqual(isWordImportantHeuristic('हार'), true);
    assert.strictEqual(isWordImportantHeuristic('जीत'), true);
    assert.strictEqual(isWordImportantHeuristic('सपना'), true);
    assert.strictEqual(isWordImportantHeuristic('लक्ष्य'), true);
    assert.strictEqual(isWordImportantHeuristic('में'), false);
    assert.strictEqual(isWordImportantHeuristic('जो'), false);
  });

  it('5. Verifies forceRecompute re-evaluates words even if previously marked false', () => {
    const words: TranscriptWord[] = [
      { id: 'w1', text: 'Zindagi', start: 0.0, end: 0.5, isImportant: false }, // explicitly false
      { id: 'w2', text: 'mein', start: 0.5, end: 0.8, isImportant: true },    // incorrectly true
      { id: 'w3', text: 'DREAM', start: 0.8, end: 1.2, isImportant: false },   // explicitly false
    ];

    // Standard run preserves explicit values
    const withoutForce = detectImportantWords(words, false);
    assert.strictEqual(withoutForce[0].isImportant, false);
    assert.strictEqual(withoutForce[1].isImportant, true);

    // Force recompute re-evaluates everything
    const withForce = detectImportantWords(words, true);
    assert.strictEqual(withForce[0].isImportant, true);   // Zindagi detected!
    assert.strictEqual(withForce[1].isImportant, false);  // mein detected as non-keyword!
    assert.strictEqual(withForce[2].isImportant, true);   // DREAM detected!
  });

  it('6. Verifies createDefaultCaptionProject provides complete bilingual metadata for language switcher', () => {
    const proj = createDefaultCaptionProject('test_proj');
    assert.ok(proj.rawTranscriptHindi, 'Must have rawTranscriptHindi');
    assert.ok(proj.rawTranscriptEnglish, 'Must have rawTranscriptEnglish');
    assert.ok(proj.rawTranscriptHinglish, 'Must have rawTranscriptHinglish');
    assert.ok(proj.syncedSegments && proj.syncedSegments.length > 0, 'Must have syncedSegments');
    assert.strictEqual(proj.captionGroups.length > 0, true);

    // Switching to Hindi
    const hiProj = switchProjectLanguage(proj, 'hi');
    assert.strictEqual(hiProj.preferredLanguage, 'hi');
    assert.ok(hiProj.transcript.some((w) => /[\u0900-\u097F]/.test(w.text)), 'Hindi transcript must contain Devanagari characters');
    assert.ok(hiProj.captionGroups.length > 0);

    // Switching to English
    const enProj = switchProjectLanguage(proj, 'en');
    assert.strictEqual(enProj.preferredLanguage, 'en');
    assert.ok(enProj.transcript.some((w) => /^[a-zA-Z]/.test(w.text)), 'English transcript must contain English words');
    assert.ok(enProj.captionGroups.length > 0);
  });
});
