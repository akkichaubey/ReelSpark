/**
 * ReelSpark Smart Post Validator & Quality Scoring Engine
 *
 * Deterministic application-side validation against official platform limits.
 */

import { getPlatformConfig } from './platform-rules';
import { PostValidationReport, SocialPlatformKey, ValidationCheckResult, ValidationStatus } from './types';

export interface PostContentToValidate {
  title?: string;
  hook?: string;
  caption?: string;
  callToAction?: string;
  fullText?: string;
  hashtags?: string[];
  platform: SocialPlatformKey | string;
  contentType?: string;
  includedLinks?: { platform: SocialPlatformKey; url: string; displayName?: string }[];
}

export function validateSocialPost(content: PostContentToValidate): PostValidationReport {
  const platformKey = (content.platform || 'instagram').toLowerCase() as SocialPlatformKey;
  const config = getPlatformConfig(platformKey);

  const fullText = (content.fullText || `${content.hook || ''}\n\n${content.caption || ''}\n\n${content.callToAction || ''}`).trim();
  const characterCount = fullText.length;
  const characterLimit = config.characterLimits.maxTotal;

  // Extract hashtags from fullText or use provided hashtags array
  const extractedHashtags = fullText.match(/#[a-zA-Z0-9_\u0900-\u097F]+/g) || [];
  const hashtags = content.hashtags && content.hashtags.length > 0 ? content.hashtags : extractedHashtags;
  const hashtagCount = hashtags.length;
  const hashtagLimit = config.hashtagRules.maxAllowed;

  const checks: ValidationCheckResult[] = [];

  // 1. Mandatory Character Limit Check
  if (characterCount > characterLimit) {
    checks.push({
      id: 'char_limit_exceeded',
      name: 'Character Limit',
      status: 'error',
      severity: 'mandatory',
      message: `Post length (${characterCount} chars) exceeds ${config.name}'s verified limit of ${characterLimit} characters.`,
      currentValue: characterCount,
      limitValue: characterLimit,
    });
  } else if (characterCount > characterLimit * 0.95) {
    checks.push({
      id: 'char_limit_near',
      name: 'Character Limit',
      status: 'warning',
      severity: 'recommended_best_practice',
      message: `Post length is very close to ${config.name}'s limit (${characterCount}/${characterLimit}).`,
      currentValue: characterCount,
      limitValue: characterLimit,
    });
  } else {
    checks.push({
      id: 'char_limit_ok',
      name: 'Character Limit',
      status: 'pass',
      severity: 'mandatory',
      message: `Character count (${characterCount}/${characterLimit}) is compliant with ${config.name}.`,
      currentValue: characterCount,
      limitValue: characterLimit,
    });
  }

  // 2. YouTube Specific Title Limit Check
  if (platformKey === 'youtube' && content.title) {
    const titleLen = content.title.trim().length;
    if (titleLen > 100) {
      checks.push({
        id: 'yt_title_exceeded',
        name: 'Video Title Limit',
        status: 'error',
        severity: 'mandatory',
        message: `YouTube title (${titleLen} chars) exceeds the maximum allowed 100 characters.`,
        currentValue: titleLen,
        limitValue: 100,
      });
    } else {
      checks.push({
        id: 'yt_title_ok',
        name: 'Video Title Limit',
        status: 'pass',
        severity: 'mandatory',
        message: `YouTube title length (${titleLen}/100) is valid.`,
        currentValue: titleLen,
        limitValue: 100,
      });
    }
  }

  // 3. Hashtag Count Check
  if (hashtagCount > hashtagLimit) {
    checks.push({
      id: 'hashtag_limit_exceeded',
      name: 'Hashtag Limit',
      status: 'error',
      severity: 'platform_policy',
      message: `Contains ${hashtagCount} hashtags, exceeding ${config.name}'s limit of ${hashtagLimit}.`,
      currentValue: hashtagCount,
      limitValue: hashtagLimit,
    });
  } else if (hashtagCount > config.hashtagRules.recommendedMax) {
    checks.push({
      id: 'hashtag_over_recommended',
      name: 'Hashtag Optimization',
      status: 'warning',
      severity: 'recommended_best_practice',
      message: `${config.name} recommends ${config.hashtagRules.recommendedMin}-${config.hashtagRules.recommendedMax} hashtags for optimal engagement (currently ${hashtagCount}).`,
      currentValue: hashtagCount,
      limitValue: config.hashtagRules.recommendedMax,
    });
  } else if (hashtagCount >= config.hashtagRules.recommendedMin) {
    checks.push({
      id: 'hashtag_ok',
      name: 'Hashtag Optimization',
      status: 'pass',
      severity: 'recommended_best_practice',
      message: `Optimal hashtag count (${hashtagCount} tags) for ${config.name}.`,
      currentValue: hashtagCount,
      limitValue: hashtagLimit,
    });
  }

  // 4. Target Platform Own Link Check (Default exclusion verification)
  const includedLinks = (content.includedLinks || []).map((l) => ({
    ...l,
    isTargetPlatform: l.platform === platformKey,
  }));

  const targetLinkDetected = includedLinks.find((l) => l.isTargetPlatform);
  if (targetLinkDetected) {
    checks.push({
      id: 'target_platform_link_warning',
      name: 'Target Platform Link Included',
      status: 'warning',
      severity: 'recommended_best_practice',
      message: `Included own ${config.name} profile link (${targetLinkDetected.url}) inside a ${config.name} post. Audience is already viewing your profile here.`,
      currentValue: targetLinkDetected.url,
    });
  } else {
    checks.push({
      id: 'target_platform_link_excluded',
      name: 'Target Platform Link Exclusion',
      status: 'pass',
      severity: 'recommended_best_practice',
      message: `Target platform (${config.name}) self-link cleanly excluded.`,
    });
  }

  // 5. Instagram Plain-Text Link Notice (Informational Guidance)
  if (platformKey === 'instagram' && includedLinks.length > 0) {
    checks.push({
      id: 'ig_plain_text_notice',
      name: 'Link Clickability Notice',
      status: 'pass',
      severity: 'optional_guidance',
      message: 'Notice: Instagram feed captions display URLs as unclickable text. Followers can copy or use your bio link.',
    });
  }

  // 6. Quality Score Calculation (Explainable, Transparent 0 - 100)
  // Length Score (0 - 40 pts)
  let lengthScore = 40;
  if (characterCount === 0) lengthScore = 0;
  else if (characterCount > characterLimit) lengthScore = 0;
  else if (characterCount < 20) lengthScore = 15;
  else if (characterCount > characterLimit * 0.95) lengthScore = 30;

  // Hook Score (0 - 20 pts)
  let hookScore = 20;
  const hookText = content.hook || fullText.split('\n')[0] || '';
  if (!hookText.trim()) hookScore = 0;
  else if (hookText.length < 10) hookScore = 10;
  else if (/[?!🔥⚠️💡]/.test(hookText)) hookScore = 20;

  // CTA Score (0 - 20 pts)
  let ctaScore = 20;
  const lowerText = fullText.toLowerCase();
  const hasCta =
    lowerText.includes('share') ||
    lowerText.includes('save') ||
    lowerText.includes('follow') ||
    lowerText.includes('comment') ||
    lowerText.includes('subscribe') ||
    lowerText.includes('link') ||
    lowerText.includes('👇');
  if (!hasCta) ctaScore = 5;

  // Hashtag Score (0 - 20 pts)
  let hashtagScore = 20;
  if (hashtagCount === 0) hashtagScore = 5;
  else if (hashtagCount > hashtagLimit) hashtagScore = 0;
  else if (hashtagCount > config.hashtagRules.recommendedMax) hashtagScore = 15;

  const qualityScore = Math.max(0, Math.min(100, lengthScore + hookScore + ctaScore + hashtagScore));

  // Determine overall status
  const hasErrors = checks.some((c) => c.status === 'error');
  const hasWarnings = checks.some((c) => c.status === 'warning');
  let status: ValidationStatus = 'ready';
  if (hasErrors) status = 'exceeds_limit';
  else if (hasWarnings || qualityScore < 75) status = 'needs_attention';

  return {
    status,
    qualityScore,
    scoreBreakdown: {
      lengthScore,
      hookScore,
      ctaScore,
      hashtagScore,
    },
    characterCount,
    characterLimit,
    hashtagCount,
    hashtagLimit,
    checks,
    includedLinks,
  };
}
