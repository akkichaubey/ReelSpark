import { NextRequest, NextResponse } from 'next/server';
import { generateWithOllama } from '@/lib/ollama';
import { getOllamaModel } from '@/lib/config';
import { getRequestUser } from '@/lib/auth';
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
import { SocialPlatformKey } from '@/lib/social-intelligence/types';

export interface SocialPostBundle {
  /** Platform-ready title (required for YouTube; useful as a caption headline elsewhere). */
  postTitle: string;
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

export type CaptionStyle =
  | 'curiosity'
  | 'story'
  | 'quick_value'
  | 'hinglish'
  | 'debate'
  | 'trend'
  | 'educational'
  | 'comment_dm';

export type SocialPlatform = 'all' | 'instagram' | 'youtube' | 'facebook' | 'threads' | 'tiktok';

const CAPTION_STYLE_GUIDANCE: Record<CaptionStyle, string> = {
  curiosity: 'Curiosity Hook: open with a specific information gap, then resolve it in the body without clickbait.',
  story: 'Personal Story: use a concise before → turning point → lesson arc grounded only in the transcript.',
  quick_value: 'Quick Value List: make the body scannable with a small numbered takeaway list and a save CTA.',
  hinglish: 'Relatable Hinglish: write in natural Roman Hindi/Hinglish with a familiar, non-forced everyday voice.',
  debate: 'Debate Question: lead with a respectful contrarian take and finish with one easy question for comments.',
  trend: 'Trend Reaction: use a concise POV or reaction framing while keeping the idea specific to the transcript.',
  educational: 'Educational Proof: state a practical rule, explain the why, and give one clear application step.',
  comment_dm: 'Comment-to-DM CTA: offer one relevant resource and end with a single short keyword people can comment.',
};

const HASHTAG_PATTERN = /^#[a-zA-Z0-9_\u0900-\u097F]+$/;

function limitText(value: string, maxLength: number, preserveLineBreaks = false): string {
  const clean = preserveLineBreaks
    ? value.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim()
    : value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function uniqueHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`))
    .filter((tag) => HASHTAG_PATTERN.test(tag))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getEffectivePlatform(platform: SocialPlatform): SocialPlatformKey {
  return platform === 'all' || platform === 'tiktok' ? 'instagram' : platform;
}

function createPlatformTitle(sourceTitle: string, firstSentence: string, platform: SocialPlatformKey): string {
  const candidate = sourceTitle && sourceTitle !== 'Viral Reel' && sourceTitle !== 'Viral Reel Clip'
    ? sourceTitle
    : firstSentence || 'Watch this short insight';
  // YouTube enforces a 100-character title. Keeping the same disciplined title length
  // across platforms makes the generated headline reusable without losing the core idea.
  return limitText(candidate, platform === 'youtube' ? 100 : 90);
}

function getPlatformCta(platform: SocialPlatformKey, language: 'en' | 'hi' | 'hinglish'): string {
  const english = {
    instagram: 'Save this for later and share it with someone who needs it today.',
    youtube: 'Subscribe for more short, practical insights and share your takeaway in the comments.',
    threads: 'What is your experience with this? Reply with your takeaway.',
    facebook: 'Share this with a friend and tell us your takeaway in the comments.',
    website: 'Read, save, and share this insight with your community.',
  };

  if (language === 'hi') {
    return platform === 'threads'
      ? 'आपका अनुभव क्या है? अपनी राय कमेंट में बताइए।'
      : 'इसे Save करें, Share करें और अपनी राय कमेंट में बताइए।';
  }
  if (language === 'hinglish') {
    return platform === 'threads'
      ? 'Aapka experience kya hai? Apna takeaway reply mein batao.'
      : 'Isse Save karo, Share karo aur apna takeaway comments mein batao.';
  }
  return english[platform];
}

function getPlatformLinkBlock(platform: SocialPlatformKey, linksBlock: string): string {
  if (!linksBlock) return '';
  // Instagram captions do not provide clickable URLs. Do not spend valuable caption
  // space on a list that followers cannot open from the post.
  if (platform === 'instagram') return '';
  // Threads has a 500-character total limit. One concise link is more useful than a
  // multi-account directory that crowds out the conversation starter.
  if (platform === 'threads') {
    return linksBlock.split('\n').find((line) => /https?:\/\//.test(line)) || '';
  }
  return linksBlock;
}

function composePlatformPost(
  hook: string,
  caption: string,
  callToAction: string,
  hashtags: string[],
  linksBlock: string,
  characterLimit: number
): string {
  const tags = hashtags.join(' ');
  const trailingParts = [linksBlock, tags].filter(Boolean);
  const trailing = trailingParts.join('\n\n');
  const separatorLength = trailing ? 2 : 0;
  const availableBodyLength = Math.max(0, characterLimit - trailing.length - separatorLength);
  const body = limitText([hook, caption, callToAction].filter(Boolean).join('\n\n'), availableBodyLength, true);
  return [body, trailing].filter(Boolean).join('\n\n').trim();
}

function platformGenerationGuidance(platform: SocialPlatformKey, config: ReturnType<typeof getPlatformConfig>): string {
  const shared = `Use exactly ${config.hashtagRules.recommendedMin}-${config.hashtagRules.recommendedMax} highly relevant hashtags (never more than ${config.hashtagRules.maxAllowed}).`;
  switch (platform) {
    case 'instagram':
      return `${shared} Keep the first hook under ${config.characterLimits.captionPreFold} characters. Do not place raw URLs in the caption; use a natural “link in bio” style CTA only when needed.`;
    case 'youtube':
      return `${shared} Generate a searchable video title of 100 characters or fewer, plus a detailed Short description. URLs may be included in the description.`;
    case 'threads':
      return `${shared} Keep the complete post, hashtags, and any URL within 500 characters. Make it conversational and end with a question; use at most one link.`;
    case 'facebook':
      return `${shared} Write a natural, shareable post with a discussion CTA. URLs may be included and should be placed after the body.`;
    default:
      return shared;
  }
}

function getCaptionStyleGuidance(style: CaptionStyle): string {
  return CAPTION_STYLE_GUIDANCE[style] || CAPTION_STYLE_GUIDANCE.curiosity;
}

function applyCaptionStyle(
  bundle: SocialPostBundle,
  style: CaptionStyle,
  firstSentence: string,
  language: 'en' | 'hi' | 'hinglish'
): SocialPostBundle {
  const isHindi = language === 'hi';
  const isHinglish = language === 'hinglish' || style === 'hinglish';
  const cleanIdea = limitText(firstSentence, 130);
  const styleCopy: Record<CaptionStyle, { hooks: string[]; description: string; cta: string }> = isHindi
    ? {
        curiosity: { hooks: ['🔥 इस बात के बारे में कोई खुलकर नहीं बताता…', '⚠️ रुकिए—यह बात आपकी सोच बदल सकती है।', '💡 क्या आपने कभी इस तरह सोचा है?'], description: `${cleanIdea}। इसका असली मतलब समझना ज़रूरी है।`, cta: 'इसे Save करें और अपनी राय कमेंट में बताइए।' },
        story: { hooks: ['मैं पहले यह बात समझ नहीं पाया था…', 'एक छोटी सी सीख ने सब बदल दिया।', 'अगर आप भी इस दौर से गुज़र रहे हैं, पढ़िए।'], description: `पहले बात अलग लगती थी। फिर यह सीख सामने आई: ${cleanIdea}।`, cta: 'अगर यह आपकी कहानी जैसी लगे, इसे Share करें।' },
        quick_value: { hooks: ['3 बातें जो आपको आज याद रखनी चाहिए:', 'इसे Save कर लीजिए—काम आएगा।', 'छोटी सीख, बड़ा असर।'], description: `1) ${cleanIdea}\n2) इसे आज लागू करें\n3) अपनी प्रगति देखें`, cta: 'अगली बार के लिए इसे Save करें।' },
        hinglish: { hooks: ['Aaj ki sabse real baat ye hai…', 'Agar aap relate karte ho, ye aapke liye hai.', 'Ye chhoti si baat bada change la sakti hai.'], description: cleanIdea, cta: 'Save karo aur kisi apne ko bhejo.' },
        debate: { hooks: ['गरम राय: शायद हम इसे गलत समझ रहे हैं।', 'क्या आप सहमत हैं या नहीं?', 'इस पर बात होनी चाहिए।'], description: `${cleanIdea}। शायद इसका दूसरा नज़रिया भी है।`, cta: 'अपनी राय एक शब्द में कमेंट करें।' },
        trend: { hooks: ['POV: जब यह बात आखिरकार समझ आती है।', 'यह वाला moment सबको चाहिए।', 'जिसे समझ आया, वही आगे बढ़ा।'], description: cleanIdea, cta: 'अगर आपने भी ऐसा महसूस किया है, इसे Share करें।' },
        educational: { hooks: ['एक नियम जो आपको याद रखना चाहिए:', 'इस सीख को आसान भाषा में समझिए।', 'यह practical rule आपकी मदद कर सकता है।'], description: `${cleanIdea}। इसे अपनी अगली situation में लागू करके देखें।`, cta: 'ऐसी practical सीख के लिए Follow करें।' },
        comment_dm: { hooks: ['यह guide चाहिए?', 'मैंने इसका simple framework बनाया है।', 'इसे लागू करने का आसान तरीका चाहिए?'], description: cleanIdea, cta: '“GUIDE” कमेंट करें और मैं resource भेज दूँगा।' },
      }
    : isHinglish
      ? {
          curiosity: { hooks: ['🔥 Is baat ke baare mein koi openly nahi batata…', '⚠️ Ruko—yeh aapki soch badal sakta hai.', '💡 Kya aapne is angle se socha hai?'], description: `${cleanIdea}. Iska real meaning samajhna zaroori hai.`, cta: 'Save karo aur apna takeaway comment mein batao.' },
          story: { hooks: ['Main pehle is baat ko samajh nahi paaya tha…', 'Ek chhoti si learning ne sab badal diya.', 'Agar aap bhi is phase mein ho, ye padh lo.'], description: `Pehle mujhe ye alag lagta tha. Phir ye lesson mila: ${cleanIdea}.`, cta: 'Agar relate karte ho, kisi apne ko share karo.' },
          quick_value: { hooks: ['3 baatein jo aaj yaad rakhni chahiye:', 'Isse save kar lo—baad mein kaam aayega.', 'Chhoti learning, bada impact.'], description: `1) ${cleanIdea}\n2) Aaj apply karo\n3) Apna progress dekho`, cta: 'Next time ke liye save kar lo.' },
          hinglish: { hooks: ['Aaj ki sabse real baat ye hai…', 'Agar aap relate karte ho, ye aapke liye hai.', 'Ye chhoti si baat bada change la sakti hai.'], description: cleanIdea, cta: 'Save karo aur kisi apne ko bhejo.' },
          debate: { hooks: ['Hot take: shayad hum isse galat samajh rahe hain.', 'Aap agree karte ho ya nahi?', 'Is topic par baat honi chahiye.'], description: `${cleanIdea}. Ho sakta hai iska ek aur angle ho.`, cta: 'Apni opinion ek word mein comment karo.' },
          trend: { hooks: ['POV: jab ye baat finally samajh aa jaye.', 'Ye wala moment sabko chahiye.', 'Jise samajh aaya, wahi aage badha.'], description: cleanIdea, cta: 'Agar aapne bhi feel kiya hai, share karo.' },
          educational: { hooks: ['Ek rule jo aapko yaad rakhna chahiye:', 'Is lesson ko simple language mein samjho.', 'Ye practical rule kaam aa sakta hai.'], description: `${cleanIdea}. Isse apni next situation mein apply karke dekho.`, cta: 'Aisi practical learning ke liye follow karo.' },
          comment_dm: { hooks: ['Ye guide chahiye?', 'Maine iska simple framework banaya hai.', 'Isse apply karne ka easy tareeka chahiye?'], description: cleanIdea, cta: '“GUIDE” comment karo aur main resource DM kar dunga.' },
        }
      : {
          curiosity: { hooks: ['🔥 Nobody explains this part clearly…', '⚠️ Stop scrolling—this changes the way you see it.', '💡 Have you considered this angle?'], description: `${cleanIdea}. The useful part is understanding what it means in practice.`, cta: 'Save this and share your takeaway in the comments.' },
          story: { hooks: ['I did not understand this at first…', 'One small lesson changed my perspective.', 'If you are in this season too, read this.'], description: `I used to see this differently. Then this lesson landed: ${cleanIdea}.`, cta: 'Share this with someone who needs the reminder.' },
          quick_value: { hooks: ['3 things worth remembering today:', 'Save this—you will use it later.', 'Small lesson. Big impact.'], description: `1) ${cleanIdea}\n2) Apply it today\n3) Notice what changes`, cta: 'Save this for the next time you need it.' },
          hinglish: { hooks: ['Aaj ki sabse real baat ye hai…', 'Agar aap relate karte ho, ye aapke liye hai.', 'Ye chhoti si baat bada change la sakti hai.'], description: cleanIdea, cta: 'Save karo aur kisi apne ko bhejo.' },
          debate: { hooks: ['Hot take: we may be getting this wrong.', 'Do you agree or disagree?', 'This deserves a real conversation.'], description: `${cleanIdea}. There may be another useful way to look at it.`, cta: 'Reply with your take in one sentence.' },
          trend: { hooks: ['POV: this finally clicks.', 'This is the moment everyone needs.', 'The people who get it will move differently.'], description: cleanIdea, cta: 'Send this to someone who will relate.' },
          educational: { hooks: ['One rule worth remembering:', 'Here is the practical version of this lesson.', 'This is the rule you can use today.'], description: `${cleanIdea}. Try applying it in your next real situation.`, cta: 'Follow for more practical breakdowns.' },
          comment_dm: { hooks: ['Want the guide for this?', 'I made a simple framework for this.', 'Want the easy way to apply it?'], description: cleanIdea, cta: 'Comment “GUIDE” and I will DM the resource.' },
        };

  const selected = styleCopy[style];
  return {
    ...bundle,
    hooks: selected.hooks,
    description: selected.description,
    callToAction: selected.cta,
    variations: bundle.variations.map((variation, index) => ({
      ...variation,
      hook: selected.hooks[index] || selected.hooks[0],
      caption: selected.description,
      callToAction: selected.cta,
    })),
  };
}

function formatBundleForPlatform(
  bundle: SocialPostBundle,
  options: {
    platform: SocialPlatformKey;
    sourceTitle: string;
    firstSentence: string;
    language: 'en' | 'hi' | 'hinglish';
    fixedHashtags: string[];
    linksBlock: string;
  }
): SocialPostBundle {
  const config = getPlatformConfig(options.platform);
  const hashtags = uniqueHashtags([
    ...options.fixedHashtags,
    ...(bundle.hashtags || []),
  ]).slice(0, config.hashtagRules.recommendedMax);
  const linkBlock = getPlatformLinkBlock(options.platform, options.linksBlock);
  const fallbackCta = getPlatformCta(options.platform, options.language);
  const variations = bundle.variations.slice(0, 3).map((variation, index) => {
    const hookLimit = options.platform === 'instagram'
      ? config.characterLimits.captionPreFold || 125
      : options.platform === 'threads'
        ? 130
        : 180;
    const hook = limitText(
      (typeof variation.hook === 'string' && variation.hook) || bundle.hooks[index] || options.firstSentence,
      hookLimit
    );
    const caption = limitText(
      (typeof variation.caption === 'string' && variation.caption) || bundle.description || options.firstSentence,
      800,
      true
    );
    const callToAction =
      (typeof variation.callToAction === 'string' && variation.callToAction) || bundle.callToAction || fallbackCta;

    return {
      ...variation,
      hook,
      caption,
      callToAction,
      fullText: composePlatformPost(
        hook,
        caption,
        callToAction,
        hashtags,
        linkBlock,
        config.characterLimits.maxTotal
      ),
    };
  });

  const firstVariation = variations[0];
  return {
    ...bundle,
    postTitle: limitText(
      (typeof bundle.postTitle === 'string' && bundle.postTitle) || createPlatformTitle(options.sourceTitle, options.firstSentence, options.platform),
      options.platform === 'youtube' ? 100 : 90
    ),
    hooks: variations.map((variation) => variation.hook),
    description: firstVariation?.caption || bundle.description,
    callToAction: firstVariation?.callToAction || bundle.callToAction || fallbackCta,
    hashtags,
    variations,
  };
}

/**
 * Fallback heuristic generator in case Ollama is offline or network error occurs.
 */
function generateFallbackSocialBundle(
  transcript: string,
  title: string | undefined,
  language: 'en' | 'hi' | 'hinglish',
  tone: ContentTone,
  platform: SocialPlatformKey
): SocialPostBundle {
  const cleanTranscript = (transcript || '').trim();
  const firstSentence = cleanTranscript.split(/[.!?।\n]/)[0] || cleanTranscript.substring(0, 80);

  const postTitle = createPlatformTitle(title || '', firstSentence, platform);
  const platformCta = getPlatformCta(platform, language);

  if (language === 'hi') {
    const hooks = [
      `🔥 क्या आप भी यही सोचते हैं? सच आपको हैरान कर देगा!`,
      `⚠️ इस 1 बात को कभी मत भूलना: "${firstSentence.substring(0, 60)}..."`,
      `💡 जो लोग सच में आगे बढ़ना चाहते हैं, वो इसे ज़रूर सुनें!`,
    ];
    const description = `${title ? title + ' — ' : ''}${firstSentence}। ज़िंदगी में बदलाव लाने के लिए यह सीख बहुत ज़रूरी है।`;
    const callToAction = platformCta;
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
      postTitle,
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
          callToAction: platformCta,
          fullText: `${hooks[1]}\n\n${firstSentence}।\n\n${platformCta}\n\n${hashtags.slice(0, 8).join(' ')}`,
        },
        {
          title: 'Deep & Reflective',
          hook: hooks[2],
          caption: `${cleanTranscript.substring(0, 200)}...`,
          callToAction: platformCta,
          fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\n${platformCta}\n\n${hashtags.join(' ')}`,
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
    const callToAction = platformCta;
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
      postTitle,
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
          callToAction: platformCta,
          fullText: `${hooks[1]}\n\n${firstSentence}.\n\n${platformCta}\n\n${hashtags.slice(0, 8).join(' ')}`,
        },
        {
          title: 'Deep & Reflective',
          hook: hooks[2],
          caption: `${cleanTranscript.substring(0, 200)}...`,
          callToAction: platformCta,
          fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\n${platformCta}\n\n${hashtags.join(' ')}`,
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
  const callToAction = platformCta;
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
    postTitle,
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
        callToAction: platformCta,
        fullText: `${hooks[1]}\n\n${firstSentence}.\n\n${platformCta}\n\n${hashtags.slice(0, 8).join(' ')}`,
      },
      {
        title: 'Deep & Reflective',
        hook: hooks[2],
        caption: `${cleanTranscript.substring(0, 200)}...`,
        callToAction: platformCta,
        fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\n${platformCta}\n\n${hashtags.join(' ')}`,
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
      captionStyle = 'curiosity',
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
    const user = await getRequestUser(req);

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Production identity must come from a validated session, never request JSON.
    const userId = user.id;
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
    const selectedCaptionStyle: CaptionStyle =
      typeof captionStyle === 'string' && Object.prototype.hasOwnProperty.call(CAPTION_STYLE_GUIDANCE, captionStyle)
        ? captionStyle as CaptionStyle
        : 'curiosity';
    const styleLanguage = selectedCaptionStyle === 'hinglish' ? 'hinglish' : langKey;

    const langInstructions =
      styleLanguage === 'hi'
        ? 'Generate all content strictly in clean Hindi (Devanagari script).'
        : styleLanguage === 'hinglish'
        ? 'Generate all content in conversational Hinglish (Hindi written in Roman/English alphabet, popular on Instagram Reels in India).'
        : 'Generate all content in modern, compelling English.';

    const effectivePlatform = getEffectivePlatform(platform);
    const platformConfig = getPlatformConfig(effectivePlatform);
    const charLimit = platformConfig.characterLimits.maxTotal;

    const systemPrompt = `You are an elite social media growth strategist, viral copywriter, and ${platformConfig.name} expert.
Your job is to generate high-converting post captions, viral opening hooks, call-to-actions, and hashtags based SOLELY on the provided clip transcript.

CRITICAL RULES:
1. ONLY use ideas and quotes present in the provided transcript. Do not fabricate unrelated facts.
2. Target Tone: ${tone.toUpperCase()}.
3. Target Platform: ${platformConfig.name} (${contentType.toUpperCase()}).
4. Target Language: ${langInstructions}
5. Character constraint: Keep content compliant with ${platformConfig.name}'s character limit of ${charLimit} chars.
6. Platform policy: ${platformGenerationGuidance(effectivePlatform, platformConfig)}
7. Caption style: ${getCaptionStyleGuidance(selectedCaptionStyle)}
8. Distinguish between SPOKEN subtitles (burned on screen) and SOCIAL POST CAPTIONS (text pasted in the description box).
9. Output MUST be valid JSON adhering strictly to the schema below. No markdown fences around the JSON.

Schema:
{
  "postTitle": "A platform-ready title. It MUST be 100 characters or fewer for YouTube.",
  "hooks": ["Catchy Opening Hook 1", "Contrarian Hook 2", "Curiosity Hook 3"],
  "description": "Engaging 2-3 sentence body paragraph summarizing the clip message and inviting comments",
  "callToAction": "Clear action prompt (e.g. Save, Share, Comment, Follow)",
  "hashtags": ["#tag1", "#tag2", "#tag3", "Use only the platform-recommended count"],
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

    const firstSentence = cleanTranscript.split(/[.!?।\n]/)[0] || cleanTranscript.substring(0, 80);
    const attachEnhancementsToBundle = (bundle: SocialPostBundle): SocialPostBundle =>
      formatBundleForPlatform(bundle, {
        platform: effectivePlatform,
        sourceTitle: cleanTitle,
        firstSentence,
        language: styleLanguage,
        fixedHashtags: activeFixedHashtags,
        linksBlock,
      });

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
        title: bundleWithLinks.postTitle,
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
      const fallback = generateFallbackSocialBundle(cleanTranscript, cleanTitle, styleLanguage, tone, effectivePlatform);
      const bundleWithLinks = attachEnhancementsToBundle(
        applyCaptionStyle(fallback, selectedCaptionStyle, firstSentence, styleLanguage)
      );

      const validationReport = validateSocialPost({
        title: bundleWithLinks.postTitle,
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
