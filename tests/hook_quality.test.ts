import assert from 'node:assert/strict';
import {
  assessHookQuality,
  getHookWords,
  normalizeHookWord,
} from '../src/lib/caption-maker/hook-quality';

function runHookQualityTests() {
  assert.strictEqual(normalizeHookWord('Growth!'), 'growth');
  assert.strictEqual(normalizeHookWord('क्या?'), 'क्या');
  assert.deepStrictEqual(getHookWords('3 Growth Tips, अभी सीखें'), ['3', 'Growth', 'Tips', 'अभी', 'सीखें']);

  const strong = assessHookQuality('3 Growth Tips');
  assert.strictEqual(strong.label, 'Strong');
  assert.ok(strong.focusWords.includes('Growth'));

  const unfocused = assessHookQuality('More');
  assert.strictEqual(unfocused.label, 'Needs focus');
  assert.ok(unfocused.tips.some((tip) => tip.includes('at least 3 words')));

  console.log('✓ Cover-hook quality and multilingual highlight helpers verified.');
}

runHookQualityTests();
