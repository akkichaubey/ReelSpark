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
}

export const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({
  settings,
  image,
  outputSettings,
  onDownload,
  onApplyAsReelImage,
  onToggleSafeArea,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(360);
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<boolean>(false);

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

  // Vertical placement matching Video Reel caption anchor coordinates 1:1
  const getTitlePositionStyles = (): React.CSSProperties => {
    if (settings.position === 'top') {
      return { top: '18%', left: '50%', transform: 'translate(-50%, 0)' };
    }
    if (settings.position === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (settings.position === 'bottom') {
      return { top: '82%', left: '50%', transform: 'translate(-50%, -100%)' };
    }
    return {
      top: `${settings.customY ?? 50}%`,
      left: '50%',
      transform: 'translate(-50%, -50%)',
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

  const justifyAlign =
    settings.textAlign === 'left' ? 'flex-start' : settings.textAlign === 'right' ? 'flex-end' : 'center';

  const handleApplyCover = () => {
    onApplyAsReelImage?.();
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2500);
  };

  // Title words parser with active #FCD905 highlight support
  const renderTitleWords = () => {
    const rawTitle = settings.title?.trim() || 'CREATE VIRAL REELS';
    const words = rawTitle.split(/\s+/).filter(Boolean);
    const highlighted = (settings.highlightWords || []).map((w) => w.toLowerCase());
    const isUppercase = settings.textTransform === 'uppercase';

    return words.map((w, idx) => {
      const isStarWrapped = w.startsWith('*') && w.endsWith('*') && w.length > 2;
      const cleanText = isStarWrapped ? w.slice(1, -1) : w;
      const strippedClean = cleanText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      const isCurrentHighlight =
        isStarWrapped ||
        highlighted.includes(strippedClean) ||
        highlighted.includes(cleanText.toLowerCase());

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

        {/* 3. Safe Area Guides Overlay (100% parity with Video Reel) */}
        {settings.showSafeArea !== false && (
          <div className="absolute inset-x-6 inset-y-12 border-2 border-dashed border-sky-400/35 rounded-xl pointer-events-none z-10 flex flex-col justify-between p-2">
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-start">
              SAFE AREA TOP
            </span>
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-end">
              REEL UI SAFE ZONE
            </span>
          </div>
        )}

        {/* 4. Live Thumbnail Title & Hook Typography Layer */}
        <div
          style={{
            ...getTitlePositionStyles(),
            width: '90%',
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: justifyAlign,
            justifyContent: 'center',
            textAlign: settings.textAlign || 'center',
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
            {/* Quick Badge if present */}
            {settings.badgeText && settings.badgeText.trim() && (
              <div
                style={{
                  backgroundColor:
                    settings.badgeStyle === 'outline'
                      ? 'transparent'
                      : settings.badgeColor || '#FCD905',
                  color: settings.badgeStyle === 'outline' ? (settings.badgeColor || '#FCD905') : '#000000',
                  border:
                    settings.badgeStyle === 'outline'
                      ? `2px solid ${settings.badgeColor || '#FCD905'}`
                      : 'none',
                  boxShadow:
                    settings.badgeStyle === 'glow'
                      ? `0 0 16px ${settings.badgeColor || '#FCD905'}`
                      : '0 4px 10px rgba(0,0,0,0.5)',
                  fontSize: `${Math.max(10, Math.round(previewFontSize * 0.32))}px`,
                  borderRadius: '9999px',
                  padding: `${Math.round(4 * previewScale)}px ${Math.round(12 * previewScale)}px`,
                  marginBottom: `${Math.round(8 * previewScale)}px`,
                  letterSpacing: '1px',
                }}
                className="font-black uppercase inline-block font-sans"
              >
                {settings.badgeText}
              </div>
            )}

            {/* Title Words with Multi-line Wrap & Active #FCD905 Highlighting */}
            <div
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
                textAlign: settings.textAlign || 'center',
                columnGap: `${Math.max(6, Math.round(previewFontSize * 0.28))}px`,
                rowGap: `${Math.max(4, Math.round(previewFontSize * 0.20))}px`,
              }}
              className={`inline-flex flex-wrap items-center ${
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
                style={{
                  fontFamily: effectiveFontFamily,
                  fontSize: `${Math.max(11, Math.round(previewFontSize * 0.38))}px`,
                  color: 'rgba(255, 255, 255, 0.90)',
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                  marginTop: `${Math.round(8 * previewScale)}px`,
                }}
                className="font-medium tracking-wide text-center"
              >
                {settings.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* 5. Live Badge Indicator & Safe Area Switcher */}
        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/75 backdrop-blur-md border border-amber-500/30 text-[10px] font-bold text-amber-300 flex items-center gap-1.5 pointer-events-none z-30 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          LIVE THUMBNAIL COVER
        </div>

        {onToggleSafeArea && (
          <button
            type="button"
            onClick={onToggleSafeArea}
            className={`absolute top-3 right-3 px-2 py-1 rounded-md backdrop-blur-md border text-[10px] font-mono transition-all z-30 cursor-pointer flex items-center gap-1.5 shadow-md ${
              settings.showSafeArea !== false
                ? 'bg-sky-950/80 border-sky-400/50 text-sky-300 hover:text-sky-200'
                : 'bg-black/75 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle Safe Area Guides Overlay"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                settings.showSafeArea !== false ? 'bg-sky-400 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            <span>SAFE AREA: {settings.showSafeArea !== false ? 'ON' : 'OFF'}</span>
          </button>
        )}

        {/* 6. Offscreen Canvas for High-Resolution Export & Video Merging */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
      </div>

      {/* Preset, Dimensions & Quick Actions underneath preview */}
      <div className="flex items-center justify-between w-full max-w-sm sm:max-w-md pt-2 px-1 text-xs text-zinc-400 font-mono">
        <span className="capitalize text-zinc-300 font-medium">
          {settings.preset ? settings.preset.replace('-', ' ') : 'Custom'} ({settings.aspectRatio})
        </span>

        <div className="flex items-center gap-2">
          {onToggleSafeArea && (
            <>
              <button
                type="button"
                onClick={onToggleSafeArea}
                className={`text-[11px] font-sans font-medium transition-colors cursor-pointer ${
                  settings.showSafeArea !== false
                    ? 'text-sky-400 hover:text-sky-300 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Toggle Safe Area Overlay Guide"
              >
                Safe Area: {settings.showSafeArea !== false ? 'ON' : 'OFF'}
              </button>
              <span className="text-zinc-600">|</span>
            </>
          )}
          <button
            type="button"
            onClick={() => onDownload?.('png')}
            className="flex items-center gap-1 text-[11px] font-sans font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            title="Download Full Resolution PNG"
          >
            <Download className="w-3 h-3 stroke-[2.5]" />
            <span>Download PNG</span>
          </button>
          <span className="text-zinc-600">|</span>
          <button
            type="button"
            onClick={() => onDownload?.('jpeg')}
            className="text-[11px] font-sans font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Download JPEG"
          >
            JPEG
          </button>
          {onApplyAsReelImage && (
            <>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={handleApplyCover}
                className="text-[11px] font-sans font-semibold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
                title="Set this thumbnail cover as the reel background image"
              >
                {appliedNotice ? 'Applied!' : 'Set as Reel Bg'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
