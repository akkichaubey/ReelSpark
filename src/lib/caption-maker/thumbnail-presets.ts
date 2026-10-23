'use strict';

import {
  ThumbnailSettings,
  ThumbnailBadgeStyle,
  ThumbnailBadgeShape,
  ThumbnailLayoutPosition,
  ThumbnailBackgroundType,
  ImageAsset,
} from './types';
import { normalizeHookWord } from './hook-quality';

export type {
  ThumbnailSettings,
  ThumbnailBadgeStyle,
  ThumbnailBadgeShape,
  ThumbnailLayoutPosition,
  ThumbnailBackgroundType,
};

export interface ThumbnailPreset {
  id: string;
  name: string;
  tagline: string;
  previewBg: string;
  badgePreview: { text: string; bg: string; color: string };
  settings: Partial<ThumbnailSettings>;
}

export interface ThumbnailGradient {
  id: string;
  name: string;
  css: string;
  startColor: string;
  endColor: string;
}

export const THUMBNAIL_GRADIENTS: ThumbnailGradient[] = [
  {
    id: 'dark-vignette',
    name: 'Obsidian Studio',
    css: 'radial-gradient(circle at center, #27272a 0%, #09090b 100%)',
    startColor: '#27272a',
    endColor: '#09090b',
  },
  {
    id: 'cyber-abyss',
    name: 'Cyber Abyss',
    css: 'linear-gradient(135deg, #090d16 0%, #0d1e3d 50%, #030712 100%)',
    startColor: '#090d16',
    endColor: '#0d1e3d',
  },
  {
    id: 'sunset-purple',
    name: 'Sunset Purple',
    css: 'linear-gradient(135deg, #18052e 0%, #3b0764 50%, #701a75 100%)',
    startColor: '#18052e',
    endColor: '#701a75',
  },
  {
    id: 'emerald-night',
    name: 'Emerald Night',
    css: 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #02120e 100%)',
    startColor: '#022c22',
    endColor: '#064e3b',
  },
  {
    id: 'fire-ember',
    name: 'Fire Ember',
    css: 'linear-gradient(135deg, #2a0808 0%, #450a0a 50%, #78350f 100%)',
    startColor: '#2a0808',
    endColor: '#78350f',
  },
  {
    id: 'gold-luxury',
    name: 'Gold Luxury',
    css: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #451a03 100%)',
    startColor: '#1c1917',
    endColor: '#451a03',
  },
];

export const QUICK_BADGES = [
  'MUST WATCH',
  'VIRAL',
  'PART 1',
  'SECRET',
  'NEW',
  'HOW TO',
  'STOP THIS',
  'PRO TIP',
  'DON\'T MISS',
  'NOBODY TELLS YOU',
];

export const THUMBNAIL_PRESETS: ThumbnailPreset[] = [
  {
    id: 'hormozi',
    name: 'Hormozi Punch',
    tagline: 'High contrast bold viral headline with #FCD905 punch and deep shadow',
    previewBg: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
    badgePreview: { text: 'MUST WATCH', bg: '#FCD905', color: '#000000' },
    settings: {
      preset: 'hormozi',
      fontFamily: 'Montserrat',
      fontSize: 78,
      fontWeight: '900',
      letterSpacing: 0,
      textTransform: 'uppercase',
      textColor: '#FFFFFF',
      highlightColor: '#FCD905',
      badgeText: 'MUST WATCH',
      badgeStyle: 'solid',
      badgeColor: '#FCD905',
      strokeWidth: 8,
      strokeColor: '#000000',
      shadowBlur: 20,
      shadowColor: 'rgba(0,0,0,0.9)',
      boxBackground: false,
      position: 'center',
      textAlign: 'center',
      overlayDarkness: 0.60,
      overlayType: 'radial-vignette',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    tagline: 'Electric neon cyan glow with yellow highlights and modern tech aesthetic',
    previewBg: 'linear-gradient(135deg, #050c1e 0%, #001f3f 100%)',
    badgePreview: { text: 'VIRAL HACK', bg: '#00F0FF', color: '#000000' },
    settings: {
      preset: 'cyber',
      fontFamily: 'Outfit',
      fontSize: 74,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      textColor: '#00F0FF',
      highlightColor: '#FCD905',
      badgeText: 'VIRAL HACK',
      badgeStyle: 'glow',
      badgeColor: '#00F0FF',
      strokeWidth: 3,
      strokeColor: '#050c1e',
      shadowBlur: 26,
      shadowColor: '#00f0ff',
      boxBackground: false,
      position: 'center',
      textAlign: 'center',
      overlayDarkness: 0.65,
      overlayType: 'linear-bottom',
    },
  },
  {
    id: 'minimal',
    name: 'Clean Minimalist',
    tagline: 'Editorial YouTube & TikTok style with clean typography and bottom anchor',
    previewBg: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
    badgePreview: { text: 'PRO TIP', bg: '#FFFFFF', color: '#000000' },
    settings: {
      preset: 'minimal',
      fontFamily: 'Inter',
      fontSize: 70,
      fontWeight: '800',
      letterSpacing: -1,
      textTransform: 'none',
      textColor: '#FFFFFF',
      highlightColor: '#FCD905',
      badgeText: 'PRO TIP',
      badgeStyle: 'pill',
      badgeColor: '#FFFFFF',
      strokeWidth: 0,
      strokeColor: '#000000',
      shadowBlur: 14,
      shadowColor: 'rgba(0,0,0,0.7)',
      boxBackground: false,
      position: 'bottom',
      textAlign: 'left',
      overlayDarkness: 0.55,
      overlayType: 'linear-bottom',
    },
  },
  {
    id: 'cinema',
    name: 'Cinema Gold',
    tagline: 'Luxury serif gold typography with dramatic cinematic letterbox vignette',
    previewBg: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 100%)',
    badgePreview: { text: 'EXCLUSIVE', bg: '#FCD905', color: '#000000' },
    settings: {
      preset: 'cinema',
      fontFamily: 'Cinzel',
      fontSize: 72,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      textColor: '#FCD905',
      highlightColor: '#FFFFFF',
      badgeText: 'EXCLUSIVE',
      badgeStyle: 'outline',
      badgeColor: '#FCD905',
      strokeWidth: 2,
      strokeColor: '#000000',
      shadowBlur: 18,
      shadowColor: 'rgba(0,0,0,0.95)',
      boxBackground: false,
      position: 'center',
      textAlign: 'center',
      overlayDarkness: 0.65,
      overlayType: 'radial-vignette',
    },
  },
  {
    id: 'alert',
    name: 'Breaking Alert',
    tagline: 'Urgent red alert headline banner for news, viral stories, and warnings',
    previewBg: 'linear-gradient(135deg, #450a0a 0%, #18181b 100%)',
    badgePreview: { text: '🚨 CRITICAL', bg: '#EF4444', color: '#FFFFFF' },
    settings: {
      preset: 'alert',
      fontFamily: 'Anton',
      fontSize: 82,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
      textColor: '#FFFFFF',
      highlightColor: '#FCD905',
      badgeText: '🚨 CRITICAL',
      badgeStyle: 'solid',
      badgeColor: '#EF4444',
      strokeWidth: 6,
      strokeColor: '#000000',
      shadowBlur: 20,
      shadowColor: 'rgba(0,0,0,0.85)',
      boxBackground: false,
      position: 'top',
      textAlign: 'center',
      overlayDarkness: 0.60,
      overlayType: 'linear-top',
    },
  },
  {
    id: 'glass-card',
    name: 'Glass Card Box',
    tagline: 'Headline enclosed in a frosted dark glass card with modern depth',
    previewBg: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
    badgePreview: { text: 'PART 1', bg: '#FCD905', color: '#000000' },
    settings: {
      preset: 'glass-card',
      fontFamily: 'Poppins',
      fontSize: 68,
      fontWeight: '800',
      letterSpacing: 0,
      textTransform: 'none',
      textColor: '#FFFFFF',
      highlightColor: '#FCD905',
      badgeText: 'PART 1',
      badgeStyle: 'solid',
      badgeColor: '#FCD905',
      strokeWidth: 0,
      strokeColor: '#000000',
      shadowBlur: 12,
      shadowColor: 'rgba(0,0,0,0.5)',
      boxBackground: true,
      boxBgColor: 'rgba(15, 17, 23, 0.82)',
      boxBgOpacity: 0.85,
      position: 'center',
      textAlign: 'center',
      overlayDarkness: 0.45,
      overlayType: 'radial-vignette',
    },
  },
];

export function createDefaultThumbnailSettings(
  projectTitle?: string,
  initialAspectRatio: '9:16' | '4:5' | '1:1' | '16:9' = '9:16',
  position: ThumbnailLayoutPosition = 'custom',
  customY: number = 27,
  fontFamily: string = 'Montserrat',
  highlightColor: string = '#FCD905'
): ThumbnailSettings {
  const isDefaultOrEmpty = !projectTitle || projectTitle === 'Untitled Reel' || projectTitle === 'Motivational Reel Captions';
  const title = isDefaultOrEmpty ? 'CREATE VIRAL REELS IN SECONDS' : projectTitle.trim();
  return {
    title,
    subtitle: isDefaultOrEmpty ? 'Hook viewers in the first 3 seconds' : 'Step-by-step masterclass with AI subtitles',
    badgeText: 'MUST WATCH',
    badgeStyle: 'solid',
    badgeColor: '#FCD905',
    badgeEnabled: true,
    badgeSpacing: 38,
    badgeShape: 'pill',
    badgeBorderRadius: 10,
    badgeBorderWidth: 0,
    badgeBorderColor: '#FFFFFF',
    badgeTextColor: '#000000',
    badgeAutoTextColor: true,
    badgeFontSize: 26,
    badgeFontWeight: '800',
    badgeLetterSpacing: 1,
    badgePaddingX: 18,
    badgePaddingY: 9,
    badgeGlowBlur: 18,
    subtitleSpacing: 30,
    preset: 'hormozi',
    fontFamily,
    fontSize: 78,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
    textColor: '#FFFFFF',
    highlightColor,
    highlightWords: [],
    position,
    customY,
    textAlign: 'center',
    customX: 50,
    overlayDarkness: 0.15,
    overlayType: 'radial-vignette',
    strokeWidth: 8,
    strokeColor: '#000000',
    shadowBlur: 20,
    shadowColor: 'rgba(0,0,0,0.85)',
    boxBackground: false,
    boxBgColor: 'rgba(15, 17, 23, 0.82)',
    boxBgOpacity: 0.85,
    brandingText: '',
    aspectRatio: initialAspectRatio,
    backgroundType: 'project',
    gradientPreset: 'dark-vignette',
    showSafeArea: true,
  };
}

export function getThumbnailDimensions(aspectRatio: '9:16' | '4:5' | '1:1' | '16:9'): { width: number; height: number } {
  switch (aspectRatio) {
    case '4:5':
      return { width: 1080, height: 1350 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '9:16':
    default:
      return { width: 1080, height: 1920 };
  }
}

/**
 * Draws rounded rectangle path on canvas
 */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders thumbnail onto canvas with multi-line word wrap and word highlighting
 */
export async function renderThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  settings: ThumbnailSettings,
  bgImageElement?: HTMLImageElement | HTMLVideoElement | null,
  imageAsset?: ImageAsset | null
): Promise<void> {
  const { width, height } = getThumbnailDimensions(settings.aspectRatio);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Default solid black canvas backdrop (matches Video Reel player)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // 1. Draw Background
  let hasImageDrawn = false;
  if (settings.backgroundType !== 'gradient' && bgImageElement) {
    try {
      const imgW = (bgImageElement as HTMLVideoElement).videoWidth || bgImageElement.width;
      const imgH = (bgImageElement as HTMLVideoElement).videoHeight || bgImageElement.height;
      if (imgW && imgH) {
        const isContain = imageAsset?.fitMode === 'contain';

        if (isContain) {
          // Sync 1:1 with Video Reel Contain Mode (Position, Scale & Padding)
          const scalePercent = imageAsset?.scale ?? 85;
          const scaleMultiplier = Math.min(Math.max(scalePercent, 30), 200) / 100;
          const paddingPx = Math.round(width * 0.025); // ~27px on 1080p, matching p-3 on video preview

          const maxBoxW = (width - paddingPx * 2) * scaleMultiplier;
          const maxBoxH = (height - paddingPx * 2) * scaleMultiplier;

          const imgRatio = imgW / imgH;
          const boxRatio = maxBoxW / maxBoxH;

          let drawW: number;
          let drawH: number;

          if (imgRatio > boxRatio) {
            drawW = maxBoxW;
            drawH = maxBoxW / imgRatio;
          } else {
            drawH = maxBoxH;
            drawW = maxBoxH * imgRatio;
          }

          // Alignment matching ImagePosition (9 positions)
          const position = imageAsset?.position || 'center';
          let drawX: number;
          let drawY: number;

          // Horizontal alignment
          if (position.endsWith('left')) {
            drawX = paddingPx;
          } else if (position.endsWith('right')) {
            drawX = width - paddingPx - drawW;
          } else {
            // center
            drawX = (width - drawW) / 2;
          }

          // Vertical alignment
          if (position.startsWith('top')) {
            drawY = paddingPx;
          } else if (position.startsWith('bottom')) {
            drawY = height - paddingPx - drawH;
          } else {
            // center
            drawY = (height - drawH) / 2;
          }

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          ctx.shadowBlur = 32;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 12;

          const cornerRadius = Math.round(Math.min(drawW, drawH) * 0.035);
          drawRoundRect(ctx, drawX, drawY, drawW, drawH, Math.min(24, Math.max(6, cornerRadius)));
          ctx.clip();
          ctx.drawImage(bgImageElement, drawX, drawY, drawW, drawH);
          ctx.restore();

          hasImageDrawn = true;
        } else {
          // Standard Cover Mode (Aspect fill across full canvas)
          const imgRatio = imgW / imgH;
          const canvasRatio = width / height;
          let drawW: number;
          let drawH: number;
          let drawX: number;
          let drawY: number;

          if (imgRatio > canvasRatio) {
            drawH = height;
            drawW = height * imgRatio;
            drawX = (width - drawW) / 2;
            drawY = 0;
          } else {
            drawW = width;
            drawH = width / imgRatio;
            drawX = 0;
            drawY = (height - drawH) / 2;
          }

          ctx.drawImage(bgImageElement, drawX, drawY, drawW, drawH);
          hasImageDrawn = true;
        }
      }
    } catch (e) {
      console.warn('Could not draw background image to canvas:', e);
    }
  }

  if (!hasImageDrawn) {
    // Draw gradient background
    const gradientInfo = THUMBNAIL_GRADIENTS.find((g) => g.id === settings.gradientPreset) || THUMBNAIL_GRADIENTS[0];
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, gradientInfo.startColor);
    grad.addColorStop(1, gradientInfo.endColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw Vignette / Darkness Overlay
  const darkness = Math.min(Math.max(settings.overlayDarkness ?? 0.6, 0), 1);
  if (darkness > 0) {
    const overlayType = settings.overlayType || 'radial-vignette';
    if (overlayType === 'radial-vignette') {
      const radGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.15,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75
      );
      radGrad.addColorStop(0, `rgba(0, 0, 0, ${darkness * 0.3})`);
      radGrad.addColorStop(1, `rgba(0, 0, 0, ${darkness})`);
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);
    } else if (overlayType === 'linear-bottom') {
      const linGrad = ctx.createLinearGradient(0, height * 0.3, 0, height);
      linGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      linGrad.addColorStop(1, `rgba(0, 0, 0, ${darkness})`);
      ctx.fillStyle = linGrad;
      ctx.fillRect(0, 0, width, height);
    } else if (overlayType === 'linear-top') {
      const linGrad = ctx.createLinearGradient(0, height * 0.7, 0, 0);
      linGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      linGrad.addColorStop(1, `rgba(0, 0, 0, ${darkness})`);
      ctx.fillStyle = linGrad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 3. Setup Font for Title
  const fontFamily = settings.fontFamily || 'Montserrat';
  const fontWeight = settings.fontWeight || '900';
  const fontSize = settings.fontSize || 78;
  const letterSpacing = settings.letterSpacing || 0;

  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", -apple-system, sans-serif`;
  ctx.textBaseline = 'top';

  // 4. Parse Title Words and Wrapping
  let rawTitle = settings.title?.trim() || '';
  if (settings.textTransform === 'uppercase') {
    rawTitle = rawTitle.toUpperCase();
  }

  // Check for *highlighted* words formatted with asterisks, or from settings.highlightWords
  const highlightSet = new Set(
    (settings.highlightWords || []).map((w) => w.trim().toLowerCase())
  );

  interface TitleToken {
    text: string;
    isHighlight: boolean;
  }

  const rawTokens: TitleToken[] = [];
  const words = rawTitle.split(/\s+/).filter(Boolean);

  for (const word of words) {
    let cleanWord = word;
    let isHl = false;

    if (cleanWord.startsWith('*') && cleanWord.endsWith('*') && cleanWord.length > 2) {
      cleanWord = cleanWord.substring(1, cleanWord.length - 1);
      isHl = true;
    } else {
      const stripped = normalizeHookWord(cleanWord);
      if (stripped && highlightSet.has(stripped)) {
        isHl = true;
      }
    }

    rawTokens.push({
      text: cleanWord,
      isHighlight: isHl,
    });
  }

  // Measure word widths and break into lines
  const maxLineWidth = width * 0.86;
  const spaceWidth = ctx.measureText(' ').width + letterSpacing;

  interface LineItem {
    tokens: TitleToken[];
    tokenWidths: number[];
    totalWidth: number;
  }

  const lines: LineItem[] = [];
  let currentLineTokens: TitleToken[] = [];
  let currentTokenWidths: number[] = [];
  let currentLineWidth = 0;

  for (const token of rawTokens) {
    const tokenW = ctx.measureText(token.text).width + letterSpacing * Math.max(0, token.text.length - 1);
    const addedWidth = currentLineTokens.length === 0 ? tokenW : spaceWidth + tokenW;

    if (currentLineTokens.length > 0 && currentLineWidth + addedWidth > maxLineWidth) {
      lines.push({
        tokens: currentLineTokens,
        tokenWidths: currentTokenWidths,
        totalWidth: currentLineWidth,
      });
      currentLineTokens = [token];
      currentTokenWidths = [tokenW];
      currentLineWidth = tokenW;
    } else {
      currentLineTokens.push(token);
      currentTokenWidths.push(tokenW);
      currentLineWidth += addedWidth;
    }
  }

  if (currentLineTokens.length > 0) {
    lines.push({
      tokens: currentLineTokens,
      tokenWidths: currentTokenWidths,
      totalWidth: currentLineWidth,
    });
  }

  // Line metrics
  const lineHeight = fontSize * 1.18;
  const totalTitleHeight = lines.length * lineHeight;

  // 5. Measure Badge Pill if present and enabled
  let badgeHeight = 0;
  let badgeWidth = 0;
  const isBadgeActive =
    settings.badgeEnabled !== false &&
    Boolean(settings.badgeText?.trim()) &&
    settings.badgeStyle !== 'none';
  const badgeText = isBadgeActive ? settings.badgeText!.trim() : '';
  const badgeFontSize = settings.badgeFontSize || Math.max(22, Math.round(fontSize * 0.34));
  const badgePaddingX = settings.badgePaddingX ?? 18;
  const badgePaddingY = settings.badgePaddingY ?? 9;
  const badgeLetterSpacing = settings.badgeLetterSpacing ?? 1;

  if (isBadgeActive) {
    const badgeWeight = settings.badgeFontWeight || '800';
    ctx.font = `${badgeWeight} ${badgeFontSize}px "${fontFamily}", -apple-system, sans-serif`;
    const measuredTextWidth =
      ctx.measureText(badgeText).width +
      badgeLetterSpacing * Math.max(0, badgeText.length - 1);
    badgeWidth = measuredTextWidth + badgePaddingX * 2;
    badgeHeight = badgeFontSize + badgePaddingY * 2;
  }

  // 6. Measure Subtitle if present
  let subtitleHeight = 0;
  const subtitleText = settings.subtitle?.trim() || '';
  const subtitleFontSize = Math.max(24, Math.round(fontSize * 0.38));

  if (subtitleText) {
    ctx.font = `600 ${subtitleFontSize}px "${fontFamily}", -apple-system, sans-serif`;
    subtitleHeight = subtitleFontSize * 1.35;
  }

  // 7. Calculate Block Y Position
  const spacingBetweenBadgeAndTitle = isBadgeActive ? (settings.badgeSpacing ?? 24) : 0;
  const spacingBetweenTitleAndSubtitle = subtitleText ? (settings.subtitleSpacing ?? 24) : 0;
  const totalContentHeight =
    badgeHeight +
    spacingBetweenBadgeAndTitle +
    totalTitleHeight +
    spacingBetweenTitleAndSubtitle +
    subtitleHeight;

  let blockStartY = 0;
  const is916 = settings.aspectRatio === '9:16';

  if (settings.position === 'top') {
    // On 9:16 vertical covers, start at 23% to sit inside Instagram 1:1 Profile Grid Crop (21.9% to 78.1%)
    // and clear the 14% Top Danger Zone.
    blockStartY = is916 ? height * 0.23 : height * 0.14;
  } else if (settings.position === 'bottom') {
    // On 9:16 vertical covers, end at 76% to sit inside Instagram 1:1 Profile Grid Crop (ends at 78.1%)
    // and clear the 22% Bottom Danger Zone.
    blockStartY = (is916 ? height * 0.76 : height * 0.86) - totalContentHeight;
  } else if (settings.position === 'custom') {
    const customPercent = (settings.customY ?? 50) / 100;
    blockStartY = height * customPercent - totalContentHeight / 2;
  } else {
    // center (perfect center alignment for 1:1 Instagram profile grid crop)
    blockStartY = (height - totalContentHeight) / 2;
  }

  // Keep within safe canvas bounds
  const minTopBound = is916 ? height * 0.14 : height * 0.08;
  const maxBottomBound = is916 ? height * 0.78 : height * 0.92;
  blockStartY = Math.max(minTopBound, Math.min(maxBottomBound - totalContentHeight, blockStartY));

  // 8. Draw Box Backdrop if enabled
  if (settings.boxBackground) {
    const boxPaddingX = 40;
    const boxPaddingY = 32;
    const maxLineW = Math.max(...lines.map((l) => l.totalWidth), badgeWidth);
    const boxW = Math.min(width * 0.92, maxLineW + boxPaddingX * 2);
    const boxH = totalContentHeight + boxPaddingY * 2;
    let boxX = (width - boxW) / 2;
    if (settings.textAlign === 'left') {
      boxX = width * 0.08 - boxPaddingX / 2;
    } else if (settings.textAlign === 'right') {
      boxX = width * 0.92 - boxW + boxPaddingX / 2;
    } else if (settings.textAlign === 'custom') {
      const customXPercent = (settings.customX ?? 50) / 100;
      boxX = width * customXPercent - boxW / 2;
    }
    boxX = Math.max(width * 0.02, Math.min(width * 0.98 - boxW, boxX));
    const boxY = blockStartY - boxPaddingY;

    ctx.save();
    ctx.fillStyle = settings.boxBgColor || 'rgba(15, 17, 23, 0.82)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    drawRoundRect(ctx, boxX, boxY, boxW, boxH, 24);
    ctx.fill();

    // Subtle border on card
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Current rendering cursor Y
  let currentY = blockStartY;

  // 9. Draw Badge Pill
  if (isBadgeActive) {
    const badgeBg = settings.badgeColor || '#FCD905';
    let badgeX = 0;
    if (settings.textAlign === 'left') {
      badgeX = width * 0.08;
    } else if (settings.textAlign === 'right') {
      badgeX = width * 0.92 - badgeWidth;
    } else if (settings.textAlign === 'custom') {
      const customXPercent = (settings.customX ?? 50) / 100;
      badgeX = width * customXPercent - badgeWidth / 2;
    } else {
      badgeX = (width - badgeWidth) / 2;
    }
    badgeX = Math.max(width * 0.04, Math.min(width * 0.96 - badgeWidth, badgeX));

    ctx.save();
    const badgeWeight = settings.badgeFontWeight || '800';
    ctx.font = `${badgeWeight} ${badgeFontSize}px "${fontFamily}", -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';

    const glowBlur = settings.badgeGlowBlur ?? (settings.badgeStyle === 'glow' ? 20 : 8);
    if (settings.badgeStyle === 'glow') {
      ctx.shadowColor = badgeBg;
      ctx.shadowBlur = glowBlur;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }

    // Determine shape & corner radius
    const shape = settings.badgeShape || 'pill';
    const radius =
      shape === 'sharp'
        ? 0
        : shape === 'rounded'
        ? (settings.badgeBorderRadius ?? 10)
        : badgeHeight / 2;

    const borderWidth = settings.badgeBorderWidth ?? (settings.badgeStyle === 'outline' ? 2.5 : 0);
    const borderColor = settings.badgeBorderColor || (settings.badgeStyle === 'outline' ? badgeBg : 'rgba(255,255,255,0.25)');

    if (settings.badgeStyle === 'outline') {
      drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, radius);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth || 2.5;
      ctx.stroke();
    } else if (settings.badgeStyle === 'glass') {
      drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, radius);
      ctx.fillStyle = 'rgba(24, 24, 27, 0.75)';
      ctx.fill();
      ctx.strokeStyle = borderColor || 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = borderWidth || 1.5;
      ctx.stroke();
    } else if (settings.badgeStyle === 'gradient') {
      const grad = ctx.createLinearGradient(badgeX, currentY, badgeX + badgeWidth, currentY + badgeHeight);
      grad.addColorStop(0, badgeBg);
      grad.addColorStop(1, '#FF7A00');
      drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, radius);
      ctx.fillStyle = grad;
      ctx.fill();
      if (borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }
    } else {
      drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, radius);
      ctx.fillStyle = badgeBg;
      ctx.fill();
      if (borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }
    }

    // Determine Contrasting Text Color
    let textColor = settings.badgeTextColor;
    if (!textColor || settings.badgeAutoTextColor) {
      if (settings.badgeStyle === 'outline') {
        textColor = badgeBg;
      } else if (settings.badgeStyle === 'glass') {
        textColor = '#FFFFFF';
      } else {
        const isBright =
          badgeBg.toUpperCase() === '#FCD905' ||
          badgeBg.toUpperCase() === '#00F0FF' ||
          badgeBg.toUpperCase() === '#FFFFFF' ||
          badgeBg.toUpperCase() === '#00E676';
        textColor = isBright ? '#000000' : '#FFFFFF';
      }
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = textColor;
    const textCenterY = currentY + badgeHeight / 2;

    if (badgeLetterSpacing > 0) {
      let charX = badgeX + badgePaddingX;
      for (const char of badgeText) {
        ctx.fillText(char, charX, textCenterY);
        charX += ctx.measureText(char).width + badgeLetterSpacing;
      }
    } else {
      ctx.fillText(badgeText, badgeX + badgePaddingX, textCenterY);
    }

    ctx.restore();
    currentY += badgeHeight + spacingBetweenBadgeAndTitle;
  }

  // 10. Draw Title Lines
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", -apple-system, sans-serif`;
  ctx.textBaseline = 'top';

  for (const line of lines) {
    let startX = 0;
    if (settings.textAlign === 'left') {
      startX = width * 0.08;
    } else if (settings.textAlign === 'right') {
      startX = width * 0.92 - line.totalWidth;
    } else if (settings.textAlign === 'custom') {
      const customXPercent = (settings.customX ?? 50) / 100;
      startX = width * customXPercent - line.totalWidth / 2;
    } else {
      startX = (width - line.totalWidth) / 2;
    }
    startX = Math.max(width * 0.04, Math.min(width * 0.96 - line.totalWidth, startX));

    let tokenX = startX;
    for (let i = 0; i < line.tokens.length; i++) {
      const token = line.tokens[i];
      const tokenW = line.tokenWidths[i];
      const isHl = token.isHighlight;

      ctx.save();
      const color = isHl ? (settings.highlightColor || '#FCD905') : (settings.textColor || '#FFFFFF');

      // Shadow
      if (settings.shadowBlur > 0) {
        ctx.shadowColor = settings.shadowColor || 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = settings.shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
      }

      // Stroke
      if (settings.strokeWidth > 0) {
        ctx.strokeStyle = settings.strokeColor || '#000000';
        ctx.lineWidth = settings.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(token.text, tokenX, currentY);
      }

      // Fill
      ctx.fillStyle = color;
      ctx.fillText(token.text, tokenX, currentY);
      ctx.restore();

      tokenX += tokenW + spaceWidth;
    }

    currentY += lineHeight;
  }

  // 11. Draw Subtitle
  if (subtitleText) {
    currentY += spacingBetweenTitleAndSubtitle;
    ctx.save();
    ctx.font = `600 ${subtitleFontSize}px "${fontFamily}", -apple-system, sans-serif`;
    ctx.textBaseline = 'top';

    const subWidth = ctx.measureText(subtitleText).width;
    let subX = 0;
    if (settings.textAlign === 'left') {
      subX = width * 0.08;
    } else if (settings.textAlign === 'right') {
      subX = width * 0.92 - subWidth;
    } else if (settings.textAlign === 'custom') {
      const customXPercent = (settings.customX ?? 50) / 100;
      subX = width * customXPercent - subWidth / 2;
    } else {
      subX = (width - subWidth) / 2;
    }
    subX = Math.max(width * 0.04, Math.min(width * 0.96 - subWidth, subX));

    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText(subtitleText, subX, currentY);
    ctx.restore();
  }

  // 12. Draw Branding / Creator Watermark if present
  if (settings.brandingText?.trim()) {
    const brand = settings.brandingText.trim();
    ctx.save();
    const brandSize = 22;
    ctx.font = `700 ${brandSize}px "${fontFamily}", -apple-system, sans-serif`;
    ctx.textBaseline = 'bottom';
    const brandW = ctx.measureText(brand).width;
    const brandX = (width - brandW) / 2;
    const brandY = height - 36;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(brand, brandX, brandY);
    ctx.restore();
  }
}
