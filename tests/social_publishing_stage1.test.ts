import assert from 'assert';
import { encryptToken, decryptToken } from '../src/lib/social-intelligence/token-encryption';
import {
  saveOAuthConnection,
  getOAuthConnections,
  getOAuthConnection,
  deleteOAuthConnection,
  createPublishingJob,
  getPublishingJob,
  updatePublishedPlatformRecord,
  getPublishingHistory,
} from '../src/lib/social-intelligence/storage';
import { SocialPublishingJob, PublishedPlatformRecord } from '../src/lib/social-intelligence/publishing-types';

async function runStage1Tests() {
  console.log('\n======================================================');
  console.log('🚀 REELSPARK — SOCIAL PUBLISHING STAGE 1 TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Token Encryption & Decryption
  console.log('▶ Test 1: AES-256-GCM Token Encryption & Decryption');
  const rawToken = 'ya29.a0AfH6SMDh_fake_youtube_access_token_1234567890';
  const encrypted = encryptToken(rawToken);
  assert.notStrictEqual(encrypted, rawToken, 'Encrypted token must differ from plain text');
  assert.ok(encrypted.length > 20, 'Encrypted token must be a valid base64 payload');

  const decrypted = decryptToken(encrypted);
  assert.strictEqual(decrypted, rawToken, 'Decrypted token must exactly match original token');
  console.log('  ✓ Token encryption and decryption verified');

  // Test 2: OAuth Connection Persistence
  console.log('▶ Test 2: OAuth Connection Storage & Retrieval');
  const testUserId = `test_user_${Date.now()}`;
  const saveRes = await saveOAuthConnection({
    id: `oauth_${Date.now()}`,
    userId: testUserId,
    platform: 'youtube',
    platformUserId: 'UC123456789_channel',
    accountName: 'Tech Shorts Official',
    accountHandle: '@techshorts',
    avatarUrl: 'https://youtube.com/avatar.png',
    accessToken: encryptToken('yt_access_token_secret'),
    refreshToken: encryptToken('yt_refresh_token_secret'),
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    metadata: { channelId: 'UC123456789_channel', channelTitle: 'Tech Shorts Official' },
    status: 'connected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.ok(saveRes.success, 'OAuth connection must save successfully');

  const connections = await getOAuthConnections(testUserId);
  assert.strictEqual(connections.length, 1, 'Should find 1 connected OAuth account');
  assert.strictEqual(connections[0].platform, 'youtube');
  assert.strictEqual(connections[0].accountName, 'Tech Shorts Official');

  const fetchedConn = await getOAuthConnection(testUserId, 'youtube');
  assert.ok(fetchedConn, 'Should retrieve connection by platform');
  assert.strictEqual(decryptToken(fetchedConn!.accessToken), 'yt_access_token_secret');
  console.log('  ✓ OAuth connection persistence and token retrieval verified');

  // Test 3: Publishing Job Creation & Step Updates
  console.log('▶ Test 3: Multi-Platform Publishing Job Lifecycle');
  const jobId = `job_${Date.now()}`;
  const platformPost1: PublishedPlatformRecord = {
    id: `post_yt_${Date.now()}`,
    jobId,
    userId: testUserId,
    platform: 'youtube',
    postTitle: 'Top 5 AI Hacks in 2026 #Shorts',
    postCaption: 'Watch till the end for the best AI tool of 2026! 👇 #tech #ai #shorts',
    status: 'pending',
    progressPercent: 0,
    retryCount: 0,
    idempotencyKey: `idemp_${jobId}_youtube`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const platformPost2: PublishedPlatformRecord = {
    id: `post_ig_${Date.now()}`,
    jobId,
    userId: testUserId,
    platform: 'instagram',
    postCaption: 'Top 5 AI Hacks in 2026 🔥\n\nSave this reel for later! #reels #ai',
    status: 'pending',
    progressPercent: 0,
    retryCount: 0,
    idempotencyKey: `idemp_${jobId}_instagram`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const newJob: SocialPublishingJob = {
    id: jobId,
    userId: testUserId,
    videoPath: 'caption-maker/renders/user_123/proj_456/final.mp4',
    thumbnailPath: 'caption-maker/renders/user_123/proj_456/cover.png',
    videoMetadata: {
      durationSeconds: 45,
      width: 1080,
      height: 1920,
      fileSizeBytes: 15400000,
      title: 'Top 5 AI Hacks',
    },
    showOtherSocialProfiles: true,
    status: 'queued',
    platforms: [platformPost1, platformPost2],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const jobRes = await createPublishingJob(newJob);
  assert.ok(jobRes.success, 'Job should be created successfully');

  // Progress update for YouTube
  await updatePublishedPlatformRecord(platformPost1.id, {
    status: 'uploading',
    progressPercent: 65,
  });

  let jobState = await getPublishingJob(jobId, testUserId);
  assert.ok(jobState, 'Job must exist');
  assert.strictEqual(jobState!.status, 'in_progress', 'Job should be in_progress while uploading');

  // Finish publishing YouTube
  await updatePublishedPlatformRecord(platformPost1.id, {
    status: 'published',
    progressPercent: 100,
    platformPostId: 'dQw4w9WgXcQ',
    platformPostUrl: 'https://youtube.com/shorts/dQw4w9WgXcQ',
    publishedAt: new Date().toISOString(),
  });

  // Finish publishing Instagram
  await updatePublishedPlatformRecord(platformPost2.id, {
    status: 'published',
    progressPercent: 100,
    platformPostId: '17999888777666',
    platformPostUrl: 'https://instagram.com/reel/CxY987/',
    publishedAt: new Date().toISOString(),
  });

  jobState = await getPublishingJob(jobId, testUserId);
  assert.strictEqual(jobState!.status, 'completed', 'Job should mark completed when all targets publish');

  // History query
  const history = await getPublishingHistory(testUserId);
  assert.strictEqual(history.length, 1, 'Should find 1 job in user history');
  assert.strictEqual(history[0].platforms.length, 2, 'History job should contain both platforms');
  const ytPost = history[0].platforms.find((p) => p.platform === 'youtube');
  assert.strictEqual(ytPost?.platformPostUrl, 'https://youtube.com/shorts/dQw4w9WgXcQ');
  const igPost = history[0].platforms.find((p) => p.platform === 'instagram');
  assert.strictEqual(igPost?.platformPostUrl, 'https://instagram.com/reel/CxY987/');
  console.log('  ✓ Publishing job state transitions and history retrieval verified');

  // Cleanup OAuth
  await deleteOAuthConnection(testUserId, 'youtube');
  const postDelete = await getOAuthConnections(testUserId);
  assert.strictEqual(postDelete.length, 0, 'Connection must be cleanly deleted');
  console.log('  ✓ OAuth disconnection verified');

  console.log('\n======================================================');
  console.log('🎉 ALL SOCIAL PUBLISHING STAGE 1 TESTS PASSED!');
  console.log('======================================================\n');
}

runStage1Tests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
