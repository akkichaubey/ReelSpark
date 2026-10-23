import { NextRequest, NextResponse } from 'next/server';
import { generateWithOllama } from '@/lib/ollama';
import { getOllamaModel } from '@/lib/config';
import { validateSession } from '@/lib/auth';
import {
  getSocialAccounts,
  getSocialLinkPreferences,
} from '@/lib/social-intelligence/storage';
import {
  resolveEligibleSocialLinks,
  formatSocialLinksBlock,
} from '@/lib/social-intelligence/link-engine';
import { validateSocialPost } from '@/lib/social-intelligence/post-validator';
import { getPlatformConfig } from '@/lib/social-intelligence/platform-rules';
import { SocialPlatformKey, PlatformContentType } from '@/lib/social-intelligence/types';

export interface SocialPostBundle {
  hooks: string[];
  description: string;
  callToAction: string;
  hashtags: string[];
  variations: {
    title: string;
    hook: string;
    caption: string;
    callToAction: string;
    fullText: string;
  }[];
}

export type ContentTone =
  | 'motivational'
  | 'educational'
  | 'storytelling'
  | 'funny'
  | 'emotional'
  | 'professional';

export type SocialPlatform = 'all' | 'instagram' | 'youtube' | 'facebook' | 'threads' | 'tiktok';

/**
 * Fallback heuristic generator in case Ollama is offline or network error occurs.
 */
function generateFallbackSocialBundle(
  transcript: string,
  title: string | undefined,
  language: 'en' | 'hi' | 'hinglish',
  tone: ContentTone
): SocialPostBundle {
  const cleanTranscript = (transcript || '').trim();
  const firstSentence = cleanTranscript.split(/[.!?।\n]/)[0] || cleanTranscript.substring(0, 80);

  if (language === 'hi') {
    const hooks = [
      `🔥 क्या आप भी यही सोचते हैं? सच आपको हैरान कर देगा!`,
      `⚠️ इस 1 बात को कभी मत भूलना: "${firstSentence.substring(0, 60)}..."`,
      `💡 जो लोग सच में आगे बढ़ना चाहते हैं, वो इसे ज़रूर सुनें!`,
    ];
    const description = `${title ? title + ' — ' : ''}${firstSentence}। ज़िंदगी में बदलाव लाने के लिए यह सीख बहुत ज़रूरी है।`;
    const callToAction = `👉 अगर यह बात आपको अच्छी लगी तो इस रील को Save करें और अपने दोस्तों के साथ Share ज़रूर करें!`;
    const hashtags = [
      '#shorts',
      '#viralreels',
      '#hindiquotes',
      '#motivationhindi',
      '#lifeadvice',
      '#reelsindia',
      '#trendingreels',
      '#gyan',
      '#mindset',
      '#inspiration',
      '#viralhindi',
      '#explorepage',
    ];

    return {
      hooks,
      description,
      callToAction,
      hashtags,
      variations: [
        {
          title: 'Viral Hook & Engagement',
          hook: hooks[0],
          caption: description,
          callToAction,
          fullText: `${hooks[0]}\n\n${description}\n\n${callToAction}\n\n${hashtags.join(' ')}`,
        },
        {
          title: 'Short & Punchy',
          hook: hooks[1],
          caption: `${firstSentence}।`,
          callToAction: 'Follow for more daily wisdom! 👇',
          fullText: `${hooks[1]}\n\n${firstSentence}।\n\nFollow for more daily wisdom! 👇\n\n${hashtags.slice(0, 8).join(' ')}`,
        },
        {
          title: 'Deep & Reflective',
          hook: hooks[2],
          caption: `${cleanTranscript.substring(0, 200)}...`,
          callToAction: 'Comment your thoughts below 💬',
          fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\nComment your thoughts below 💬\n\n${hashtags.join(' ')}`,
        },
      ],
    };
  }

  if (language === 'hinglish') {
    const hooks = [
      `🔥 Stop scrolling agar aap bhi ye galti kar rahe ho!`,
      `💡 99% log ye baat nahi samajhte: "${firstSentence.substring(0, 60)}..."`,
      `⚠️ Ye 30 seconds aapka mindset change kar denge!`,
    ];
    const description = `${title ? title + ' — ' : ''}${firstSentence}. Ye lesson zindagi me bohot kaam aayega agar apply karoge toh.`;
    const callToAction = `👉 Agar relate kar pa rahe ho toh abhi Save karo aur apne best friend ke sath Share karo!`;
    const hashtags = [
      '#shorts',
      '#viralreels',
      '#reelsindia',
      '#desimotivation',
      '#mindsetmatters',
      '#trendingaudio',
      '#instagramgrowth',
      '#hinglishquotes',
      '#lifehacks',
      '#creatorlife',
      '#dailymotivation',
    ];

    return {
      hooks,
      description,
      callToAction,
      hashtags,
      variations: [
        {
          title: 'Viral Hook & Engagement',
          hook: hooks[0],
          caption: description,
          callToAction,
          fullText: `${hooks[0]}\n\n${description}\n\n${callToAction}\n\n${hashtags.join(' ')}`,
        },
        {
          title: 'Short & Punchy',
          hook: hooks[1],
          caption: `${firstSentence}.`,
          callToAction: 'Save this reel right now! 📌',
          fullText: `${hooks[1]}\n\n${firstSentence}.\n\nSave this reel right now! 📌\n\n${hashtags.slice(0, 8).join(' ')}`,
        },
        {
          title: 'Deep & Reflective',
          hook: hooks[2],
          caption: `${cleanTranscript.substring(0, 200)}...`,
          callToAction: 'Tag someone who needs to hear this! 👥',
          fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\nTag someone who needs to hear this! 👥\n\n${hashtags.join(' ')}`,
        },
      ],
    };
  }

  // English fallback
  const hooks = [
    `🔥 The bitter truth nobody told you about success.`,
    `⚠️ Stop scrolling if you want to fix your focus: "${firstSentence.substring(0, 60)}..."`,
    `💡 Here's the 1 insight that completely changes everything.`,
  ];
  const description = `${title ? title + ' — ' : ''}${firstSentence}. This single perspective shift will save you years of trial and error.`;
  const callToAction = `👉 Save this reel for later and share it with someone who needs this today!`;
  const hashtags = [
    '#shorts',
    '#reels',
    '#mindset',
    '#motivation',
    '#wisdom',
    '#successquotes',
    '#productivity',
    '#personaldevelopment',
    '#lifeadvice',
    '#trendingreels',
    '#viralcontent',
    '#growthmindset',
  ];

  return {
    hooks,
    description,
    callToAction,
    hashtags,
    variations: [
      {
        title: 'Viral Hook & Engagement',
        hook: hooks[0],
        caption: description,
        callToAction,
        fullText: `${hooks[0]}\n\n${description}\n\n${callToAction}\n\n${hashtags.join(' ')}`,
      },
      {
        title: 'Short & Punchy',
        hook: hooks[1],
        caption: `${firstSentence}.`,
        callToAction: 'Save this for later! 📌',
        fullText: `${hooks[1]}\n\n${firstSentence}.\n\nSave this for later! 📌\n\n${hashtags.slice(0, 8).join(' ')}`,
      },
      {
        title: 'Deep & Reflective',
        hook: hooks[2],
        caption: `${cleanTranscript.substring(0, 200)}...`,
        callToAction: 'Drop a "100" in the comments if you agree! 💬',
        fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\nDrop a "100" in the comments if you agree! 💬\n\n${hashtags.join(' ')}`,
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transcript,
      title,
      duration,
      language = 'en',
      tone = 'motivational',
      platform = 'all',
      contentType = 'reel',
      includeLinks = true,
      explicitAccountId,
      model,
    } = body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'Transcript of the currently selected clip is required.' },
        { status: 400 }
      );
    }

    // Resolve authenticated user for profile & social account integration
    const cookieHeader = req.headers?.get?.('cookie');
    const token =
      req.cookies?.get?.('reelspark_session')?.value ||
      cookieHeader?.match(/reelspark_session=([^;]+)/)?.[1] ||
      req.headers?.get?.('authorization')?.replace('Bearer ', '');
    let user = token ? await validateSession(token) : null;
    if (!user && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_LOGIN === 'true')) {
      user = { id: body.userId || 'usr_admin', name: 'Administrator', email: 'admin@reelspark.ai', role: 'admin', createdAt: new Date().toISOString() };
    }

    const userId = user?.id || body.userId;
    const accounts = userId ? await getSocialAccounts(userId) : [];
    const preferences = userId ? await getSocialLinkPreferences(userId) : {
      userId: '',
      includeWebsite: true,
      includeOtherSocials: true,
      excludeTargetPlatform: true,
      customHeading: '🔗 Connect with us:',
      displaySeparateLines: true,
      linkOrder: [],
      eligibleAccountIds: [],
      updatedAt: new Date().toISOString(),
    };

    const eligibleLinks = resolveEligibleSocialLinks(
      accounts,
      preferences,
      platform,
      explicitAccountId
    );

    const linksBlock = includeLinks && eligibleLinks.length > 0
      ? formatSocialLinksBlock(eligibleLinks, preferences)
      : '';

    const cleanTranscript = transcript.trim();
    const cleanTitle = (title || 'Viral Reel').trim();
    const langKey = language === 'hi' ? 'hi' : language === 'hinglish' ? 'hinglish' : 'en';

    const langInstructions =
      langKey === 'hi'
        ? 'Generate all content strictly in clean Hindi (Devanagari script).'
        : langKey === 'hinglish'
        ? 'Generate all content in conversational Hinglish (Hindi written in Roman/English alphabet, popular on Instagram Reels in India).'
        : 'Generate all content in modern, compelling English.';

    const platformConfig = getPlatformConfig(platform);
    const charLimit = platformConfig.characterLimits.maxTotal;

    const systemPrompt = `You are an elite social media growth strategist, viral copywriter, and ${platformConfig.name} expert.
Your job is to generate high-converting post captions, viral opening hooks, call-to-actions, and hashtags based SOLELY on the provided clip transcript.

CRITICAL RULES:
1. ONLY use ideas and quotes present in the provided transcript. Do not fabricate unrelated facts.
2. Target Tone: ${tone.toUpperCase()}.
3. Target Platform: ${platformConfig.name} (${contentType.toUpperCase()}).
4. Target Language: ${langInstructions}
5. Character constraint: Keep content compliant with ${platformConfig.name}'s character limit of ${charLimit} chars.
6. Distinguish between SPOKEN subtitles (burned on screen) and SOCIAL POST CAPTIONS (text pasted in the description box).
7. Output MUST be valid JSON adhering strictly to the schema below. No markdown fences around the JSON.

Schema:
{
  "hooks": ["Catchy Opening Hook 1", "Contrarian Hook 2", "Curiosity Hook 3"],
  "description": "Engaging 2-3 sentence body paragraph summarizing the clip message and inviting comments",
  "callToAction": "Clear action prompt (e.g. Save, Share, Comment, Follow)",
  "hashtags": ["#tag1", "#tag2", "#tag3", "...up to 15 high-reach relevant hashtags"],
  "variations": [
    {
      "title": "Viral Hook & Engagement",
      "hook": "Selected strong hook",
      "caption": "Captivating body text",
      "callToAction": "Action prompt",
      "fullText": "Combined complete post text with hook, body, CTA, and hashtags"
    },
    {
      "title": "Short & Punchy",
      "hook": "Short bold statement",
      "caption": "One punchy sentence",
      "callToAction": "Quick prompt",
      "fullText": "Combined short post with 6-8 top hashtags"
    },
    {
      "title": "Storytelling & Value",
      "hook": "Relatable question or story opener",
      "caption": "Thoughtful breakdown of the insight",
      "callToAction": "Discussion question CTA",
      "fullText": "Complete storytelling post with all hashtags"
    }
  ]
}`;

    const userPrompt = `CLIP TITLE: ${cleanTitle}
CLIP DURATION: ${duration ? Math.round(duration) + ' seconds' : 'Short Reel (< 60s)'}
TARGET PLATFORM: ${platform}
CONTENT TYPE: ${contentType}
CLIP TRANSCRIPT:
"""
${cleanTranscript}
"""

Generate the complete viral social media post bundle now.`;

    const activeFixedHashtags = (preferences.fixedHashtags || [])
      .filter((h) => h.enabled)
      .map((h) => (h.tag.startsWith('#') ? h.tag : `#${h.tag}`));

    const attachEnhancementsToBundle = (bundle: SocialPostBundle): SocialPostBundle => {
      // Prepend user's fixed hashtags to the hashtags array without duplicates
      const mergedHashtags = [
        ...activeFixedHashtags,
        ...(bundle.hashtags || []).filter(
          (t) => !activeFixedHashtags.some((ft) => ft.toLowerCase() === t.toLowerCase())
        ),
      ];

      const oldTagsStr = (bundle.hashtags || []).join(' ');
      const newTagsStr = mergedHashtags.join(' ');

      const updatedVariations = bundle.variations.map((v) => {
        let text = v.fullText;

        // Replace old hashtags string with new hashtags string if present
        if (oldTagsStr && text.includes(oldTagsStr)) {
          text = text.replace(oldTagsStr, newTagsStr);
        } else if (activeFixedHashtags.length > 0 && !text.includes(activeFixedHashtags[0])) {
          text = `${text}\n\n${activeFixedHashtags.join(' ')}`;
        }

        // Insert social links block right before hashtags or at the end
        if (linksBlock) {
          if (newTagsStr && text.includes(newTagsStr)) {
            text = text.replace(newTagsStr, `${linksBlock}\n\n${newTagsStr}`);
          } else {
            text = `${text}\n\n${linksBlock}`;
          }
        }

        return {
          ...v,
          fullText: text,
        };
      });

      return {
        ...bundle,
        hashtags: mergedHashtags,
        variations: updatedVariations,
      };
    };

    try {
      const responseText = await generateWithOllama({
        prompt: userPrompt,
        system: systemPrompt,
        format: 'json',
        model: model || getOllamaModel(),
        temperature: 0.6,
      });

      // Strip markdown code fences if Ollama returned them
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed: SocialPostBundle = JSON.parse(cleanJson);

      // Validate required fields
      if (
        !Array.isArray(parsed.hooks) ||
        !Array.isArray(parsed.hashtags) ||
        !Array.isArray(parsed.variations)
      ) {
        throw new Error('Incomplete response structure from AI model');
      }

      const bundleWithLinks = attachEnhancementsToBundle(parsed);
      const validationReport = validateSocialPost({
        title: cleanTitle,
        hook: bundleWithLinks.variations[0]?.hook,
        caption: bundleWithLinks.variations[0]?.caption,
        callToAction: bundleWithLinks.variations[0]?.callToAction,
        fullText: bundleWithLinks.variations[0]?.fullText,
        hashtags: bundleWithLinks.hashtags,
        platform,
        contentType,
        includedLinks: eligibleLinks.map((l) => ({
          platform: l.account.platform,
          url: l.account.accountUrl,
          displayName: l.account.displayName,
        })),
      });

      return NextResponse.json({
        success: true,
        bundle: bundleWithLinks,
        validationReport,
        eligibleLinks: eligibleLinks.map((l) => ({
          id: l.account.id,
          platform: l.account.platform,
          url: l.account.accountUrl,
          displayName: l.account.displayName,
          formattedText: l.formattedText,
          isTargetPlatform: l.isTargetPlatform,
        })),
        platformConfig,
        source: 'ollama_ai',
      });
    } catch (aiErr: any) {
      console.warn('Ollama social generation notice, falling back to heuristics:', aiErr?.message || aiErr);
      const fallback = generateFallbackSocialBundle(cleanTranscript, cleanTitle, langKey, tone);
      const bundleWithLinks = attachEnhancementsToBundle(fallback);

      const validationReport = validateSocialPost({
        title: cleanTitle,
        hook: bundleWithLinks.variations[0]?.hook,
        caption: bundleWithLinks.variations[0]?.caption,
        callToAction: bundleWithLinks.variations[0]?.callToAction,
        fullText: bundleWithLinks.variations[0]?.fullText,
        hashtags: bundleWithLinks.hashtags,
        platform,
        contentType,
        includedLinks: eligibleLinks.map((l) => ({
          platform: l.account.platform,
          url: l.account.accountUrl,
          displayName: l.account.displayName,
        })),
      });

      return NextResponse.json({
        success: true,
        bundle: bundleWithLinks,
        validationReport,
        eligibleLinks: eligibleLinks.map((l) => ({
          id: l.account.id,
          platform: l.account.platform,
          url: l.account.accountUrl,
          displayName: l.account.displayName,
          formattedText: l.formattedText,
          isTargetPlatform: l.isTargetPlatform,
        })),
        platformConfig,
        source: 'heuristic_fallback',
        aiWarning: aiErr?.message || 'Model fallback used',
      });
    }
  } catch (error: any) {
    console.error('Error generating social media post copy:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate social media post copy' },
      { status: 500 }
    );
  }
}
