import { z } from 'zod';

export const titleModes = ['viral', 'meaningful', 'seo'] as const;
export const titleLanguages = ['hinglish', 'hi', 'en', 'auto'] as const;
export const titlePlatforms = ['youtube', 'instagram', 'facebook', 'threads'] as const;
export const titleCategories = ['overall', 'emotional', 'curiosity', 'meaningful', 'seo'] as const;
export const titleCategoryLabels = {
  overall: 'Best Overall Viral Title',
  emotional: 'Emotional / Relatable',
  curiosity: 'Curiosity-Driven',
  meaningful: 'Meaningful / Philosophical',
  seo: 'SEO-Friendly',
} as const;
export const titleLimits = { youtube: 100, instagram: 90, facebook: 90, threads: 90 } as const;

export function isValidTitle(title: string, platform: typeof titlePlatforms[number]) {
  const text = title.trim();
  return text.length > 0 && text.length <= titleLimits[platform] && !/[\r\n]/u.test(text) &&
    (platform !== 'youtube' || !/[<>]/u.test(text));
}

export const titleRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(60_000),
  context: z.string().trim().max(8_000).default(''),
  mode: z.enum(titleModes).default('viral'),
  language: z.enum(titleLanguages).default('hinglish'),
  platform: z.enum(titlePlatforms).default('youtube'),
  categories: z.array(z.enum(titleCategories)).min(1).max(5)
    .refine(categories => new Set(categories).size === categories.length).default([...titleCategories]),
  exclude: z.array(z.string().max(200)).max(40).default([]),
});
export type TitleRequest = z.infer<typeof titleRequestSchema>;

export function selectTitleTranscript(
  segments: readonly { start: number; end: number; text: string }[],
  start: number,
  end: number,
) {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const selected = ordered.filter(segment => segment.start >= start && segment.end <= end);
  const nearby = ordered.filter(segment =>
    segment.end > start - 20 && segment.start < end + 20 &&
    (segment.start < start || segment.end > end));
  return { transcript: selected.map(segment => segment.text).join(' '), context: nearby.map(segment => segment.text).join(' ').slice(0, 8_000) };
}

const weights = { hook: 20, emotion: 15, curiosity: 15, relevance: 20, clarity: 10, relatability: 10, search: 10 } as const;
const rating = z.number().min(0).max(100);
const suggestionSchema = z.object({
  title: z.string().trim().min(1),
  category: z.enum(titleCategories),
  explanation: z.string().trim().min(1).max(400),
  evidence: z.string().trim().min(1).max(600),
  ratings: z.object({ hook: rating, emotion: rating, curiosity: rating, relevance: rating, clarity: rating, relatability: rating, search: rating }),
});
export type TitleSuggestion = Omit<z.infer<typeof suggestionSchema>, 'ratings'> & { score: number };

const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const titleKey = (text: string) => normalize(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');

export function validateTitleSuggestions(json: string, request: TitleRequest): TitleSuggestion[] {
  const { suggestions } = z.object({ suggestions: z.array(suggestionSchema) }).parse(JSON.parse(json));
  const transcript = normalize(request.transcript);
  const excluded = new Set(request.exclude.map(titleKey));
  const categories = new Set(request.categories);
  if (suggestions.length !== categories.size) throw new Error('Incorrect number of suggestions.');
  return suggestions.map(({ ratings, ...suggestion }) => {
    const key = titleKey(suggestion.title);
    const hasDevanagari = /\p{Script=Devanagari}/u.test(suggestion.title);
    if (!categories.delete(suggestion.category) || !key || excluded.has(key) ||
        !isValidTitle(suggestion.title, request.platform) ||
        (request.language === 'hi' && !hasDevanagari) ||
        ((request.language === 'hinglish' || request.language === 'en') && (hasDevanagari || !/\p{Script=Latin}/u.test(suggestion.title))) ||
        !transcript.includes(normalize(suggestion.evidence)) || ratings.relevance < 60) {
      throw new Error('Suggestions failed grounding, language, or uniqueness validation.');
    }
    excluded.add(key);
    const score = Math.round((Object.keys(weights) as Array<keyof typeof weights>)
      .reduce((sum, criterion) => sum + ratings[criterion] * weights[criterion], 0) / 100);
    return { ...suggestion, score };
  }).sort((a, b) => b.score - a.score);
}
