import { NextRequest, NextResponse } from 'next/server';
import { generateContentWithFallback, getGeminiClient } from '@/lib/gemini';
import { resolveApiGeminiModel } from '@/lib/config';

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

export type SocialPlatform = 'all' | 'instagram' | 'youtube' | 'tiktok';

/**
 * Fallback heuristic generator in case Gemini API key is unset or network error occurs.
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
    const description = `${title ? title + ' — ' : ''}${firstSentence}. Life me grow karne ke liye ye samajhna sabse zaruri hai.`;
    const callToAction = `👉 Comment "YES" agar aap agree karte ho, aur save karein future ke liye!`;
    const hashtags = [
      '#reels',
      '#trending',
      '#growthmindset',
      '#hinglishmotivation',
      '#viralreels',
      '#mindsetmatters',
      '#lifehacks',
      '#entrepreneurship',
      '#explore',
      '#shortsvideo',
      '#motivationdaily',
      '#selfgrowth',
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
          callToAction: 'Double tap if this resonated with you ❤️',
          fullText: `${hooks[1]}\n\n${firstSentence}.\n\nDouble tap if this resonated with you ❤️\n\n${hashtags.slice(0, 8).join(' ')}`,
        },
        {
          title: 'Story & Value',
          hook: hooks[2],
          caption: `${cleanTranscript.substring(0, 200)}...`,
          callToAction: 'Share this with someone who needs to hear this today 🚀',
          fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 200)}...\n\nShare this with someone who needs to hear this today 🚀\n\n${hashtags.join(' ')}`,
        },
      ],
    };
  }

  // English fallback
  const hooks = [
    `🔥 Stop scrolling if you want to master this mindset.`,
    `💡 The harsh truth most people realize too late: "${firstSentence.substring(0, 60)}..."`,
    `⚠️ Watch this before making your next big decision!`,
  ];
  const description = `${title ? title + ' — ' : ''}${firstSentence}. When you shift your perspective, everything changes.`;
  const callToAction = `👉 Save this reel for later & share with a friend who needs this reminder!`;
  const hashtags = [
    '#shorts',
    '#viralreels',
    '#growthmindset',
    '#motivation',
    '#lifeadvice',
    '#successmindset',
    '#mindsetmatters',
    '#reelsinstagram',
    '#trendingnow',
    '#selfdevelopment',
    '#wisdom',
    '#creator',
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
        callToAction: 'Save this so you don\'t forget 📌',
        fullText: `${hooks[1]}\n\n${firstSentence}.\n\nSave this so you don\'t forget 📌\n\n${hashtags.slice(0, 8).join(' ')}`,
      },
      {
        title: 'Storytelling & Depth',
        hook: hooks[2],
        caption: `${cleanTranscript.substring(0, 220)}...`,
        callToAction: 'Drop a "💯" if you agree with this message!',
        fullText: `${hooks[2]}\n\n${cleanTranscript.substring(0, 220)}...\n\nDrop a "💯" if you agree with this message!\n\n${hashtags.join(' ')}`,
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
    } = body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'Transcript of the currently selected clip is required.' },
        { status: 400 }
      );
    }

    const cleanTranscript = transcript.trim();
    const cleanTitle = (title || 'Viral Reel').trim();
    const langKey = language === 'hi' ? 'hi' : language === 'hinglish' ? 'hinglish' : 'en';

    const ai = getGeminiClient();
    if (!ai) {
      // Return smart fallback if Gemini API key is not configured
      const fallback = generateFallbackSocialBundle(cleanTranscript, cleanTitle, langKey, tone);
      return NextResponse.json({
        success: true,
        bundle: fallback,
        source: 'heuristic_template',
      });
    }

    const preferredModel = resolveApiGeminiModel();

    const langInstructions =
      langKey === 'hi'
        ? 'Generate all content strictly in clean Hindi (Devanagari script).'
        : langKey === 'hinglish'
        ? 'Generate all content in conversational Hinglish (Hindi written in Roman/English alphabet, popular on Instagram Reels in India).'
        : 'Generate all content in modern, compelling English.';

    const systemPrompt = `You are an elite social media growth strategist, viral copywriter, and Instagram Reels / YouTube Shorts expert.
Your job is to generate high-converting post captions, viral opening hooks, call-to-actions, and hashtags based SOLELY on the provided clip transcript.

CRITICAL RULES:
1. ONLY use ideas and quotes present in the provided transcript. Do not fabricate unrelated facts.
2. Target Tone: ${tone.toUpperCase()}.
3. Target Language: ${langInstructions}
4. Distinguish between SPOKEN subtitles (burned on screen) and SOCIAL POST CAPTIONS (text pasted in the Instagram / YouTube description box).
5. Output MUST be valid JSON adhering strictly to the schema below. No markdown fences around the JSON if possible, or clean standard JSON.

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
CLIP TRANSCRIPT:
"""
${cleanTranscript}
"""

Generate the complete viral social media post bundle now.`;

    try {
      const response = await generateContentWithFallback(ai, preferredModel, {
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ],
        config: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      });

      const responseText =
        response.text ||
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        '';

      const parsed: SocialPostBundle = JSON.parse(responseText.trim());

      // Validate required fields
      if (
        !Array.isArray(parsed.hooks) ||
        !Array.isArray(parsed.hashtags) ||
        !Array.isArray(parsed.variations)
      ) {
        throw new Error('Incomplete response structure from AI model');
      }

      return NextResponse.json({
        success: true,
        bundle: parsed,
        source: 'gemini_ai',
      });
    } catch (aiErr: any) {
      console.warn('Gemini social generation error, falling back to heuristics:', aiErr?.message || aiErr);
      const fallback = generateFallbackSocialBundle(cleanTranscript, cleanTitle, langKey, tone);
      return NextResponse.json({
        success: true,
        bundle: fallback,
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
