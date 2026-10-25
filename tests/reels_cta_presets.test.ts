import assert from 'node:assert';
import {
  REELS_CTA_PRESETS,
  CTA_CATEGORIES,
  filterCtaPresets,
  CtaCategoryKey,
  hasThreeDotsPrefix,
  toggleThreeDotsPrefix,
  applyThreeDotsPrefix,
} from '../src/lib/social-intelligence/cta-presets';
import { formatSocialLinksBlock, ResolvedEligibleLink } from '../src/lib/social-intelligence/link-engine';

console.log('\n======================================================');
console.log('🚀 REELSPARK — REELS CTA PRESETS & HEADINGS TEST SUITE');
console.log('======================================================\n');

// 1. Verify Categories
console.log('▶ Section 1: Predefined Categories Structure');
const requiredCategories: CtaCategoryKey[] = [
  'follow',
  'like_share',
  'save',
  'comment',
  'watch_more',
  'motivational',
  'viral',
];

for (const cat of requiredCategories) {
  assert(CTA_CATEGORIES[cat], `Category metadata for ${cat} must exist`);
  assert(CTA_CATEGORIES[cat].labelEn, `English label for ${cat} must exist`);
  assert(CTA_CATEGORIES[cat].labelHi, `Hindi label for ${cat} must exist`);
}
console.log('  ✓ All 7 required categories have valid English and Hindi metadata');

// 2. Verify Prompt Predefined Options
console.log('▶ Section 2: User Prompt Required Phrases Verification');
const expectedPhrases = [
  // Follow Us
  'Follow for more',
  'Follow for daily updates',
  'Follow for more amazing content',
  // Like & Share
  'Like if you agree',
  'Share with your friends',
  'Spread the word',
  // Save Post
  'Save this for later',
  "Don't forget to save",
  'Bookmark this Reel',
  // Comment & Engage
  'What do you think?',
  'Drop your thoughts below',
  'Comment your opinion',
  // Watch More
  'Watch till the end',
  "Don't miss this",
  'More content coming soon',
  // Motivational
  'Daily inspiration',
  'Your daily dose of motivation',
  'Stay inspired',
  // Trending & Viral
  'Must watch',
  'You need to see this',
  "Don't scroll without watching",
];

for (const phrase of expectedPhrases) {
  const match = REELS_CTA_PRESETS.some((preset) =>
    preset.text.toLowerCase().includes(phrase.toLowerCase())
  );
  assert(match, `Expected preset phrase "${phrase}" must be present in the catalog`);
}
console.log(`  ✓ All ${expectedPhrases.length} user-specified CTA phrases are verified in the catalog`);

// 3. Multi-Language Support (English, Hindi, Hinglish)
console.log('▶ Section 3: Multi-Language Options Coverage');
const enPresets = filterCtaPresets({ language: 'en' });
const hiPresets = filterCtaPresets({ language: 'hi' });
const hinPresets = filterCtaPresets({ language: 'hinglish' });

assert(enPresets.length >= 25, `Expected at least 25 English presets, found ${enPresets.length}`);
assert(hiPresets.length >= 15, `Expected at least 15 Hindi presets, found ${hiPresets.length}`);
assert(hinPresets.length >= 10, `Expected at least 10 Hinglish presets, found ${hinPresets.length}`);
console.log(`  ✓ English: ${enPresets.length} presets`);
console.log(`  ✓ Hindi: ${hiPresets.length} presets (Devanagari script)`);
console.log(`  ✓ Hinglish: ${hinPresets.length} presets (Conversational Roman Hindi)`);

// 4. Search and Category Filtering
console.log('▶ Section 4: Filtering & Search Logic');
const followCategoryItems = filterCtaPresets({ category: 'follow' });
assert(followCategoryItems.length > 0, 'Follow category must return items');
assert(
  followCategoryItems.every((item) => item.category === 'follow'),
  'All returned items must belong to follow category'
);

const searchResults = filterCtaPresets({ searchTerm: 'motivation' });
assert(searchResults.length > 0, 'Search for "motivation" must return relevant items');
assert(
  searchResults.some((item) => item.text.toLowerCase().includes('motivation')),
  'Search results must include matching text'
);

const hindiSearchResults = filterCtaPresets({ language: 'hi', searchTerm: 'फॉलो' });
assert(hindiSearchResults.length > 0, 'Hindi search for "फॉलो" must return items');
console.log('  ✓ Category filtering, search keywords, and combined language queries verified');

// 5. Link Engine Integration
console.log('▶ Section 5: Integration with Link Engine formatSocialLinksBlock');
const mockLinks: ResolvedEligibleLink[] = [
  {
    account: {
      id: 'acc-1',
      userId: 'user-1',
      platform: 'instagram',
      accountUrl: 'https://instagram.com/truevoiceclub',
      displayName: 'TrueVoice',
      isPrimary: true,
      enabled: true,
      createdAt: '',
      updatedAt: '',
    },
    formattedText: '📸 Instagram (TrueVoice): https://instagram.com/truevoiceclub',
    isTargetPlatform: false,
  },
  {
    account: {
      id: 'acc-2',
      userId: 'user-1',
      platform: 'youtube',
      accountUrl: 'https://youtube.com/@truevoiceclub',
      displayName: 'TrueVoice',
      isPrimary: false,
      enabled: true,
      createdAt: '',
      updatedAt: '',
    },
    formattedText: '▶️ YouTube (TrueVoice): https://youtube.com/@truevoiceclub',
    isTargetPlatform: false,
  },
];

// Test with an English CTA
const selectedEnglishCta = 'Follow for daily updates:';
const englishBlock = formatSocialLinksBlock(mockLinks, { customHeading: selectedEnglishCta });
assert(
  englishBlock.startsWith(selectedEnglishCta),
  'Formatted block must start with selected English CTA heading'
);
assert(
  englishBlock.includes(`${selectedEnglishCta}\n\n📸`),
  'Formatted block must have a blank line gap (\\n\\n) after heading before links'
);
assert(
  englishBlock.includes('📸 Instagram (TrueVoice): https://instagram.com/truevoiceclub'),
  'Formatted block must include Instagram link'
);

// Test with a Hindi CTA
const selectedHindiCta = 'रोजाना ऐसी वीडियो के लिए फॉलो करें:';
const hindiBlock = formatSocialLinksBlock(mockLinks, { customHeading: selectedHindiCta });
assert(
  hindiBlock.startsWith(selectedHindiCta),
  'Formatted block must start with selected Hindi CTA heading'
);
assert(
  hindiBlock.includes(`${selectedHindiCta}\n\n📸`),
  'Formatted block must have a blank line gap (\\n\\n) after Hindi heading before links'
);

// Test with blank heading (omitted)
const blankBlock = formatSocialLinksBlock(mockLinks, { customHeading: '' });
assert(
  !blankBlock.startsWith('\n') && blankBlock.startsWith('📸'),
  'Blank heading must omit leading text cleanly'
);
console.log('  ✓ Deterministic formatSocialLinksBlock properly formats English, Hindi, and omitted headings');

// 6. Test 3 Dots Vertical Spacer Above Heading
console.log('▶ Section 6: 3 Dots Vertical Spacer (. . .) Above Heading');
const rawHeading = 'Follow for daily updates:';
assert(!hasThreeDotsPrefix(rawHeading), 'Plain heading must not have 3 dots prefix');

const withDots = toggleThreeDotsPrefix(rawHeading);
assert(hasThreeDotsPrefix(withDots), 'Toggled heading must have 3 dots prefix');
assert(
  withDots === `\n.\n.\n.\n\n${rawHeading}`,
  '3 dots prefix must format with one space before and after the 3 dots'
);

const toggledOff = toggleThreeDotsPrefix(withDots);
assert(!hasThreeDotsPrefix(toggledOff), 'Toggling again must remove 3 dots prefix');
assert(toggledOff === rawHeading, 'Heading text must be preserved after toggling off');

// Verify middle dots · and bullet dots • detection
assert(hasThreeDotsPrefix('·\n·\n·\nFollow for more:'), 'Middle dot (·) vertical spacer must be detected');
assert(hasThreeDotsPrefix('•\n•\n•\nFollow for more:'), 'Bullet dot (•) vertical spacer must be detected');

// Verify link block format with 3 dots spacer
const formattedBlockWithDots = formatSocialLinksBlock(mockLinks, { customHeading: withDots });
const expectedPrefix = '\n.\n.\n.\n\nFollow for daily updates:';
assert(
  formattedBlockWithDots.startsWith(expectedPrefix),
  'Formatted social links block must include the 3 dots vertical spacer lines with spacing before and after'
);

// Verify automatic gap insertion when input lacks the gap between dots and heading
const unspacedInput = '.\n.\n.\nFollow for daily updates:';
const autoSpacedBlock = formatSocialLinksBlock(mockLinks, { customHeading: unspacedInput });
assert(
  autoSpacedBlock.startsWith('\n.\n.\n.\n\nFollow for daily updates:'),
  'formatSocialLinksBlock must automatically insert the blank line gap between the 3 dots and the heading'
);

// Verify threeDotsSpacer flag with clean heading (no dots in heading input)
const cleanHeadingWithFlag = formatSocialLinksBlock(mockLinks, {
  customHeading: 'Follow for daily updates:',
  threeDotsSpacer: true,
});
assert(
  cleanHeadingWithFlag.startsWith('\n.\n.\n.\n\nFollow for daily updates:'),
  'threeDotsSpacer flag must prepend 3 dots with proper gaps when heading has only text'
);

const cleanHeadingDisabled = formatSocialLinksBlock(mockLinks, {
  customHeading: 'Follow for daily updates:',
  threeDotsSpacer: false,
});
assert(
  cleanHeadingDisabled.startsWith('Follow for daily updates:\n\n📸'),
  'threeDotsSpacer: false must omit 3 dots and keep only heading text with gap before links'
);
console.log('  ✓ 3 dots vertical spacer (. . .) prefixing, detection, toggling, and output formatting verified');

console.log('\n======================================================');
console.log('🎉 ALL REELS CTA PRESETS TESTS PASSED CLEANLY!');
console.log('======================================================\n');
