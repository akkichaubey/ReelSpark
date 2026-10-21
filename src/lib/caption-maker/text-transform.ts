import {
  Caption9Position,
  CaptionPosition,
  TextAlignment,
  TextTransformMode,
} from './types';

/**
 * Apply text transformation mode to a given string.
 * Supports:
 * - 'uppercase': ALL CAPS
 * - 'lowercase': all lowercase
 * - 'sentence': First letter capitalized, rest lowercase (respecting punctuation boundaries)
 * - 'title': Title Case (Every Word Capitalized)
 * - 'none': Verbatim as spoken
 *
 * Falls back to legacyUppercase boolean if textTransform is undefined.
 */
export function applyTextTransform(
  text: string,
  mode?: TextTransformMode,
  legacyUppercase = false
): string {
  if (!text) return '';

  const activeMode: TextTransformMode =
    mode || (legacyUppercase ? 'uppercase' : 'none');

  switch (activeMode) {
    case 'uppercase':
      return text.toUpperCase();

    case 'lowercase':
      return text.toLowerCase();

    case 'title':
      return text.replace(
        /(?:^|\s|\/|[(\[{])\p{L}/gu,
        (char) => char.toUpperCase()
      );

    case 'sentence': {
      // Lowercase everything first, then capitalize start of sentences (. ! ? or start of string)
      const lower = text.toLowerCase();
      return lower.replace(
        /(?:^|[.!?]\s*|\n\s*)\p{L}/gu,
        (char) => char.toUpperCase()
      );
    }

    case 'none':
    default:
      return text;
  }
}

/**
 * Transform an individual word within a spoken caption stream.
 * In sentence mode, accepts isSentenceStart flag so the first word
 * of a phrase or after punctuation is properly capitalized.
 */
export function applyWordTransform(
  wordText: string,
  mode?: TextTransformMode,
  legacyUppercase = false,
  isSentenceStart = false
): string {
  if (!wordText) return '';

  const activeMode: TextTransformMode =
    mode || (legacyUppercase ? 'uppercase' : 'none');

  switch (activeMode) {
    case 'uppercase':
      return wordText.toUpperCase();

    case 'lowercase':
      return wordText.toLowerCase();

    case 'title':
      return wordText.replace(/^\p{L}/u, (char) => char.toUpperCase());

    case 'sentence': {
      if (isSentenceStart) {
        return wordText.replace(/^\p{L}/u, (char) => char.toUpperCase());
      }
      return wordText.toLowerCase();
    }

    case 'none':
    default:
      return wordText;
  }
}

/**
 * Resolve any combination of CaptionPosition and TextAlignment into a definitive 9-position anchor.
 */
export function resolveNinePosition(
  position: CaptionPosition,
  textAlign: TextAlignment = 'center'
): Caption9Position {
  const valid9: Caption9Position[] = [
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center',
    'center-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ];

  // If position is already a distinct 2D key (excluding ambiguous 'center'), return it directly
  if (position !== 'center' && valid9.includes(position as Caption9Position)) {
    return position as Caption9Position;
  }

  const effectiveAlign = textAlign === 'custom' ? 'center' : textAlign;

  if (position === 'top') {
    if (effectiveAlign === 'left') return 'top-left';
    if (effectiveAlign === 'right') return 'top-right';
    return 'top-center';
  }

  if (position === 'bottom') {
    if (effectiveAlign === 'left') return 'bottom-left';
    if (effectiveAlign === 'right') return 'bottom-right';
    return 'bottom-center';
  }

  if (position === 'center') {
    if (effectiveAlign === 'left') return 'center-left';
    if (effectiveAlign === 'right') return 'center-right';
    return 'center';
  }

  // Fallback for custom or unknown
  return 'bottom-center';
}

export interface NinePositionCoordinates {
  ninePos: Caption9Position;
  top: string;
  left: string;
  transform: string;
  alignItems: 'flex-start' | 'center' | 'flex-end';
  textAlign: 'left' | 'center' | 'right';
  assAlignment: number; // ASS numpad alignment code (1 to 9)
  assXPercent: number;  // 0 - 100%
  assYPercent: number;  // 0 - 100%
}

/**
 * Calculate visual CSS positioning and ASS subtitle anchor parameters for any position.
 */
export function getNinePositionCoordinates(
  position: CaptionPosition,
  customX?: number,
  customY?: number,
  textAlign: TextAlignment = 'center'
): NinePositionCoordinates {
  const isExplicit9 =
    position !== 'center' &&
    [
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ].includes(position);

  const isCustom = !isExplicit9 && (position === 'custom' || textAlign === 'custom');

  if (isCustom) {
    const posXPercent = customX ?? 50;
    const posYPercent = customY ?? 20;
    const effectiveAlign = textAlign === 'custom' ? 'center' : textAlign;
    const alignX =
      effectiveAlign === 'left' ? 'flex-start' : effectiveAlign === 'right' ? 'flex-end' : 'center';

    let assAlign = 5;
    if (effectiveAlign === 'left') assAlign = 4;
    else if (effectiveAlign === 'right') assAlign = 6;

    return {
      ninePos: 'center',
      top: `${posYPercent}%`,
      left: `${posXPercent}%`,
      transform: 'translate(-50%, -50%)',
      alignItems: alignX,
      textAlign: effectiveAlign,
      assAlignment: assAlign,
      assXPercent: posXPercent,
      assYPercent: posYPercent,
    };
  }

  const ninePos = resolveNinePosition(position, textAlign);

  switch (ninePos) {
    case 'top-left':
      return {
        ninePos,
        top: '16%',
        left: '12%',
        transform: 'translate(0, 0)',
        alignItems: 'flex-start',
        textAlign: 'left',
        assAlignment: 7,
        assXPercent: 12,
        assYPercent: 16,
      };

    case 'top-center':
      return {
        ninePos,
        top: '16%',
        left: '50%',
        transform: 'translate(-50%, 0)',
        alignItems: 'center',
        textAlign: 'center',
        assAlignment: 8,
        assXPercent: 50,
        assYPercent: 16,
      };

    case 'top-right':
      return {
        ninePos,
        top: '16%',
        left: '84%',
        transform: 'translate(-100%, 0)',
        alignItems: 'flex-end',
        textAlign: 'right',
        assAlignment: 9,
        assXPercent: 84,
        assYPercent: 16,
      };

    case 'center-left':
      return {
        ninePos,
        top: '50%',
        left: '12%',
        transform: 'translate(0, -50%)',
        alignItems: 'flex-start',
        textAlign: 'left',
        assAlignment: 4,
        assXPercent: 12,
        assYPercent: 50,
      };

    case 'center':
      return {
        ninePos,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        alignItems: 'center',
        textAlign: 'center',
        assAlignment: 5,
        assXPercent: 50,
        assYPercent: 50,
      };

    case 'center-right':
      return {
        ninePos,
        top: '50%',
        left: '84%',
        transform: 'translate(-100%, -50%)',
        alignItems: 'flex-end',
        textAlign: 'right',
        assAlignment: 6,
        assXPercent: 84,
        assYPercent: 50,
      };

    case 'bottom-left':
      return {
        ninePos,
        top: '76%',
        left: '12%',
        transform: 'translate(0, -100%)',
        alignItems: 'flex-start',
        textAlign: 'left',
        assAlignment: 1,
        assXPercent: 12,
        assYPercent: 76,
      };

    case 'bottom-right':
      return {
        ninePos,
        top: '76%',
        left: '84%',
        transform: 'translate(-100%, -100%)',
        alignItems: 'flex-end',
        textAlign: 'right',
        assAlignment: 3,
        assXPercent: 84,
        assYPercent: 76,
      };

    case 'bottom-center':
    default:
      return {
        ninePos: 'bottom-center',
        top: '76%',
        left: '50%',
        transform: 'translate(-50%, -100%)',
        alignItems: 'center',
        textAlign: 'center',
        assAlignment: 2,
        assXPercent: 50,
        assYPercent: 76,
      };
  }
}

/**
 * Safely splits a string into true typographical grapheme clusters / characters.
 * Handles complex Indic / Devanagari scripts (Hindi, Marathi, Nepali, Sanskrit),
 * emojis (including multi-byte flags and skin tones), and Latin characters without
 * breaking ligatures, viramas (halant), or matras into orphaned dotted circles (◌).
 */
export function splitGraphemes(text: string): string[] {
  if (!text) return [];
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), (s: any) => s.segment);
    } catch {
      // Fallback below
    }
  }

  // Regex fallback matching Unicode grapheme clusters (combining marks, zero-width joiners)
  const matches = text.match(/[\P{M}\u200D](\p{M}|\u200D)*/gu);
  if (matches) return matches;

  return Array.from(text);
}

/**
 * Checks if a string contains Indic/Devanagari characters (U+0900 to U+097F).
 */
export function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text || '');
}
