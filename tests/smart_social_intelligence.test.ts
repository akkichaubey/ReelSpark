import assert from 'assert';
import {
  normalizeSocialUrl,
  validatePlatformUrl,
  resolveEligibleSocialLinks,
  formatSocialLinksBlock,
} from '../src/lib/social-intelligence/link-engine';
import {
  PLATFORM_CONFIGS,
  getPlatformConfig,
  isRecognizedPlatform,
} from '../src/lib/social-intelligence/platform-rules';
import { validateSocialPost } from '../src/lib/social-intelligence/post-validator';
import {
  getUserProfile,
  saveUserProfile,
  getSocialAccounts,
  addSocialAccount,
  updateSocialAccount,
  deleteSocialAccount,
  getSocialLinkPreferences,
  saveSocialLinkPreferences,
  DEFAULT_LINK_PREFERENCES,
} from '../src/lib/social-intelligence/storage';
import { SocialAccount, SocialLinkPreferences } from '../src/lib/social-intelligence/types';

async function runSocialIntelligenceTests() {
  console.log('\n======================================================');
  console.log('🚀 REELSPARK — SMART SOCIAL INTELLIGENCE TEST SUITE');
  console.log('======================================================\n');

  const testUserId = `test_user_${Date.now()}`;

  // ─── SECTION 1: URL Normalization & Domain Validation ───────────────────────
  console.log('▶ Section 1: URL Normalization & Validation');

  // 1.1 Handles handles with @
  const igNorm = normalizeSocialUrl('@reelspark', 'instagram');
  assert.strictEqual(igNorm, 'https://instagram.com/reelspark', 'Must normalize @handle to full Instagram URL');

  // 1.2 Normalizes raw domains
  const ytNorm = normalizeSocialUrl('youtube.com/@reelspark_ai?si=xyz123&utm_source=twitter', 'youtube');
  assert.strictEqual(ytNorm, 'https://youtube.com/@reelspark_ai', 'Must add https and strip tracking query parameters');

  // 1.3 Validates correct domains
  const validYt = validatePlatformUrl('https://youtube.com/@osho_talks', 'youtube');
  assert.strictEqual(validYt.valid, true, 'Valid YouTube URL must pass');

  // Threads domain validation for both threads.net and threads.com
  const validThreadsNet = validatePlatformUrl('https://threads.net/@truevoiceclub', 'threads');
  assert.strictEqual(validThreadsNet.valid, true, 'Valid threads.net URL must pass');

  const validThreadsCom = validatePlatformUrl('https://www.threads.com/@truevoiceclub', 'threads');
  assert.strictEqual(validThreadsCom.valid, true, 'threads.com domain must pass for Threads');

  const threadsNorm = normalizeSocialUrl('https://www.threads.com/@truevoiceclub', 'threads');
  assert.strictEqual(threadsNorm, 'https://threads.net/@truevoiceclub', 'Must canonicalize threads.com to threads.net');

  const invalidYt = validatePlatformUrl('https://instagram.com/osho', 'youtube');
  assert.strictEqual(invalidYt.valid, false, 'Instagram domain must fail for YouTube platform');
  assert.ok(invalidYt.reason?.includes('does not match'), 'Must explain reason for rejection');

  console.log('  ✓ URL normalization & platform domain validation verified');

  // ─── SECTION 2: User Profile Integration ────────────────────────────────────
  console.log('▶ Section 2: User Profile Storage & Preferences');

  const profile = await getUserProfile(testUserId);
  assert.ok(profile, 'Should return base or default profile');

  const updatedProfile = await saveUserProfile(testUserId, {
    firstName: 'Dev',
    lastName: 'Creator',
    bio: 'Creating viral AI reels and educational shorts daily.',
    avatarUrl: 'https://reelspark.ai/avatar.png',
    preferences: {
      defaultPlatform: 'instagram',
      defaultTone: 'educational',
    },
  });

  assert.strictEqual(updatedProfile.firstName, 'Dev');
  assert.strictEqual(updatedProfile.lastName, 'Creator');
  assert.strictEqual(updatedProfile.preferences.defaultPlatform, 'instagram');

  const reloadedProfile = await getUserProfile(testUserId);
  assert.strictEqual(reloadedProfile?.firstName, 'Dev', 'Profile updates must persist across sessions');
  console.log('  ✓ User profile persistence & preferences verified');

  // ─── SECTION 3: Social Account Manager ──────────────────────────────────────
  console.log('▶ Section 3: Social Account Management (Add, Edit, Primary, Delete)');

  // 3.1 Add YouTube Account
  const addYt = await addSocialAccount(testUserId, {
    platform: 'youtube',
    accountUrl: 'https://youtube.com/@reelspark_official',
    displayName: 'ReelSpark YouTube Channel',
  });
  assert.strictEqual(addYt.success, true);
  assert.ok(addYt.account?.isPrimary, 'First account for a platform must be primary by default');
  const ytAccountId = addYt.account!.id;

  // 3.2 Add Instagram Account
  const addIg = await addSocialAccount(testUserId, {
    platform: 'instagram',
    accountUrl: 'https://instagram.com/reelspark_ai',
    displayName: 'ReelSpark Instagram',
  });
  assert.strictEqual(addIg.success, true);
  const igAccountId = addIg.account!.id;

  // 3.3 Add Second YouTube Account (Multi-Account Test)
  const addYt2 = await addSocialAccount(testUserId, {
    platform: 'youtube',
    accountUrl: 'https://youtube.com/@reelspark_hindi',
    displayName: 'ReelSpark Hindi',
    isPrimary: true, // Should demote first account
  });
  assert.strictEqual(addYt2.success, true);
  assert.strictEqual(addYt2.account?.isPrimary, true);

  // Verify first YouTube account is no longer primary
  const accountsAfter = await getSocialAccounts(testUserId);
  const yt1 = accountsAfter.find((a) => a.id === ytAccountId);
  assert.strictEqual(yt1?.isPrimary, false, 'Old account must not be primary after new primary is designated');

  // 3.4 Duplicate Account Detection
  const addDup = await addSocialAccount(testUserId, {
    platform: 'instagram',
    accountUrl: 'https://instagram.com/reelspark_ai?utm_source=test', // Same after normalization
  });
  assert.strictEqual(addDup.success, false, 'Duplicate URL must be rejected');
  assert.ok(addDup.error?.includes('already added'));

  // 3.5 Add Threads and Website
  await addSocialAccount(testUserId, {
    platform: 'threads',
    accountUrl: 'https://threads.net/@reelspark_ai',
  });

  // Duplicate Threads variations (www, .com, trailing slash)
  const addDupThreadsCom = await addSocialAccount(testUserId, {
    platform: 'threads',
    accountUrl: 'https://www.threads.com/@reelspark_ai',
  });
  assert.strictEqual(addDupThreadsCom.success, false, 'threads.com duplicate must be rejected');
  assert.ok(addDupThreadsCom.error?.includes('already added'));

  const addDupThreadsSlash = await addSocialAccount(testUserId, {
    platform: 'threads',
    accountUrl: 'https://www.threads.net/@reelspark_ai/',
  });
  assert.strictEqual(addDupThreadsSlash.success, false, 'www.threads.net trailing slash duplicate must be rejected');
  assert.ok(addDupThreadsSlash.error?.includes('already added'));

  await addSocialAccount(testUserId, {
    platform: 'website',
    accountUrl: 'https://reelspark.ai',
    displayName: 'Official Studio',
  });

  const allAccounts = await getSocialAccounts(testUserId);
  assert.strictEqual(allAccounts.length, 5, 'Should have 5 accounts stored');
  console.log('  ✓ Multi-account management, primary designation & duplicate detection verified');

  // ─── SECTION 4: Intelligent Social Link Engine & Target Exclusion ───────────
  console.log('▶ Section 4: Deterministic Social Link Engine (Target Exclusion & Filtering)');

  const prefs = await getSocialLinkPreferences(testUserId);
  assert.strictEqual(prefs.excludeTargetPlatform, true, 'Target platform must be excluded by default');

  // Case 4.1: Target is YouTube -> YouTube accounts must be excluded!
  const linksForYouTube = resolveEligibleSocialLinks(allAccounts, prefs, 'youtube');
  const ytIncluded = linksForYouTube.some((l) => l.account.platform === 'youtube');
  assert.strictEqual(ytIncluded, false, 'Target platform (YouTube) self-link must be excluded by default');
  const igIncludedInYt = linksForYouTube.some((l) => l.account.platform === 'instagram');
  assert.strictEqual(igIncludedInYt, true, 'Instagram link must be included in YouTube post');
  const webIncludedInYt = linksForYouTube.some((l) => l.account.platform === 'website');
  assert.strictEqual(webIncludedInYt, true, 'Website link must be included');

  // Case 4.2: Target is Instagram -> Instagram link must be excluded!
  const linksForInstagram = resolveEligibleSocialLinks(allAccounts, prefs, 'instagram');
  const igIncludedInIg = linksForInstagram.some((l) => l.account.platform === 'instagram');
  assert.strictEqual(igIncludedInIg, false, 'Target platform (Instagram) self-link must be excluded by default');
  const ytIncludedInIg = linksForInstagram.some((l) => l.account.platform === 'youtube');
  assert.strictEqual(ytIncludedInIg, true, 'YouTube link must be included in Instagram post');

  // Case 4.3: Multi-Account resolution -> Primary YouTube account must be selected
  const chosenYt = linksForInstagram.find((l) => l.account.platform === 'youtube');
  assert.strictEqual(chosenYt?.account.accountUrl, 'https://youtube.com/@reelspark_hindi', 'Primary account must be picked');

  // Case 4.4: Disable an account -> must be excluded from links
  await updateSocialAccount(testUserId, igAccountId, { enabled: false });
  const accountsWithDisabled = await getSocialAccounts(testUserId);
  const linksAfterDisable = resolveEligibleSocialLinks(accountsWithDisabled, prefs, 'youtube');
  const disabledIgPresent = linksAfterDisable.some((l) => l.account.id === igAccountId);
  assert.strictEqual(disabledIgPresent, false, 'Disabled account must be excluded');

  // Case 4.5: Format social links block
  const block = formatSocialLinksBlock(linksForYouTube, prefs);
  assert.ok(block.includes('🔗 Connect with us:'), 'Must include custom heading');
  assert.ok(block.includes('https://instagram.com/reelspark_ai'), 'Must include eligible formatted link');
  console.log('  ✓ Deterministic target platform exclusion and link formatting verified');

  // ─── SECTION 5: Platform Intelligence Engine Rules ──────────────────────────
  console.log('▶ Section 5: Platform Intelligence Engine Specifications');

  // 5.1 Instagram
  const igConfig = getPlatformConfig('instagram');
  assert.strictEqual(igConfig.characterLimits.maxTotal, 2200);
  assert.strictEqual(igConfig.hashtagRules.maxAllowed, 30);
  assert.strictEqual(igConfig.linkCapabilities.clickableInCaption, false);

  // 5.2 YouTube
  const ytConfig = getPlatformConfig('youtube');
  assert.strictEqual(ytConfig.characterLimits.maxTotal, 5000);
  assert.strictEqual(ytConfig.characterLimits.titleMax, 100);
  assert.strictEqual(ytConfig.hashtagRules.maxAllowed, 60);
  assert.strictEqual(ytConfig.mediaRecommendations.maxDurationSeconds, 180);
  assert.strictEqual(ytConfig.linkCapabilities.clickableInCaption, true);

  // 5.3 Threads
  const threadsConfig = getPlatformConfig('threads');
  assert.strictEqual(threadsConfig.characterLimits.maxTotal, 500, 'Threads must enforce 500-char limit');

  // 5.4 Facebook
  const fbConfig = getPlatformConfig('facebook');
  assert.strictEqual(fbConfig.characterLimits.maxTotal, 63206);

  console.log('  ✓ Checked configured reference limits for Instagram, YouTube, Threads, and Facebook');

  // ─── SECTION 6: Post Validation & Quality Scoring ───────────────────────────
  console.log('▶ Section 6: Smart Post Validation & Quality Scoring Engine');

  // 6.1 Valid compliant Instagram post
  const validReport = validateSocialPost({
    title: 'Mindset of Winners',
    hook: '🔥 Stop scrolling if you want to win!',
    caption: 'Success comes to those who prepare today. Work in silence and let your results make the noise.',
    callToAction: 'Save this reel and share with someone who needs this! 👇',
    hashtags: ['#mindset', '#success', '#viralreels', '#growth'],
    platform: 'instagram',
    includedLinks: [{ platform: 'youtube', url: 'https://youtube.com/@reelspark' }],
  });
  assert.strictEqual(validReport.status, 'ready');
  assert.ok(validReport.qualityScore >= 80, 'High quality compliant post should score >= 80');
  assert.strictEqual(validReport.hashtagCount, 4);
  assert.strictEqual(validReport.characterLimit, 2200);

  // 6.2 Over-limit Threads post (Must fail with exceeds_limit)
  const longThreadsText = 'A'.repeat(550);
  const threadsReport = validateSocialPost({
    fullText: longThreadsText,
    platform: 'threads',
  });
  assert.strictEqual(threadsReport.status, 'exceeds_limit', 'Threads text over 500 chars must fail');
  assert.strictEqual(threadsReport.scoreBreakdown.lengthScore, 0);

  // 6.3 Target platform link inclusion warning
  const warningReport = validateSocialPost({
    fullText: 'Check out my YouTube short! Link: https://youtube.com/@reelspark',
    platform: 'youtube',
    includedLinks: [{ platform: 'youtube', url: 'https://youtube.com/@reelspark' }],
  });
  const targetCheck = warningReport.checks.find((c) => c.id === 'target_platform_link_warning');
  assert.ok(targetCheck, 'Must detect and warn if target platform profile link is self-referenced');

  console.log('  ✓ Explainable quality score (0-100) and multi-platform validation verified');

  // Clean up test account
  await deleteSocialAccount(testUserId, ytAccountId);
  await deleteSocialAccount(testUserId, igAccountId);

  console.log('\n======================================================');
  console.log('🎉 ALL SMART SOCIAL INTELLIGENCE TESTS PASSED CLEANLY!');
  console.log('======================================================\n');
}

runSocialIntelligenceTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
