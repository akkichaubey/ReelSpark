import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reelspark-transcription-'));
  process.env.STORAGE_DIR = root;
  delete process.env.GEMINI_API_KEY;
  const { transcribeAudio } = await import('../src/lib/caption-maker/transcription');
  const { generateContentWithFallback } = await import('../src/lib/gemini');
  const audio = path.join(root, 'voice.wav');
  await assert.rejects(transcribeAudio(audio, 'en', { titleEnglish: 'Untitled Reel' }), /not configured/);
  fs.writeFileSync(`${audio}.sync.json`, JSON.stringify({
    acousticLocked: true,
    segments: [{ start: 0, end: 39, textEnglish: 'Untitled Reel', textHindi: 'Untitled Reel' }],
  }));
  await assert.rejects(transcribeAudio(audio, 'en'), /not configured/,
    'Legacy fabricated cache must not be accepted as recognized speech');
  await assert.rejects(generateContentWithFallback(null, undefined, {
    contents: [{ parts: [{ inlineData: { data: '', mimeType: 'audio/wav' } }] }],
    allowTextFallback: false,
  }), /GEMINI_API_KEY/);
  console.log('PASS: missing speech provider and legacy fabricated cache rejected; audio never falls back to text generation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
