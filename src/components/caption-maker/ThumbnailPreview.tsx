'use strict';
'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  ThumbnailSettings,
  renderThumbnailToCanvas,
  THUMBNAIL_GRADIENTS,
} from '@/lib/caption-maker/thumbnail-presets';
import { ImageAsset, ImagePosition, OutputSettings } from '@/lib/caption-maker/types';
import { loadGoogleFontInDocument } from '@/lib/caption-maker/google-fonts';
import { Download, Sparkles } from 'lucide-react';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { normalizeHookWord } from '@/lib/caption-maker/hook-quality';

// Exact 1:1 position alignment map matching CaptionPreview.tsx
const posAlignment: Record<ImagePosition, { justifyContent: string; alignItems: string }> = {
  'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
  'top-center': { justifyContent: 'center', alignItems: 'flex-start' },
  'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
  'center-left': { justifyContent: 'flex-start', alignItems: 'center' },
  'center': { justifyContent: 'center', alignItems: 'center' },
  'center-right': { justifyContent: 'flex-end', alignItems: 'center' },
  'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
  'bottom-center': { justifyContent: 'center', alignItems: 'flex-end' },
  'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' },
};

interface ThumbnailPreviewProps {
  settings: ThumbnailSettings;
  image?: ImageAsset;
  outputSettings: OutputSettings;
  onSwitchToVideo: () => void;
  onDownload?: (format: 'png' | 'jpeg') => void;
  onApplyAsReelImage?: () => void;
  onToggleSafeArea?: () => void;
  onUpdateSettings?: (updates: Partial<ThumbnailSettings>) => void;
  onEditBadge?: () => void;
  onEditTitle?: () => void;
}

export const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({
  settings,
  image,
  outputSettings,
  onDownload,
  onApplyAsReelImage,
  onToggleSafeArea,
  onUpdateSettings,
  onEditBadge,
  onEditTitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(360);
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null);

  const isVideo =
    image?.mediaType === 'video' ||
    (image?.format && ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI'].includes(image.format.toUpperCase())) ||
    (image?.fileName && (
      image.fileName.toLowerCase().endsWith('.mp4') ||
      image.fileName.toLowerCase().endsWith('.mov') ||
      image.fileName.toLowerCase().endsWith('.webm')
    ));

  // Responsive container width measurement matching CaptionPreview
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Preload background image for high-resolution canvas export
  useEffect(() => {
    const sourceUrl = settings.customBgUrl || image?.fileUrl;
    if (sourceUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setBgImageEl(img);
      img.onerror = () => setBgImageEl(null);
      img.src = sourceUrl;
    } else {
      setBgImageEl(null);
    }
  }, [settings.customBgUrl, image?.fileUrl]);

  // Load font whenever fontFamily changes
  useEffect(() => {
    if (settings.fontFamily) {
      loadGoogleFontInDocument(settings.fontFamily, () => {
        if (canvasRef.current) {
          renderThumbnailToCanvas(canvasRef.current, settings, bgImageEl, image);
        }
      });
    }
  }, [settings.fontFamily, bgImageEl, settings, image]);

  // Keep offscreen canvas refreshed for downloads & video rendering
  useEffect(() => {
    if (canvasRef.current) {
      renderThumbnailToCanvas(canvasRef.current, settings, bgImageEl, image);
    }
  }, [settings, bgImageEl, image, image?.fitMode, image?.position, image?.scale]);

  // Aspect ratio classes matching CaptionPreview 1:1
  const getAspectRatioClasses = () => {
    const aspect = settings.aspectRatio || outputSettings.aspectRatio;
    switch (aspect) {
      case '4:5':
        return 'aspect-[4/5] max-h-[500px]';
      case '1:1':
        return 'aspect-square max-h-[460px]';
      case '16:9':
        return 'aspect-[16/9] max-h-[400px]';
      case '9:16':
      default:
        return 'aspect-[9/16] max-h-[580px]';
    }
  };

  // Vertical & Horizontal placement matching Video Reel caption anchor coordinates 1:1
  const getTitlePositionStyles = (): React.CSSProperties => {
    const isCustomX = settings.textAlign === 'custom';
    const posX = isCustomX ? `${settings.customX ?? 50}%` : '50%';

    let topVal = '50%';
    let yTranslate = '-50%';
    const is916 = (settings.aspectRatio || outputSettings.aspectRatio) === '9:16';

    if (settings.position === 'top') {
      topVal = is916 ? '23%' : '14%';
      yTranslate = '0';
    } else if (settings.position === 'bottom') {
      topVal = is916 ? '76%' : '86%';
      yTranslate = '-100%';
    } else if (settings.position === 'custom') {
      topVal = `${settings.customY ?? 50}%`;
      yTranslate = '-50%';
    }

    return {
      top: topVal,
      left: posX,
      transform: `translate(-50%, ${yTranslate})`,
    };
  };

  // Dark overlay styling
  const getOverlayStyle = (): React.CSSProperties => {
    const darkness = settings.overlayDarkness ?? 0;
    if (darkness <= 0) return { display: 'none' };

    switch (settings.overlayType) {
      case 'linear-bottom':
        return {
          background: `linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,${darkness}) 100%)`,
        };
      case 'linear-top':
        return {
          background: `linear-gradient(to top, rgba(0,0,0,0) 30%, rgba(0,0,0,${darkness}) 100%)`,
        };
      case 'full-dark':
        return {
          backgroundColor: `rgba(0,0,0,${darkness})`,
        };
      case 'radial-vignette':
      default:
        return {
          background: `radial-gradient(circle at center, rgba(0,0,0,0) 25%, rgba(0,0,0,${darkness}) 100%)`,
        };
    }
  };

  // Dynamic scale relative to 1080p canvas width
  const previewScale = (containerWidth || 360) / 1080;
  const previewFontSize = Math.max(16, Math.round((settings.fontSize || 74) * previewScale));
  const previewStrokeWidth = Math.max(0, Math.round((settings.strokeWidth || 4) * previewScale));
  const previewShadowBlur = Math.round((settings.shadowBlur || 16) * previewScale);

  const cleanPrimaryFont =
    settings.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Montserrat';
  const effectiveFontFamily = `"${cleanPrimaryFont}", "Nirmala UI", "Segoe UI", sans-serif`;

  const effectiveTextAlign = settings.textAlign === 'custom' ? 'center' : (settings.textAlign || 'center');
  const justifyAlign =
    effectiveTextAlign === 'left' ? 'flex-start' : effectiveTextAlign === 'right' ? 'flex-end' : 'center';


  // Title words parser with active #FCD905 highlight support
  const renderTitleWords = () => {
    const rawTitle = settings.title?.trim() || 'CREATE VIRAL REELS';
    const words = rawTitle.split(/\s+/).filter(Boolean);
    const highlighted = (settings.highlightWords || []).map(normalizeHookWord);
    const isUppercase = settings.textTransform === 'uppercase';

    return words.map((w, idx) => {
      const isStarWrapped = w.startsWith('*') && w.endsWith('*') && w.length > 2;
      const cleanText = isStarWrapped ? w.slice(1, -1) : w;
      const strippedClean = normalizeHookWord(cleanText);

      const isCurrentHighlight =
        isStarWrapped ||
        highlighted.includes(strippedClean) ||
        highlighted.includes(normalizeHookWord(cleanText));

      const wordColor = isCurrentHighlight
        ? settings.highlightColor || '#FCD905'
        : settings.textColor || '#FFFFFF';

      const displayText = isUppercase ? cleanText.toUpperCase() : cleanText;

      return (
        <span
          key={`${cleanText}-${idx}`}
          style={{
            color: wordColor,
            display: 'inline-block',
            whiteSpace: 'nowrap',
          }}
        >
          {displayText}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Main Viewport Container (100% pixel-perfect identical to CaptionPreview frame) */}
      <div
        ref={containerRef}
        className={`relative rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center select-none ${getAspectRatioClasses()} w-full max-w-sm sm:max-w-md mx-auto group`}
      >
        {/* 1. Background Media Layer (100% pixel-perfect identical DOM layer to Video Reel) */}
        {settings.backgroundType === 'gradient' ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                THUMBNAIL_GRADIENTS.find((g) => g.id === settings.gradientPreset)?.css ||
                'radial-gradient(circle at center, #27272a 0%, #09090b 100%)',
            }}
          />
        ) : (settings.customBgUrl || image?.fileUrl) ? (
          image?.fitMode === 'contain' ? (
            <div
              className="absolute inset-0 flex p-3 overflow-hidden"
              style={{
                justifyContent: posAlignment[image?.position || 'center'].justifyContent,
                alignItems: posAlignment[image?.position || 'center'].alignItems,
              }}
            >
              {isVideo && !settings.customBgUrl ? (
                <video
                  src={image?.fileUrl}
                  playsInline
                  muted
                  loop
                  style={{
                    maxWidth: `${image?.scale ?? 85}%`,
                    maxHeight: `${image?.scale ?? 85}%`,
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                  className="rounded-lg shadow-2xl transition-all duration-200"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.customBgUrl || image?.fileUrl}
                  alt="contained-thumbnail-bg"
                  style={{
                    maxWidth: `${image?.scale ?? 85}%`,
                    maxHeight: `${image?.scale ?? 85}%`,
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                  className="rounded-lg shadow-2xl transition-all duration-200"
                />
              )}
            </div>
          ) : (
            isVideo && !settings.customBgUrl ? (
              <video
                src={image?.fileUrl}
                playsInline
                muted
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.customBgUrl || image?.fileUrl}
                alt="cover-thumbnail-bg"
                className="w-full h-full object-cover"
              />
            )
          )
        ) : (
          <div className="text-center p-6 text-zinc-500 flex flex-col items-center space-y-2">
            <Sparkles className="w-8 h-8 text-zinc-600 animate-pulse" />
            <p className="text-xs font-semibold text-zinc-400">Upload background video or image</p>
            <p className="text-[10px] text-zinc-600">Thumbnail cover will render here</p>
          </div>
        )}

        {/* 2. Dark Vignette / Gradient Overlay (Only applied if overlayDarkness > 0) */}
        {(settings.overlayDarkness ?? 0) > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-10 transition-opacity"
            style={getOverlayStyle()}
          />
        )}

        {/* 3. Professional Social Safe Area & 1:1 Profile Crop Guides Overlay */}
        <SafeAreaOverlay
          aspectRatio={settings.aspectRatio || outputSettings.aspectRatio || '9:16'}
          preset={settings.safeZoneOverrides?.platform || outputSettings.preset}
          mode="thumbnail"
          showGuides={settings.showSafeArea !== false}
          customOverrides={settings.safeZoneOverrides}
          onSelectPlatform={(p) => {
            if (onUpdateSettings) {
              onUpdateSettings({
                safeZoneOverrides: {
                  ...settings.safeZoneOverrides,
                  platform: p,
                  topDangerPercent: undefined,
                  bottomDangerPercent: undefined,
                  rightMarginPercent: undefined,
                  leftMarginPercent: undefined,
                },
              });
            }
          }}
        />

        {/* 4. Live Thumbnail Title & Hook Typography Layer */}
        {(() => {
          const is916 = (settings.aspectRatio || outputSettings.aspectRatio) === '9:16';
          const titleWidth = is916 ? '82%' : '88%';

          return (
            <div
              style={{
                ...getTitlePositionStyles(),
                width: titleWidth,
                maxWidth: titleWidth,
                display: 'flex',
                flexDirection: 'column',
                alignItems: justifyAlign,
                justifyContent: 'center',
                textAlign: effectiveTextAlign,
              }}
              className="absolute z-20 pointer-events-none transition-all duration-150"
            >
          {/* Glass Card Container if boxBackground enabled */}
          <div
            style={
              settings.boxBackground
                ? {
                    backgroundColor: settings.boxBgColor || 'rgba(15, 17, 23, 0.85)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: `${Math.round(16 * previewScale)}px ${Math.round(20 * previewScale)}px`,
                    borderRadius: `${Math.round(20 * previewScale)}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: justifyAlign,
                    maxWidth: '100%',
                  }
                : {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: justifyAlign,
                    maxWidth: '100%',
                  }
            }
          >
            {/* Quick Badge if present and enabled */}
            {settings.badgeEnabled !== false && settings.badgeText && settings.badgeText.trim() && settings.badgeStyle !== 'none' && (
              <div
                onClick={onEditBadge}
                role="button"
                tabIndex={0}
                title="Click to edit badge text, colors & spacing"
                style={{
                  backgroundColor:
                    settings.badgeStyle === 'outline'
                      ? 'rgba(0,0,0,0.6)'
                      : settings.badgeStyle === 'glass'
                      ? 'rgba(24,24,27,0.75)'
                      : settings.badgeStyle === 'gradient'
                      ? undefined
                      : settings.badgeColor || '#FCD905',
                  backgroundImage:
                    settings.badgeStyle === 'gradient'
                      ? `linear-gradient(135deg, ${settings.badgeColor || '#FCD905'} 0%, #FF7A00 100%)`
                      : undefined,
                  color: (() => {
                    if (settings.badgeTextColor && !settings.badgeAutoTextColor) return settings.badgeTextColor;
                    if (settings.badgeStyle === 'outline') return settings.badgeBorderColor || settings.badgeColor || '#FCD905';
                    if (settings.badgeStyle === 'glass') return '#FFFFFF';
                    const bg = (settings.badgeColor || '#FCD905').toUpperCase();
                    const isBright = bg === '#FCD905' || bg === '#00F0FF' || bg === '#FFFFFF' || bg === '#00E676';
                    return isBright ? '#000000' : '#FFFFFF';
                  })(),
                  border:
                    settings.badgeStyle === 'outline'
                      ? `${Math.max(1, Math.round((settings.badgeBorderWidth ?? 2.5) * previewScale))}px solid ${settings.badgeBorderColor || settings.badgeColor || '#FCD905'}`
                      : (settings.badgeBorderWidth ?? 0) > 0
                      ? `${Math.max(1, Math.round(settings.badgeBorderWidth! * previewScale))}px solid ${settings.badgeBorderColor || 'rgba(255,255,255,0.25)'}`
                      : settings.badgeStyle === 'glass'
                      ? '1px solid rgba(255,255,255,0.2)'
                      : 'none',
                  boxShadow:
                    settings.badgeStyle === 'glow'
                      ? `0 0 ${Math.round((settings.badgeGlowBlur ?? 18) * previewScale)}px ${settings.badgeColor || '#FCD905'}`
                      : '0 4px 10px rgba(0,0,0,0.5)',
                  fontSize: `${Math.max(10, Math.round((settings.badgeFontSize ?? 26) * previewScale))}px`,
                  fontWeight: Number(settings.badgeFontWeight) || 800,
                  borderRadius:
                    settings.badgeShape === 'sharp'
                      ? '2px'
                      : settings.badgeShape === 'rounded'
                      ? `${Math.round((settings.badgeBorderRadius ?? 10) * previewScale)}px`
                      : '9999px',
                  padding: `${Math.max(2, Math.round((settings.badgePaddingY ?? 9) * previewScale))}px ${Math.max(6, Math.round((settings.badgePaddingX ?? 18) * previewScale))}px`,
                  marginBottom: `${Math.round((settings.badgeSpacing ?? 24) * previewScale)}px`,
                  letterSpacing: `${Math.round((settings.badgeLetterSpacing ?? 1) * previewScale)}px`,
                }}
                className="uppercase inline-block font-sans transition-all duration-150 pointer-events-auto cursor-pointer hover:scale-105 hover:ring-2 hover:ring-amber-400 active:scale-95 select-none"
              >
                {settings.badgeText}
              </div>
            )}

            {/* Title Words with Multi-line Wrap & Active #FCD905 Highlighting */}
            <div
              onClick={onEditTitle}
              role="button"
              tabIndex={0}
              title="Click to edit title text"
              style={{
                fontFamily: effectiveFontFamily,
                fontSize: `${previewFontSize}px`,
                fontWeight: Number(settings.fontWeight) || 900,
                lineHeight: 1.15,
                letterSpacing: `${Math.round((settings.letterSpacing || 0) * previewScale)}px`,
                WebkitTextStroke:
                  previewStrokeWidth > 0
                    ? `${previewStrokeWidth}px ${settings.strokeColor || '#000000'}`
                    : undefined,
                paintOrder: 'stroke fill',
                textShadow:
                  previewShadowBlur > 0
                    ? `0 4px ${previewShadowBlur}px ${settings.shadowColor || 'rgba(0,0,0,0.85)'}`
                    : 'none',
                textAlign: effectiveTextAlign,
                columnGap: `${Math.max(6, Math.round(previewFontSize * 0.28))}px`,
                rowGap: `${Math.max(4, Math.round(previewFontSize * 0.20))}px`,
              }}
              className={`inline-flex flex-wrap items-center pointer-events-auto cursor-pointer hover:opacity-90 select-none ${
                settings.textAlign === 'left'
                  ? 'justify-start'
                  : settings.textAlign === 'right'
                  ? 'justify-end'
                  : 'justify-center'
              }`}
            >
              {renderTitleWords()}
            </div>

            {/* Subtitle if present */}
            {settings.subtitle && settings.subtitle.trim() && (
              <p
                onClick={onEditTitle}
                role="button"
                tabIndex={0}
                title="Click to edit subtitle"
                style={{
                  fontFamily: effectiveFontFamily,
                  fontSize: `${Math.max(11, Math.round(previewFontSize * 0.38))}px`,
                  color: 'rgba(255, 255, 255, 0.90)',
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                  marginTop: `${Math.round((settings.subtitleSpacing ?? 24) * previewScale)}px`,
                }}
                className="font-medium tracking-wide text-center pointer-events-auto cursor-pointer hover:text-amber-200 select-none"
              >
                {settings.subtitle}
              </p>
            )}
          </div>
        </div>
          );
        })()}


        {/* 6. Offscreen Canvas for High-Resolution Export & Video Merging */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
      </div>

      {/* Preset, Dimensions & Quick Actions underneath preview */}
      <div className="h-7 flex items-center justify-between w-full max-w-sm sm:max-w-md pt-2 px-1 text-xs text-zinc-400 font-mono">
        <span className="capitalize text-zinc-300 font-medium truncate">
          {(settings.safeZoneOverrides?.platform || settings.preset || 'instagram-reel').replace('-', ' ')} ({settings.aspectRatio || '9:16'})
        </span>

        <div className="flex items-center gap-2">
          {onToggleSafeArea && (
            <button
              type="button"
              onClick={onToggleSafeArea}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                settings.showSafeArea !== false
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
              title="Toggle Safe Area Overlay Guide"
            >
              <span>🛡️</span>
              <span>Safe Area: {settings.showSafeArea !== false ? 'ON' : 'OFF'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onDownload?.('png')}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black font-bold text-[10px] transition-colors cursor-pointer shadow-sm"
            title="Download Full Resolution PNG"
          >
            <Download className="w-3 h-3 stroke-[2.5]" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
