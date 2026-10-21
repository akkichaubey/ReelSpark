'use strict';

import { TranscriptWord, SyncedPhraseSegment } from './types';

// Map of high-frequency keywords to viral animated emojis (supports English, Hindi & Hinglish)
const EMOJI_KEYWORD_MAP: Record<string, string> = {
  // Money / Wealth
  money: '💰',
  cash: '💵',
  rich: '🤑',
  rupee: '₹',
  paisa: '💰',
  paise: '💰',
  kamao: '💸',
  kamana: '💸',
  crore: '💎',
  lakh: '💰',

  // Fire / Viral / Trending
  fire: '🔥',
  viral: '🔥',
  trending: '📈',
  hot: '🔥',
  aag: '🔥',
  dhamaka: '💥',

  // Goals / Targets / Win
  target: '🎯',
  goal: '🎯',
  lakshya: '🎯',
  win: '🏆',
  winner: '🏆',
  jeet: '🏆',
  champion: '🥇',

  // Growth / Speed / Success
  success: '🚀',
  growth: '📈',
  grow: '🌱',
  fast: '⚡',
  speed: '⚡',
  rocket: '🚀',
  kamyabi: '🚀',
  safalta: '🚀',

  // Mind / Thinking / Idea
  idea: '💡',
  think: '🧠',
  mind: '🧠',
  brain: '🧠',
  soch: '💡',
  dimaag: '🧠',

  // Dreams / Magic / Inspiration
  dream: '✨',
  magic: '🪄',
  star: '⭐',
  sapna: '✨',
  khwab: '✨',
  future: '🔮',

  // Time / Urgency / Wait
  time: '⏳',
  watch: '⏱️',
  clock: '⏰',
  samay: '⏳',
  waqt: '⏳',
  wait: '⏸️',
  stop: '🛑',

  // Warning / Danger / Shock
  warning: '⚠️',
  danger: '⚠️',
  khatra: '⚠️',
  alert: '🚨',
  shock: '😱',
  secret: '🤫',
  mistake: '❌',
  galti: '❌',

  // Emotion / Love / Heart
  love: '❤️',
  heart: '❤️',
  pyaar: '❤️',
  dil: '❤️',
  smile: '😊',
  happy: '😄',
  khushi: '🥳',
  sad: '😢',

  // Power / Strength / Focus
  power: '💪',
  strong: '💪',
  focus: '👁️',
  hardwork: '⚡',
  mehnat: '💪',
  taqat: '⚡',

  // Books / Learning / Study
  learn: '📚',
  study: '📖',
  kitab: '📚',
  padhai: '🎓',
  knowledge: '🧠',
  gyan: '💡',

  // Audio / Speech / Communication
  speak: '🎙️',
  bolna: '🗣️',
  voice: '🎙️',
  audio: '🎧',
  listen: '👂',
  suno: '👂',
  media: '📰',

  // Truth / 100% / Real
  truth: '💯',
  real: '💯',
  sach: '💯',
  verified: '✅',
  pakka: '🤝',
};

// Hindi Devanagari character mapping to Romanized Hinglish
const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah'
};

const MATRAS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy'
};

// Common word dictionary overrides for natural, accurate Hinglish
const HINDI_WORD_DICTIONARY: Record<string, string> = {
  'है': 'hai',
  'हैं': 'hain',
  'हो': 'ho',
  'था': 'tha',
  'थी': 'thi',
  'थे': 'the',
  'नहीं': 'nahi',
  'ना': 'na',
  'मत': 'mat',
  'और': 'aur',
  'भी': 'bhi',
  'तो': 'to',
  'जो': 'jo',
  'वो': 'wo',
  'यह': 'yeh',
  'ये': 'ye',
  'वह': 'woh',
  'वे': 've',
  'कि': 'ki',
  'की': 'ki',
  'के': 'ke',
  'का': 'ka',
  'को': 'ko',
  'से': 'se',
  'में': 'mein',
  'पर': 'par',
  'तक': 'tak',
  'लिए': 'liye',
  'साथ': 'saath',
  'बाद': 'baad',
  'पहले': 'pehle',
  'आप': 'aap',
  'तुम': 'tum',
  'हम': 'hum',
  'मैं': 'main',
  'मेरा': 'mera',
  'मेरी': 'meri',
  'मेरे': 'mere',
  'तेरा': 'tera',
  'तेरी': 'teri',
  'तेरे': 'tere',
  'उसका': 'uska',
  'उसकी': 'uski',
  'उसके': 'uske',
  'उनका': 'unka',
  'उनकी': 'unki',
  'उनके': 'unke',
  'अपना': 'apna',
  'अपनी': 'apni',
  'अपने': 'apne',
  'क्या': 'kya',
  'क्यों': 'kyun',
  'कैसे': 'kaise',
  'कब': 'kab',
  'कहाँ': 'kahan',
  'कहा': 'kaha',
  'कहो': 'kaho',
  'करना': 'karna',
  'करो': 'karo',
  'करते': 'karte',
  'करती': 'karti',
  'करता': 'karta',
  'किया': 'kiya',
  'दिए': 'diye',
  'दिया': 'diya',
  'देना': 'dena',
  'लो': 'lo',
  'लेना': 'lena',
  'सकते': 'sakte',
  'सकती': 'sakti',
  'सकता': 'sakta',
  'जीवन': 'jeevan',
  'जिंदगी': 'zindagi',
  'सपना': 'sapna',
  'सपने': 'sapne',
  'लक्ष्य': 'lakshya',
  'सफलता': 'safalta',
  'पहचान': 'pehchan',
  'असली': 'asli',
  'चलते': 'chalte',
  'गिरते': 'girte',
  'हार': 'haar',
  'जीत': 'jeet',
  'सवाल': 'sawal',
  'सरकार': 'sarkar',
  'लोकतंत्र': 'loktantra',
  'नागरिक': 'nagrik',
  'अधिकार': 'adhikar',
  'व्यवस्था': 'vyavastha',
  'डर': 'dar',
  'शांति': 'shanti',
  'रहस्य': 'rahasya',
  'इच्छा': 'ichha',
  'योजना': 'yojna',
  'मनुष्य': 'manushya',
  'शुरू': 'shuru',
  'खत्म': 'khatam',
  'मेहनत': 'mehnat',
  'समय': 'samay',
  'मांगती': 'maangti',
  'मांगता': 'maangta',
  'कार्रवाई': 'karwai',
};

/**
 * Phonetically transliterates a Devanagari Hindi string to natural Romanized Hinglish.
 */
export function devanagariToHinglish(text: string): string {
  if (!text) return '';

  return text
    .split(/\s+/)
    .map((word) => {
      const cleanPunct = word.replace(/[^\u0900-\u097F]/g, '');
      const punctAfter = word.slice(cleanPunct.length);

      if (HINDI_WORD_DICTIONARY[cleanPunct]) {
        return HINDI_WORD_DICTIONARY[cleanPunct] + punctAfter;
      }

      let res = '';
      let i = 0;
      while (i < word.length) {
        const ch = word[i];
        if (VOWELS[ch]) {
          res += VOWELS[ch];
        } else if (CONSONANTS[ch]) {
          const next = word[i + 1];
          if (next === '्') {
            // Halant (half consonant)
            res += CONSONANTS[ch];
            i += 2;
            continue;
          } else if (MATRAS[next]) {
            res += CONSONANTS[ch] + MATRAS[next];
            i += 2;
            continue;
          } else if (CONSONANTS[next] || VOWELS[next] || !next) {
            // Inherited 'a' vowel unless ending of word
            res += CONSONANTS[ch] + (i === word.length - 1 ? '' : 'a');
          } else {
            res += CONSONANTS[ch];
          }
        } else if (MATRAS[ch]) {
          res += MATRAS[ch];
        } else {
          res += ch;
        }
        i++;
      }
      return res;
    })
    .join(' ');
}

/**
 * Returns a matching emoji for a given word text, or undefined if no strong match.
 */
export function getKeywordEmoji(word: string): string | undefined {
  if (!word) return undefined;
  const clean = word.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '').trim();
  if (!clean) return undefined;

  // Direct English / Hinglish match
  if (EMOJI_KEYWORD_MAP[clean]) {
    return EMOJI_KEYWORD_MAP[clean];
  }

  // Devanagari transliteration match
  const romanized = devanagariToHinglish(clean).toLowerCase();
  if (EMOJI_KEYWORD_MAP[romanized]) {
    return EMOJI_KEYWORD_MAP[romanized];
  }

  return undefined;
}

/**
 * Automatically enriches transcript words with relevant viral emojis based on keywords or importance.
 */
export function enrichWordsWithEmojis(words: TranscriptWord[]): TranscriptWord[] {
  return words.map((w) => {
    const matchedEmoji = getKeywordEmoji(w.text);
    return {
      ...w,
      emoji: matchedEmoji || w.emoji,
    };
  });
}
