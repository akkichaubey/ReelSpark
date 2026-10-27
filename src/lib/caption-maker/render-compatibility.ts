import type { CaptionStyle } from './types';

export interface AssRenderCompatibility {
  /** True when the selected style does not use effects that the ASS pipeline cannot represent. */
  previewParity: boolean;
  limitations: string[];
}

/**
 * Describe known differences between the Remotion browser composition and the
 * FFmpeg/libass subtitle pipeline. Keep this conservative: it is better to
 * recommend Remotion than to imply that a visual effect will export exactly.
 */
export function getAssRenderCompatibility(style: CaptionStyle): AssRenderCompatibility {
  const limitations: string[] = [];
  const backgroundStyle = style.backgroundStyle || 'none';
  const hasCustomBackground = Boolean(
    style.backgroundColor &&
      style.backgroundColor !== 'transparent' &&
      (style.backgroundOpacity ?? 1) > 0
  );

  if (backgroundStyle === 'frosted-glass') {
    limitations.push('Frosted glass blur, translucency, and rounded border are not reproduced by ASS.');
  } else if (backgroundStyle === 'marker-bar') {
    limitations.push('Marker-bar background and its rounded corners are not reproduced by ASS.');
  } else if (backgroundStyle !== 'none') {
    limitations.push('Caption pill/outline backgrounds and their rounded corners are not reproduced by ASS.');
  } else if (hasCustomBackground) {
    limitations.push('Custom caption background color and opacity are not reproduced by ASS.');
  }

  if (
    style.highlightAnimation === 'background' ||
    (Boolean(style.activeWordBgColor) &&
      !['color-change', 'none'].includes(style.highlightAnimation))
  ) {
    limitations.push('The active-word background pill/highlight is not reproduced by ASS.');
  }

  if (style.animationPreset?.startsWith('letters-')) {
    limitations.push('Per-letter GSAP stagger, easing, and timing are not reproduced by ASS.');
  } else if (
    style.animationPreset === 'words-slide-up' ||
    style.animationPreset === 'words-rotate-in'
  ) {
    limitations.push('Word entrance motion is only approximated; GSAP easing and timing differ.');
  } else if (
    style.animationPreset &&
    !['clean', 'minimal'].includes(style.animationPreset) &&
    !['none', 'color-change'].includes(style.highlightAnimation)
  ) {
    limitations.push('Animated word scale/highlight timing is an ASS approximation, not the exact GSAP preview.');
  }

  if (style.textEffect === 'neon-glow') {
    limitations.push('Layered neon glow and its spread are not reproduced by ASS.');
  } else if (style.textEffect === 'retro-3d') {
    limitations.push('The offset 3D extrusion is not reproduced by ASS.');
  } else if (style.textEffect === 'soft-ambient') {
    limitations.push('Soft ambient shadow is simplified to a basic ASS shadow.');
  } else if (style.textEffect === 'drop-shadow') {
    limitations.push('Drop-shadow blur and direction are approximated by the ASS shadow model.');
  }

  return { previewParity: limitations.length === 0, limitations };
}
