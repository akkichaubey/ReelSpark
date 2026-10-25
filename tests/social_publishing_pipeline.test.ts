import { execFileSync } from 'node:child_process';
import { getFfmpegPath } from '../src/lib/config';
import { mediaUserNamespace } from '../src/lib/media-access';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '../src/lib/config';
import { validateVideoForPlatform, validateVideoForAllPlatforms } from '../src/lib/social-intelligence/video-validator';
import { dispatchPublishingJob } from '../src/lib/social-intelligence/publisher-dispatcher';
import { saveOAuthConnection, getPublishingJob } from '../src/lib/social-intelligence/storage';
import { encryptToken } from '../src/lib/social-intelligence/token-encryption';

async function runPipelineTests() {
  Object.assign(process.env, { NODE_ENV: 'test' });
  console.log('\n======================================================');
  console.log('🚀 REELSPARK — PUBLISHING PIPELINE & VALIDATOR TESTS');
  console.log('======================================================\n');

  // 1. Video Specifications Validator
  console.log('▶ Test 1: Video Specifications Validator');
  // Compatible 45s 9:16 Reel
  const validReel = {
    durationSeconds: 45,
    width: 1080,
    height: 1920,
    fileSizeBytes: 20 * 1024 * 1024,
  };
  const igVal = validateVideoForPlatform('instagram', validReel);
  assert.ok(igVal.isCompatible, '45s vertical video must be compatible with Instagram');
  assert.strictEqual(igVal.errors.length, 0);

  // Incompatible video (120s Reel exceeds 90s limit for Instagram & Facebook)
  const tooLongReel = {
    durationSeconds: 120,
    width: 1080,
    height: 1920,
    fileSizeBytes: 35 * 1024 * 1024,
  };
  const igTooLong = validateVideoForPlatform('instagram', tooLongReel);
  assert.strictEqual(igTooLong.isCompatible, false, '120s Reel must fail Instagram 90s limit');
  assert.ok(igTooLong.errors.some((e) => e.includes('exceeds instagram\'s limit')));

  // YouTube Shorts allows up to 180s (3 min)
  const ytVal = validateVideoForPlatform('youtube', tooLongReel);
  assert.ok(ytVal.isCompatible, '120s video must pass YouTube Shorts 180s limit');

  // Multi-platform batch validation
  const allSpecs = validateVideoForAllPlatforms(['youtube', 'instagram', 'facebook', 'threads'], validReel);
  assert.ok(allSpecs.youtube.isCompatible);
  assert.ok(allSpecs.instagram.isCompatible);
  assert.ok(allSpecs.facebook.isCompatible);
  assert.ok(allSpecs.threads.isCompatible);
  console.log('  ✓ Video specification validator across all 4 platforms verified');

  // 2. Multi-Platform Publishing Dispatcher
  console.log('▶ Test 2: Multi-Platform Publishing Dispatcher & Error Isolation');
  const testUserId = `pipe_user_${Date.now()}`;

  // Setup mock connected accounts for YouTube and Threads
  await saveOAuthConnection({
    id: `oauth_yt_${testUserId}`,
    userId: testUserId,
    platform: 'youtube',
    platformUserId: 'UC_mock_yt',
    accountName: 'Tech AI Creator',
    accessToken: encryptToken('mock_token_yt'),
    scope: 'youtube.upload',
    metadata: {},
    status: 'connected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await saveOAuthConnection({
    id: `oauth_th_${testUserId}`,
    userId: testUserId,
    platform: 'threads',
    platformUserId: 'th_mock_id',
    accountName: 'tech_threads',
    accessToken: encryptToken('mock_token_threads'),
    scope: 'threads_content_publish',
    metadata: {},
    status: 'connected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create temporary test dummy video file
  const testVideoRel = 'caption-maker/renders/' + mediaUserNamespace(testUserId) + '/proj_1/video_final.mp4';
  const testVideoAbs = path.join(APP_CONFIG.storageRoot, testVideoRel);
  fs.mkdirSync(path.dirname(testVideoAbs), { recursive: true });
  execFileSync(getFfmpegPath(), ['-y','-f','lavfi','-i','color=c=black:s=180x320:r=10','-t','3','-c:v','libx264','-pix_fmt','yuv420p',testVideoAbs], {stdio:'ignore'});

  const job = await dispatchPublishingJob(testUserId, 'http://localhost:3000', {
    videoPath: testVideoRel,
    selectedPlatforms: ['youtube', 'threads'],
    defaultCaption: 'Exciting AI announcement in 2026! 🔥 Check it out #AI #tech',
    defaultTitle: 'Exciting AI Announcement',
    showOtherSocialProfiles: true,
  });

  assert.ok(job.id, 'Job ID must be generated');
  assert.strictEqual(job.platforms.length, 2, 'Should create 2 platform records');
  assert.strictEqual(job.status, 'in_progress');

  // Wait 1.5s for mock background publisher simulation to settle
  for (let i = 0; i < 100; i++) {
    if ((await getPublishingJob(job.id, testUserId))?.status === 'completed') break;
    await new Promise(r => setTimeout(r, 100));
  }

  const completedJob = await getPublishingJob(job.id, testUserId);
  assert.ok(completedJob, 'Job must exist');
  assert.strictEqual(completedJob!.status, 'completed', 'Job should mark completed');

  const ytRec = completedJob!.platforms.find((p) => p.platform === 'youtube');
  assert.strictEqual(ytRec?.status, 'published');
  assert.ok(ytRec?.platformPostUrl?.includes('youtube.com/shorts/'));

  const thRec = completedJob!.platforms.find((p) => p.platform === 'threads');
  assert.strictEqual(thRec?.status, 'published');
  assert.ok(thRec?.platformPostUrl?.includes('threads.net/'));

  console.log('  ✓ End-to-end async publishing dispatcher simulation verified');

  console.log('\n======================================================');
  console.log('🎉 ALL PUBLISHING PIPELINE TESTS PASSED CLEANLY!');
  console.log('======================================================\n');
}

runPipelineTests().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
