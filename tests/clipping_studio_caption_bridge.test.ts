import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '../src/lib/config';
import { createCaptionProjectFromClip } from '../src/lib/caption-maker/clip-to-reel';

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO -> CAPTION MAKER BRIDGE TESTS');
  console.log('======================================================\n');

  // 1. Verify project media exists
  const projectId = 'clip_proj_1792495423349_2m8or';
  const mediaFilename = '______________________________OSHO_HINDI_SPEECH_128k.m4a';
  const sourcePath = path.join(
    APP_CONFIG.storageRoot,
    'clipping-studio',
    'projects',
    projectId,
    'media',
    mediaFilename
  );

  assert.ok(fs.existsSync(sourcePath), 'Source media file must exist on disk');
  console.log('  ✓ Source media exists on disk:', path.basename(sourcePath));

  // 2. Call Bridge Caption API
  const res = await fetch('http://localhost:3000/api/clipping-studio/bridge-caption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clipId: 'clip_integration_test_41s',
      clipName: '1-Minute Mind Control Test',
      startMs: 0,
      endMs: 41000,
      durationMs: 41000,
      projectId,
      sourceFilename: mediaFilename,
      hasVideo: false,
    }),
  });

  assert.strictEqual(res.status, 200, 'Bridge endpoint must return HTTP 200');
  const data = await res.json();
  assert.ok(data.success, 'Bridge endpoint must return success: true');
  assert.ok(data.audio, 'Bridge endpoint must return an audio asset');
  assert.strictEqual(typeof data.audio.storagePath, 'string', 'Audio asset must have storagePath');
  assert.ok(fs.existsSync(data.audio.storagePath), 'Sliced audio file must exist physically on disk');
  assert.ok(data.audio.duration >= 40 && data.audio.duration <= 42, 'Duration must accurately probe ~41s');
  assert.ok(data.audio.fileUrl.startsWith('/api/files/'), 'fileUrl must point to streamable /api/files route');
  console.log(`  ✓ Sliced audio created successfully: duration=${data.audio.duration}s, size=${data.audio.fileSize} bytes`);

  // 3. Verify Cache Hit
  const startTime = Date.now();
  const cachedRes = await fetch('http://localhost:3000/api/clipping-studio/bridge-caption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clipId: 'clip_integration_test_41s',
      clipName: '1-Minute Mind Control Test',
      startMs: 0,
      endMs: 41000,
      durationMs: 41000,
      projectId,
      sourceFilename: mediaFilename,
      hasVideo: false,
    }),
  });
  const cachedData = await cachedRes.json();
  const duration = Date.now() - startTime;
  assert.ok(cachedData.success, 'Cached request must succeed');
  assert.ok(duration < 500, `Cached response should return almost instantly (<500ms), took ${duration}ms`);
  console.log(`  ✓ Fast boundary cache hit validated in ${duration}ms`);

  // 4. Verify createCaptionProjectFromClip creates a full valid CaptionProject
  const candidateAdapter: any = {
    id: 'clip_integration_test_41s',
    title: cachedData.titleHindi || cachedData.titleEnglish || '1-Minute Mind Control Test',
    titleHindi: cachedData.titleHindi,
    titleEnglish: cachedData.titleEnglish,
    start: 0,
    end: 41,
    duration: data.audio.duration,
    transcriptWords: [],
    score: 95,
  };

  const projectAdapter: any = {
    id: projectId,
    title: 'Test Clipping Project',
    localVideoPath: sourcePath,
    originalFileName: mediaFilename,
  };

  const audioOverride: any = {
    audioUrl: data.audio.fileUrl,
    storagePath: data.audio.storagePath,
    duration: data.audio.duration,
    fileSize: data.audio.fileSize,
    fileName: data.audio.fileName,
    syncedSegments: cachedData.syncedSegments || undefined,
    titleHindi: cachedData.titleHindi || undefined,
    titleEnglish: cachedData.titleEnglish || undefined,
    isAudioSynced: Boolean(cachedData.isAudioSynced),
  };

  const captionProj = createCaptionProjectFromClip(
    candidateAdapter,
    projectAdapter,
    'hi',
    audioOverride
  );

  assert.ok(captionProj.id.startsWith('reel_'), 'Project id must be prefixed with reel_');
  assert.strictEqual(captionProj.audio?.fileUrl, data.audio.fileUrl, 'Audio fileUrl must match bridged asset');
  assert.strictEqual(captionProj.audio?.storagePath, data.audio.storagePath, 'Audio storagePath must match bridged asset');
  assert.strictEqual(captionProj.audio?.duration, data.audio.duration, 'Audio duration must match probed duration');
  assert.strictEqual(captionProj.preferredLanguage, 'hi', 'Preferred language must be hi');
  console.log('  ✓ CaptionProject successfully constructed with valid audio asset & duration');

  // 5. Verify byte range streamability via /api/files
  const streamRes = await fetch(`http://localhost:3000${data.audio.fileUrl}`, {
    method: 'HEAD',
  });
  assert.ok(streamRes.status === 200 || streamRes.status === 206, `Stream route must return 200 or 206, got ${streamRes.status}`);
  console.log('  ✓ Audio file is accessible and streamable via /api/files route');

  console.log('\n======================================================');
  console.log('📊 ALL CAPTION BRIDGE INTEGRATION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
