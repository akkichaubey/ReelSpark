import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  Clip,
  MediaAsset,
  ExportJob,
  ExportSourceMapping,
  formatFilenameTemplate,
} from '../src/lib/clipping-studio/contracts';
import {
  buildSingleClipExportFfmpegArgs,
  getCollisionSafeFilename,
  parseFfmpegProgress,
} from '../src/lib/clipping-studio/export-engine';

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('🚀 CLIPPING STUDIO — PHASE 4 AUTOMATED TESTS (EXPORT SYSTEM)');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // 1. Filename Template Formatter & Token Sanitization
  await test('Filename Engine: Formats templates with project, name, index, time, res and sanitizes unsafe chars', () => {
    const formatted = formatFilenameTemplate('{project}_{name}_{index}_{time}_{res}', {
      project: 'My Special Project / 2026!',
      name: 'Key Moment: The Hook?',
      index: 1,
      time: '00_01_30',
      res: '1080p',
    });

    assert.strictEqual(formatted, 'My_Special_Project_2026_Key_Moment_The_Hook_1_00_01_30_1080p');
    assert.ok(!formatted.includes('/'));
    assert.ok(!formatted.includes('?'));
    assert.ok(!formatted.includes('!'));
  });

  // 2. Collision-safe filename resolution
  await test('Collision Handling: Appends sequential index if file already exists on disk', () => {
    const tempDir = path.join(process.cwd(), 'storage', 'clipping-studio', 'test_collisions');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const baseName = 'export_test_collision';
    const filePath1 = path.join(tempDir, `${baseName}.mp4`);
    fs.writeFileSync(filePath1, 'dummy data');

    const res2 = getCollisionSafeFilename(tempDir, baseName, 'mp4');
    assert.strictEqual(res2.fileName, `${baseName}_1.mp4`);

    fs.writeFileSync(res2.fullPath, 'dummy data 2');
    const res3 = getCollisionSafeFilename(tempDir, baseName, 'mp4');
    assert.strictEqual(res3.fileName, `${baseName}_2.mp4`);

    // Clean up
    fs.unlinkSync(filePath1);
    fs.unlinkSync(res2.fullPath);
    fs.rmdirSync(tempDir);
  });

  // 3. Fast stream-copy single clip export args
  await test('Export Engine: Selects zero-transcoding lossless stream copy (-c copy) when source format matches', () => {
    const mockClip: Clip = {
      id: 'c1',
      projectId: 'p1',
      mediaAssetId: 'a1',
      name: 'Stream Copy Clip',
      startMs: 15000,
      endMs: 45000,
      durationMs: 30000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockAsset: MediaAsset = {
      id: 'a1',
      projectId: 'p1',
      filename: 'lecture.mp4',
      localPath: 'C:\\media\\lecture.mp4',
      fileSizeBytes: 5000000,
      metadata: {
        durationSeconds: 100,
        durationMs: 100000,
        sizeBytes: 5000000,
        formatName: 'mp4',
        aspectRatio: '16:9',
        hasVideo: true,
        hasAudio: true,
        width: 1920,
        height: 1080,
      },
      createdAt: new Date().toISOString(),
    };

    const args = buildSingleClipExportFfmpegArgs({
      clip: mockClip,
      mediaAsset: mockAsset,
      outputFormat: 'mp4',
      outputType: 'video_and_audio',
      qualityProfile: 'source',
      targetResolution: 'source',
      normalizeAudio: false,
      outputPath: 'C:\\exports\\clip1.mp4',
    });

    assert.ok(args.includes('-c') && args.includes('copy'));
    assert.ok(args.includes('-ss') && args.includes('15.000'));
    assert.ok(args.includes('-to') && args.includes('45.000'));
  });

  // 4. Audio-only and Video-only export streams
  await test('Export Engine: Emits appropriate stream flags for audio-only (-vn) and video-only (-an)', () => {
    const mockClip: Clip = {
      id: 'c2',
      projectId: 'p1',
      mediaAssetId: 'a1',
      name: 'Audio Extraction',
      startMs: 0,
      endMs: 60000,
      durationMs: 60000,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockAsset: MediaAsset = {
      id: 'a1',
      projectId: 'p1',
      filename: 'lecture.mp4',
      localPath: 'C:\\media\\lecture.mp4',
      fileSizeBytes: 5000000,
      metadata: {
        durationSeconds: 100,
        durationMs: 100000,
        sizeBytes: 5000000,
        formatName: 'mp4',
        aspectRatio: '16:9',
        hasVideo: true,
        hasAudio: true,
      },
      createdAt: new Date().toISOString(),
    };

    // Audio only MP3
    const audioArgs = buildSingleClipExportFfmpegArgs({
      clip: mockClip,
      mediaAsset: mockAsset,
      outputFormat: 'mp3',
      outputType: 'audio_only',
      qualityProfile: 'high',
      normalizeAudio: true,
      outputPath: 'C:\\exports\\audio.mp3',
    });
    assert.ok(audioArgs.includes('-vn'));
    assert.ok(audioArgs.includes('libmp3lame'));
    assert.ok(audioArgs.includes('-af')); // loudnorm

    // Video only MP4
    const videoArgs = buildSingleClipExportFfmpegArgs({
      clip: mockClip,
      mediaAsset: mockAsset,
      outputFormat: 'mp4',
      outputType: 'video_only',
      qualityProfile: 'high',
      outputPath: 'C:\\exports\\muted.mp4',
    });
    assert.ok(videoArgs.includes('-an'));
    assert.ok(videoArgs.includes('libx264'));
  });

  // 5. FFmpeg progress parser
  await test('FFmpeg Progress Parser: Parses time=HH:MM:SS.ss and out_time_ms into accurate 0-100 completion percentage', () => {
    const totalDurationMs = 60000; // 60s total

    // Chunk at 15 seconds (25%)
    const chunk1 = 'frame=  450 fps= 60 q=28.0 size=    1024kB time=00:00:15.00 bitrate= 559.2kbits/s speed=2.0x';
    const percent1 = parseFfmpegProgress(chunk1, totalDurationMs);
    assert.strictEqual(percent1, 25);

    // Chunk at 45 seconds (75%)
    const chunk2 = 'frame= 1350 fps= 60 q=28.0 size=    3072kB time=00:00:45.00 bitrate= 559.2kbits/s speed=2.0x';
    const percent2 = parseFfmpegProgress(chunk2, totalDurationMs);
    assert.strictEqual(percent2, 75);

    // Chunk using out_time_ms=60000000 (100%)
    const chunk3 = 'out_time_ms=60000000\nprogress=continue';
    const percent3 = parseFfmpegProgress(chunk3, totalDurationMs);
    assert.strictEqual(percent3, 100);
  });

  // 6. Provenance & Bidirectional Source Mapping
  await test('Source Mapping: Bidirectional tracing between exported job, contributing clips, and original media', () => {
    const exportJob: ExportJob = {
      id: 'job_rec_1',
      projectId: 'p1',
      jobType: 'merge_recipe',
      targetId: 'recipe_highlights',
      status: 'completed',
      progressPercent: 100,
      outputPath: 'C:\\exports\\highlights_final.mp4',
      sourceMappings: [
        { id: 's1', exportJobId: 'job_rec_1', clipId: 'clip_hook', sourceAssetId: 'asset_interview', startMs: 10000, endMs: 25000, sequenceIndex: 0 },
        { id: 's2', exportJobId: 'job_rec_1', clipId: 'clip_call_to_action', sourceAssetId: 'asset_interview', startMs: 180000, endMs: 195000, sequenceIndex: 1 },
      ],
      createdAt: new Date().toISOString(),
    };

    // Forward tracing: Exported file -> contributing clips
    assert.strictEqual(exportJob.sourceMappings.length, 2);
    assert.strictEqual(exportJob.sourceMappings[0].clipId, 'clip_hook');
    assert.strictEqual(exportJob.sourceMappings[1].clipId, 'clip_call_to_action');

    // Inverse tracing: Given a clip ID, find all dependent exports
    const allJobs = [exportJob];
    const findDependentJobs = (clipId: string) =>
      allJobs.filter((j) => j.sourceMappings.some((sm) => sm.clipId === clipId));

    const hookJobs = findDependentJobs('clip_hook');
    assert.strictEqual(hookJobs.length, 1);
    assert.strictEqual(hookJobs[0].id, 'job_rec_1');

    const unrelatedJobs = findDependentJobs('non_existent_clip');
    assert.strictEqual(unrelatedJobs.length, 0);
  });

  // 7. Local Media Service Standalone Daemon Health & Jobs endpoint check
  await test('Media Service Communication: Standalone daemon responds on 127.0.0.1:4000', async () => {
    try {
      const res = await fetch('http://127.0.0.1:4000/api/jobs');
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.jobs));
    } catch (err: any) {
      assert.fail(`Could not connect to media service daemon on 127.0.0.1:4000: ${err.message}`);
    }
  });

  console.log('\n======================================================');
  console.log(`📊 PHASE 4 TESTS: ${passed} / ${total} PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Fatal Phase 4 test failure:', err);
  process.exit(1);
});
