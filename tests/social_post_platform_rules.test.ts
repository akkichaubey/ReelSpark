import assert from 'assert';
import { POST } from '../src/app/api/caption-maker/generate-social/route';
import { getPlatformConfig } from '../src/lib/social-intelligence/platform-rules';
import { SocialPlatformKey } from '../src/lib/social-intelligence/types';

const originalFetch = globalThis.fetch;
const originalDemoLogin = process.env.ALLOW_DEMO_LOGIN;

async function runPlatformGenerationTests() {
  process.env.ALLOW_DEMO_LOGIN = 'true';
  // Exercise fallback behavior deterministically, even when a local model is online.
  globalThis.fetch = async () => { throw new Error('Simulated offline model'); };
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
      assert.ok(data.bundle.variations[0].caption.includes('\n2)'), 'Quick Value style must preserve list line breaks');
      assert.ok(data.bundle.variations[0].fullText.includes('\n2)'), 'Copied post must preserve list line breaks');
    }

    console.log(`✓ ${captionStyle}: preset structure and Instagram limits verified`);
  }

  const aiCaption = '1) Start with one small action\n2) Build confidence through progress';
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.ok(request.system.includes('Quick Value List'), 'Selected style must reach the AI prompt');
    return Response.json({ response: JSON.stringify({
      postTitle: 'Confidence Starts With Action',
      hooks: ['Confidence follows action.', 'Start small today.', 'Progress builds belief.'],
      description: aiCaption,
      callToAction: 'Save this reminder.',
      hashtags: ['#confidence', '#progress', '#action', '#mindset', '#growth'],
      variations: ['Confidence follows action.', 'Start small today.', 'Progress builds belief.'].map((hook) => ({
        title: 'Quick Value', hook, caption: aiCaption, callToAction: 'Save this reminder.', fullText: '',
      })),
    }) });
  };
  const aiResponse = await POST(new Request('http://localhost:3000/api/caption-maker/generate-social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, platform: 'instagram', captionStyle: 'quick_value', includeLinks: false }),
  }) as any);
  const aiData = await aiResponse.json();
  assert.strictEqual(aiData.source, 'ollama_ai', 'Valid AI response must use AI generation');
  assert.strictEqual(aiData.bundle.hooks[0], 'Confidence follows action.', 'Preserve the AI-generated hook');
  assert.strictEqual(aiData.bundle.variations[0].caption, aiCaption, 'Preserve AI copy and list formatting');
  console.log('✓ AI style instructions and generated copy preservation verified');

  const previousNodeEnv = process.env.NODE_ENV;
  const previousDemoLogin = process.env.ALLOW_DEMO_LOGIN;
  try {
    Object.assign(process.env, { NODE_ENV: 'production', ALLOW_DEMO_LOGIN: 'false' });
    const unauthorized = await POST(new Request('http://localhost:3000/api/caption-maker/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, userId: 'usr_admin', platform: 'instagram' }),
    }) as any);
    assert.strictEqual(unauthorized.status, 401, 'A supplied userId must not bypass production session authentication');
    console.log('✓ Production generation rejects unauthenticated userId impersonation');
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    if (previousDemoLogin === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = previousDemoLogin;
  }
}

runPlatformGenerationTests().finally(() => {
  globalThis.fetch = originalFetch;
  if (originalDemoLogin === undefined) delete process.env.ALLOW_DEMO_LOGIN;
  else process.env.ALLOW_DEMO_LOGIN = originalDemoLogin;
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
