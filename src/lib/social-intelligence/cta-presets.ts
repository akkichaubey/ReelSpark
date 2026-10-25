/**
 * ReelSpark Viral Reels & Shorts Call-to-Action (CTA) & Headings Catalog
 *
 * Curated for Instagram Reels, YouTube Shorts, and Facebook Reels.
 * Supports English, Hindi (Devanagari), and Hinglish (Roman Hindi).
 */

export type CtaLanguage = 'en' | 'hi' | 'hinglish';

export type CtaCategoryKey =
  | 'follow'
  | 'like_share'
  | 'save'
  | 'comment'
  | 'watch_more'
  | 'motivational'
  | 'viral';

export interface CtaPreset {
  id: string;
  category: CtaCategoryKey;
  language: CtaLanguage;
  text: string;
  label?: string;
  platforms: ('instagram' | 'youtube' | 'facebook' | 'all')[];
}

export interface CtaCategoryMeta {
  key: CtaCategoryKey;
  labelEn: string;
  labelHi: string;
  icon: string;
}

export const CTA_CATEGORIES: Record<CtaCategoryKey, CtaCategoryMeta> = {
  follow: {
    key: 'follow',
    labelEn: 'Follow Us',
    labelHi: 'फॉलो करें',
    icon: 'UserPlus',
  },
  like_share: {
    key: 'like_share',
    labelEn: 'Like & Share',
    labelHi: 'लाइक और शेयर',
    icon: 'Heart',
  },
  save: {
    key: 'save',
    labelEn: 'Save Post',
    labelHi: 'सेव करें',
    icon: 'Bookmark',
  },
  comment: {
    key: 'comment',
    labelEn: 'Comment & Engage',
    labelHi: 'कमेंट और चर्चा',
    icon: 'MessageSquare',
  },
  watch_more: {
    key: 'watch_more',
    labelEn: 'Watch More',
    labelHi: 'और देखें',
    icon: 'PlaySquare',
  },
  motivational: {
    key: 'motivational',
    labelEn: 'Motivational',
    labelHi: 'प्रेरणादायक',
    icon: 'Sparkles',
  },
  viral: {
    key: 'viral',
    labelEn: 'Trending & Viral',
    labelHi: 'ट्रेंडिंग और वायरल',
    icon: 'Flame',
  },
};

export const REELS_CTA_PRESETS: CtaPreset[] = [
  // ==========================================
  // 1. Follow Us
  // ==========================================
  // English
  {
    id: 'follow-en-1',
    category: 'follow',
    language: 'en',
    text: 'Follow for more:',
    platforms: ['all'],
  },
  {
    id: 'follow-en-2',
    category: 'follow',
    language: 'en',
    text: 'Follow for daily updates:',
    platforms: ['all'],
  },
  {
    id: 'follow-en-3',
    category: 'follow',
    language: 'en',
    text: 'Follow for more amazing content:',
    platforms: ['all'],
  },
  {
    id: 'follow-en-4',
    category: 'follow',
    language: 'en',
    text: 'Hit follow so you never miss a reel:',
    platforms: ['instagram', 'facebook'],
  },
  {
    id: 'follow-en-5',
    category: 'follow',
    language: 'en',
    text: 'Connect with me on official links:',
    platforms: ['all'],
  },
  // Hindi
  {
    id: 'follow-hi-1',
    category: 'follow',
    language: 'hi',
    text: 'रोजाना ऐसी वीडियो के लिए फॉलो करें:',
    platforms: ['all'],
  },
  {
    id: 'follow-hi-2',
    category: 'follow',
    language: 'hi',
    text: 'नए अपडेट्स के लिए हमें फॉलो करें:',
    platforms: ['all'],
  },
  {
    id: 'follow-hi-3',
    category: 'follow',
    language: 'hi',
    text: 'और भी बेहतरीन कंटेंट के लिए फॉलो करें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'follow-hin-1',
    category: 'follow',
    language: 'hinglish',
    text: 'Daily motivation ke liye follow karein:',
    platforms: ['all'],
  },
  {
    id: 'follow-hin-2',
    category: 'follow',
    language: 'hinglish',
    text: 'Aisi aur reels ke liye follow karein:',
    platforms: ['instagram', 'facebook'],
  },

  // ==========================================
  // 2. Like & Share
  // ==========================================
  // English
  {
    id: 'like-en-1',
    category: 'like_share',
    language: 'en',
    text: 'Like if you agree:',
    platforms: ['all'],
  },
  {
    id: 'like-en-2',
    category: 'like_share',
    language: 'en',
    text: 'Share with your friends:',
    platforms: ['all'],
  },
  {
    id: 'like-en-3',
    category: 'like_share',
    language: 'en',
    text: 'Spread the word:',
    platforms: ['all'],
  },
  {
    id: 'like-en-4',
    category: 'like_share',
    language: 'en',
    text: 'Share with someone who needs this today:',
    platforms: ['all'],
  },
  {
    id: 'like-en-5',
    category: 'like_share',
    language: 'en',
    text: 'Double tap if this resonated with you:',
    platforms: ['instagram'],
  },
  // Hindi
  {
    id: 'like-hi-1',
    category: 'like_share',
    language: 'hi',
    text: 'अगर बात अच्छी लगी तो Like और Share करें:',
    platforms: ['all'],
  },
  {
    id: 'like-hi-2',
    category: 'like_share',
    language: 'hi',
    text: 'अपने दोस्तों और परिवार के साथ शेयर करें:',
    platforms: ['all'],
  },
  {
    id: 'like-hi-3',
    category: 'like_share',
    language: 'hi',
    text: 'पसंद आया तो लाइक करें और अपनों से शेयर करें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'like-hin-1',
    category: 'like_share',
    language: 'hinglish',
    text: 'Agar baat sahi lagi toh like aur share karein:',
    platforms: ['all'],
  },
  {
    id: 'like-hin-2',
    category: 'like_share',
    language: 'hinglish',
    text: 'Apne doston ke saath share karein:',
    platforms: ['all'],
  },

  // ==========================================
  // 3. Save Post
  // ==========================================
  // English
  {
    id: 'save-en-1',
    category: 'save',
    language: 'en',
    text: 'Save this for later:',
    platforms: ['all'],
  },
  {
    id: 'save-en-2',
    category: 'save',
    language: 'en',
    text: "Don't forget to save:",
    platforms: ['all'],
  },
  {
    id: 'save-en-3',
    category: 'save',
    language: 'en',
    text: 'Bookmark this Reel:',
    platforms: ['instagram', 'facebook'],
  },
  {
    id: 'save-en-4',
    category: 'save',
    language: 'en',
    text: 'Save this post to revisit anytime:',
    platforms: ['all'],
  },
  // Hindi
  {
    id: 'save-hi-1',
    category: 'save',
    language: 'hi',
    text: 'इसे बाद में देखने के लिए Save करें:',
    platforms: ['all'],
  },
  {
    id: 'save-hi-2',
    category: 'save',
    language: 'hi',
    text: 'यह Reel भूल न जाएं, अभी Save कर लें:',
    platforms: ['all'],
  },
  {
    id: 'save-hi-3',
    category: 'save',
    language: 'hi',
    text: 'जरूरी जानकारी है, Save करके रख लें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'save-hin-1',
    category: 'save',
    language: 'hinglish',
    text: 'Baad me dekhne ke liye save kar lo:',
    platforms: ['all'],
  },
  {
    id: 'save-hin-2',
    category: 'save',
    language: 'hinglish',
    text: 'Save this Reel kaam aayegi:',
    platforms: ['all'],
  },

  // ==========================================
  // 4. Comment & Engage
  // ==========================================
  // English
  {
    id: 'comment-en-1',
    category: 'comment',
    language: 'en',
    text: 'What do you think?:',
    platforms: ['all'],
  },
  {
    id: 'comment-en-2',
    category: 'comment',
    language: 'en',
    text: 'Drop your thoughts below:',
    platforms: ['all'],
  },
  {
    id: 'comment-en-3',
    category: 'comment',
    language: 'en',
    text: 'Comment your opinion:',
    platforms: ['all'],
  },
  {
    id: 'comment-en-4',
    category: 'comment',
    language: 'en',
    text: 'Tell me in the comments:',
    platforms: ['all'],
  },
  {
    id: 'comment-en-5',
    category: 'comment',
    language: 'en',
    text: 'Comment "YES" if you agree:',
    platforms: ['all'],
  },
  // Hindi
  {
    id: 'comment-hi-1',
    category: 'comment',
    language: 'hi',
    text: 'आपकी क्या राय है? कमेंट में जरूर बताएं:',
    platforms: ['all'],
  },
  {
    id: 'comment-hi-2',
    category: 'comment',
    language: 'hi',
    text: 'कमेंट बॉक्स में अपने विचार शेयर करें:',
    platforms: ['all'],
  },
  {
    id: 'comment-hi-3',
    category: 'comment',
    language: 'hi',
    text: 'अगर आप सहमत हैं तो कमेंट में "YES" लिखें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'comment-hin-1',
    category: 'comment',
    language: 'hinglish',
    text: 'Aapki kya soch hai? Comment karke batayein:',
    platforms: ['all'],
  },
  {
    id: 'comment-hin-2',
    category: 'comment',
    language: 'hinglish',
    text: 'Comment me apni opinion drop karein:',
    platforms: ['all'],
  },

  // ==========================================
  // 5. Watch More
  // ==========================================
  // English
  {
    id: 'watch-en-1',
    category: 'watch_more',
    language: 'en',
    text: 'Watch till the end:',
    platforms: ['all'],
  },
  {
    id: 'watch-en-2',
    category: 'watch_more',
    language: 'en',
    text: "Don't miss this:",
    platforms: ['all'],
  },
  {
    id: 'watch-en-3',
    category: 'watch_more',
    language: 'en',
    text: 'More content coming soon:',
    platforms: ['all'],
  },
  {
    id: 'watch-en-4',
    category: 'watch_more',
    language: 'en',
    text: 'Watch full video on my channel:',
    platforms: ['youtube', 'all'],
  },
  // Hindi
  {
    id: 'watch-hi-1',
    category: 'watch_more',
    language: 'hi',
    text: 'पूरा वीडियो जरूर देखें:',
    platforms: ['all'],
  },
  {
    id: 'watch-hi-2',
    category: 'watch_more',
    language: 'hi',
    text: 'मिस मत करना — पूरा देखें:',
    platforms: ['all'],
  },
  {
    id: 'watch-hi-3',
    category: 'watch_more',
    language: 'hi',
    text: 'अगला पार्ट जल्द आएगा, जुड़े रहें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'watch-hin-1',
    category: 'watch_more',
    language: 'hinglish',
    text: 'Poora zaroor dekhein, miss mat karna:',
    platforms: ['all'],
  },
  {
    id: 'watch-hin-2',
    category: 'watch_more',
    language: 'hinglish',
    text: 'Next part jald aayega, jude rahein:',
    platforms: ['all'],
  },

  // ==========================================
  // 6. Motivational
  // ==========================================
  // English
  {
    id: 'mot-en-1',
    category: 'motivational',
    language: 'en',
    text: 'Daily inspiration:',
    platforms: ['all'],
  },
  {
    id: 'mot-en-2',
    category: 'motivational',
    language: 'en',
    text: 'Your daily dose of motivation:',
    platforms: ['all'],
  },
  {
    id: 'mot-en-3',
    category: 'motivational',
    language: 'en',
    text: 'Stay inspired:',
    platforms: ['all'],
  },
  {
    id: 'mot-en-4',
    category: 'motivational',
    language: 'en',
    text: 'Daily dose of wisdom & growth:',
    platforms: ['all'],
  },
  // Hindi
  {
    id: 'mot-hi-1',
    category: 'motivational',
    language: 'hi',
    text: 'हर दिन नई प्रेरणा और सकारात्मक सोच के लिए:',
    platforms: ['all'],
  },
  {
    id: 'mot-hi-2',
    category: 'motivational',
    language: 'hi',
    text: 'सफलता के इस सफर में जुड़े रहें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'mot-hin-1',
    category: 'motivational',
    language: 'hinglish',
    text: 'Daily positive vibes ke liye jude rahein:',
    platforms: ['all'],
  },
  {
    id: 'mot-hin-2',
    category: 'motivational',
    language: 'hinglish',
    text: 'Daily motivation aur inspiration:',
    platforms: ['all'],
  },

  // ==========================================
  // 7. Trending & Viral
  // ==========================================
  // English
  {
    id: 'viral-en-1',
    category: 'viral',
    language: 'en',
    text: 'Must watch:',
    platforms: ['all'],
  },
  {
    id: 'viral-en-2',
    category: 'viral',
    language: 'en',
    text: 'You need to see this:',
    platforms: ['all'],
  },
  {
    id: 'viral-en-3',
    category: 'viral',
    language: 'en',
    text: "Don't scroll without watching:",
    platforms: ['all'],
  },
  {
    id: 'viral-en-4',
    category: 'viral',
    language: 'en',
    text: 'This will change your perspective:',
    platforms: ['all'],
  },
  {
    id: 'viral-en-5',
    category: 'viral',
    language: 'en',
    text: 'The truth nobody talks about:',
    platforms: ['all'],
  },
  // Hindi
  {
    id: 'viral-hi-1',
    category: 'viral',
    language: 'hi',
    text: 'यह वीडियो जरूर देखें — स्क्रॉल करने से पहले:',
    platforms: ['all'],
  },
  {
    id: 'viral-hi-2',
    category: 'viral',
    language: 'hi',
    text: 'यह बात आपकी सोच बदल देगी:',
    platforms: ['all'],
  },
  {
    id: 'viral-hi-3',
    category: 'viral',
    language: 'hi',
    text: 'स्क्रॉल मत करें — यह जरूर सुनें:',
    platforms: ['all'],
  },
  // Hinglish
  {
    id: 'viral-hin-1',
    category: 'viral',
    language: 'hinglish',
    text: 'Scroll mat karna, yeh zaroor dekhna:',
    platforms: ['all'],
  },
  {
    id: 'viral-hin-2',
    category: 'viral',
    language: 'hinglish',
    text: 'Yeh baat aapki life badal sakti hai:',
    platforms: ['all'],
  },
];

/**
 * Filter CTA presets by language, category, or search term
 */
export function filterCtaPresets(options: {
  language?: CtaLanguage | 'all';
  category?: CtaCategoryKey | 'all';
  searchTerm?: string;
}): CtaPreset[] {
  const { language = 'all', category = 'all', searchTerm = '' } = options;
  const term = searchTerm.trim().toLowerCase();

  return REELS_CTA_PRESETS.filter((preset) => {
    if (language !== 'all' && preset.language !== language) {
      return false;
    }
    if (category !== 'all' && preset.category !== category) {
      return false;
    }
    if (term) {
      const matchText = preset.text.toLowerCase().includes(term);
      const categoryMeta = CTA_CATEGORIES[preset.category];
      const matchCategory =
        categoryMeta.labelEn.toLowerCase().includes(term) ||
        categoryMeta.labelHi.toLowerCase().includes(term);
      return matchText || matchCategory;
    }
    return true;
  });
}

/**
 * Detects if a heading starts with 3 vertical spacer dots (. or · or • on separate lines)
 * Common in Instagram Reels & Facebook captions to separate CTA from video fold.
 */
export function hasThreeDotsPrefix(text: string): boolean {
  if (!text) return false;
  const normalized = text.replace(/\r\n/g, '\n').trimStart();
  return /^([.·•]\s*\n){3}/.test(normalized);
}

/**
 * Normalizes heading to ensure clean spacing before and after 3 dots spacer (. . .)
 */
export function ensureThreeDotsSpacing(text: string): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n');
  if (/^([.·•]\s*\n){3}/.test(normalized.trimStart())) {
    const cleanText = normalized.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trimStart();
    if (cleanText) {
      return `\n.\n.\n.\n\n${cleanText}`;
    }
  }
  return normalized;
}

/**
 * Toggles 3 vertical dots spacer (. . .) above heading with extra spacing before and after
 */
export function toggleThreeDotsPrefix(text: string): string {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  if (hasThreeDotsPrefix(normalized)) {
    return normalized.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trimStart();
  }
  const clean = normalized.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trimStart();
  return `\n.\n.\n.\n\n${clean}`;
}

/**
 * Explicitly applies or removes 3 vertical dots spacer above heading with extra spacing before and after
 */
export function applyThreeDotsPrefix(text: string, enable: boolean): string {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  const clean = normalized.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trimStart();
  if (enable) {
    return `\n.\n.\n.\n\n${clean}`;
  }
  return clean;
}

