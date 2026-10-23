import assert from 'assert';
import { POST } from '../src/app/api/caption-maker/generate-social/route';
import { getPlatformConfig } from '../src/lib/social-intelligence/platform-rules';
import { SocialPlatformKey } from '../src/lib/social-intelligence/types';

async function runPlatformGenerationTests() {
  const transcript = 'Most people wait for confidence before they start. Progress begins when you take the first small action today.';
  const platforms: SocialPlatformKey[] = ['instagram', 'youtube', 'threads', 'facebook'];

  for (const platform of platforms) {
    const response = await POST(new Request('http://localhost:3000/api/caption-maker/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        title: 'Start Before You Feel Ready',
        duration: 24,
        platform,
        contentType: platform === 'youtube' ? 'short' : 'post',
        language: 'en',
        includeLinks: false,
        userId: `platform_rules_${platform}`,
      }),
    }) as any);

    assert.strictEqual(response.status, 200, `${platform} generation must succeed`);
    const data = await response.json();
    const config = getPlatformConfig(platform);

    assert.ok(data.bundle.postTitle.length > 0, `${platform} must generate a title`);
    assert.ok(data.bundle.hashtags.length >= config.hashtagRules.recommendedMin, `${platform} needs enough hashtags`);
    assert.ok(data.bundle.hashtags.length <= config.hashtagRules.recommendedMax, `${platform} must respect its recommended hashtag maximum`);
    assert.strictEqual(new Set(data.bundle.hashtags.map((tag: string) => tag.toLowerCase())).size, data.bundle.hashtags.length, `${platform} hashtags must be unique`);
    assert.ok(data.bundle.variations.every((variation: { fullText: string }) => variation.fullText.length <= config.characterLimits.maxTotal), `${platform} variations must respect the character limit`);

    if (platform === 'youtube') {
      assert.ok(data.bundle.postTitle.length <= 100, 'YouTube title must be at most 100 characters');
    }
    if (platform === 'threads') {
      assert.ok(data.bundle.variations.every((variation: { fullText: string }) => variation.fullText.length <= 500), 'Threads variations must be at most 500 characters');
    }
    if (platform === 'instagram') {
      assert.ok(data.bundle.variations.every((variation: { fullText: string }) => !/https?:\/\//.test(variation.fullText)), 'Instagram copy must omit non-clickable URL lists');
    }

    console.log(`✓ ${platform}: title, hashtag range, and post limits verified`);
  }

  const styles = [
    'curiosity',
    'story',
    'quick_value',
    'hinglish',
    'debate',
    'trend',
    'educational',
    'comment_dm',
  ];

  for (const captionStyle of styles) {
    const response = await POST(new Request('http://localhost:3000/api/caption-maker/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        title: 'Start Before You Feel Ready',
        duration: 24,
        platform: 'instagram',
        contentType: 'reel',
        language: 'en',
        includeLinks: false,
        captionStyle,
        userId: `caption_style_${captionStyle}`,
      }),
    }) as any);

    assert.strictEqual(response.status, 200, `${captionStyle} generation must succeed`);
    const data = await response.json();
    assert.strictEqual(data.bundle.hooks.length, 3, `${captionStyle} must provide three hooks`);
    assert.ok(data.bundle.variations.every((variation: { fullText: string }) => variation.fullText.length <= getPlatformConfig('instagram').characterLimits.maxTotal), `${captionStyle} must respect Instagram's character limit`);
    assert.ok(data.bundle.variations.every((variation: { fullText: string }) => !/https?:\/\//.test(variation.fullText)), `${captionStyle} must omit non-clickable Instagram URLs`);

    if (captionStyle === 'comment_dm') {
      assert.ok(data.bundle.variations[0].fullText.includes('GUIDE'), 'Comment-to-DM style must include its keyword CTA');
    }
    if (captionStyle === 'quick_value') {
      assert.ok(data.bundle.variations[0].caption.includes('1)'), 'Quick Value style must use a scannable list');
    }

    console.log(`✓ ${captionStyle}: preset structure and Instagram limits verified`);
  }
}

runPlatformGenerationTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
