'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Sparkles } from 'lucide-react';
import {
  CaptionGroup,
  CaptionStyle,
  ImageAsset,
  ImagePosition,
  OutputSettings,
  TranscriptWord,
} from '@/lib/caption-maker/types';
import { hexToRgba } from '@/lib/caption-maker/sample-data';
import { loadGoogleFontInDocument } from '@/lib/caption-maker/google-fonts';


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

interface CaptionPreviewProps {
  image?: ImageAsset;
  audioUrl?: string;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  captionStyle: CaptionStyle;
  outputSettings: OutputSettings;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  totalDuration: number;
}

export const CaptionPreview: React.FC<CaptionPreviewProps> = ({
  image,
  audioUrl,
  transcript,
  captionGroups,
  captionStyle,
  outputSettings,
  currentTime,
  isPlaying,
  onTogglePlay,
  totalDuration,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(360);

  const isVideo =
    image?.mediaType === 'video' ||
    (image?.format && ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI'].includes(image.format.toUpperCase())) ||
    (image?.fileName && (
      image.fileName.toLowerCase().endsWith('.mp4') ||
      image.fileName.toLowerCase().endsWith('.mov') ||
      image.fileName.toLowerCase().endsWith('.webm')
    ));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      try {
        const p = video.play();
        if (p !== undefined) {
          p.catch(() => {});
        }
      } catch {}
    } else {
      try {
        video.pause();
      } catch {}
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.12) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

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

  const [, setFontLoadRevision] = useState(0);

  useEffect(() => {
    if (captionStyle.fontFamily) {
      loadGoogleFontInDocument(captionStyle.fontFamily, () => {
        setFontLoadRevision((r) => r + 1);
      });
    }
  }, [captionStyle.fontFamily]);

  // Clean primary font chosen by user (MUST be first in font stack so it always updates & applies!)
  // Nirmala UI and Segoe UI act as graceful secondary fallbacks if a glyph is missing.
  const cleanPrimaryFont =
    captionStyle.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Inter';
  const effectiveFontFamily = `"${cleanPrimaryFont}", "Nirmala UI", "Segoe UI", sans-serif`;

  // Active word and active caption group identification locked to exact acoustic speech intervals
  const activeGroup = captionGroups.find(
    (g) => currentTime >= g.start && currentTime <= g.end
  );

  // Only bridge tiny micro-gaps (< 0.08s) between continuous groups in the same clause;
  // never show captions early before speech starts or linger during real pauses.
  const displayGroup =
    activeGroup ||
    captionGroups.find((g, idx) => {
      const next = captionGroups[idx + 1];
      if (next && next.start - g.end <= 0.08) {
        return currentTime > g.end && currentTime < next.start;
      }
      return false;
    });

  // Find active word inside group with seamless interval matching ASS dialogue timings
  let displayWord: TranscriptWord | undefined;
  if (displayGroup && displayGroup.words.length > 0) {
    displayWord =
      displayGroup.words.find((w, idx) => {
        const next = displayGroup.words[idx + 1];
        const start = w.start;
        const end = next ? next.start : Math.max(w.end, displayGroup.end);
        return currentTime >= start && currentTime <= end;
      }) ||
      (currentTime < displayGroup.words[0].start
        ? displayGroup.words[0]
        : displayGroup.words[displayGroup.words.length - 1]);
  } else {
    displayWord = transcript.find(
      (w) => currentTime >= w.start && currentTime <= w.end
    );
  }

  // Dynamic scaling relative to 1080p canvas width (matches ASS output scaling perfectly)
  const previewScale = (containerWidth || 360) / 1080;
  const previewFontSize = Math.max(12, Math.round(captionStyle.fontSize * previewScale));
  const previewStrokeWidth = (captionStyle.strokeWidth ?? 0) > 0 ? Math.max(1, Math.round(captionStyle.strokeWidth * previewScale)) : 0;
  const previewShadowBlur = Math.round((captionStyle.shadowBlur || 6) * previewScale);

  // Aspect ratio calculation
  const getAspectRatioClasses = () => {
    switch (outputSettings.preset) {
      case 'instagram-reel':
      case 'youtube-short':
        return 'aspect-[9/16] max-h-[580px]';
      case 'instagram-portrait':
        return 'aspect-[4/5] max-h-[500px]';
      case 'instagram-square':
        return 'aspect-square max-h-[460px]';
      case 'youtube-landscape':
        return 'aspect-[16/9] max-h-[400px]';
      default:
        return 'aspect-[9/16] max-h-[580px]';
    }
  };

  // Vertical & Horizontal position styling matching ASS anchor coordinates 1:1
  const getPositionStyles = (): React.CSSProperties => {
    const isCustomX = captionStyle.textAlign === 'custom' || captionStyle.position === 'custom';
    const posX = isCustomX ? `${captionStyle.customX ?? 50}%` : '50%';

    if (captionStyle.position === 'top') {
      return { top: '18%', left: posX, transform: 'translate(-50%, 0)' };
    }
    if (captionStyle.position === 'center') {
      return { top: '50%', left: posX, transform: 'translate(-50%, -50%)' };
    }
    if (captionStyle.position === 'bottom') {
      return { top: '82%', left: posX, transform: 'translate(-50%, -100%)' };
    }
    return {
      top: `${captionStyle.customY ?? 20}%`,
      left: posX,
      transform: 'translate(-50%, -50%)',
    };
  };

  const textAlign = captionStyle.textAlign === 'custom' ? 'center' : (captionStyle.textAlign || 'center');
  const justifyAlign =
    textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';

  // Compute text shadow / neon glow based on textEffect
  const getTextShadow = (): string => {
    const effect = captionStyle.textEffect || 'none';
    if (!effect || effect === 'none') return 'none';
    if (effect === 'neon-glow') {
      const glow = captionStyle.glowColor || captionStyle.importantColor || '#FCD905';
      const blur = previewShadowBlur || 12;
      return `0 0 ${Math.max(2, Math.round(blur * 0.4))}px ${glow}, 0 0 ${blur}px ${glow}, 0 0 ${Math.round(blur * 1.5)}px ${glow}`;
    }
    if (effect === 'retro-3d') {
      const offX = Math.round((captionStyle.shadowOffsetX ?? 5) * previewScale);
      const offY = Math.round((captionStyle.shadowOffsetY ?? 5) * previewScale);
      const col = captionStyle.shadowColor || '#000000';
      return `${offX}px ${offY}px 0px ${col}`;
    }
    if (effect === 'soft-ambient') {
      return `0px 2px ${previewShadowBlur}px ${captionStyle.shadowColor || 'rgba(0,0,0,0.6)'}`;
    }
    // drop-shadow
    const offX = Math.round((captionStyle.shadowOffsetX ?? 0) * previewScale);
    const offY = Math.max(1, Math.round((captionStyle.shadowOffsetY ?? previewShadowBlur * 0.4) * previewScale));
    return `${offX}px ${offY}px ${previewShadowBlur}px ${captionStyle.shadowColor || 'rgba(0,0,0,0.85)'}`;
  };

  // Compute background container styling (Instagram / VN style badges)
  const getBackgroundStyles = (): React.CSSProperties => {
    const bgStyle = captionStyle.backgroundStyle || 'none';
    if (bgStyle === 'none') {
      if (captionStyle.backgroundColor && captionStyle.backgroundColor !== 'transparent') {
        const rawBg = captionStyle.backgroundColor;
        const opacity = captionStyle.backgroundOpacity ?? 0.8;
        return {
          backgroundColor: hexToRgba(rawBg, opacity),
          padding: `${Math.round(14 * previewScale * 0.5)}px ${Math.round(14 * previewScale)}px`,
          borderRadius: `${Math.round(16 * previewScale)}px`,
        };
      }
      return {};
    }

    const rawBg = captionStyle.backgroundColor || '#000000';
    const opacity = captionStyle.backgroundOpacity ?? 0.8;
    const bgRgba = hexToRgba(rawBg, opacity);
    const radius = Math.round((captionStyle.backgroundRadius ?? 16) * previewScale);
    const padX = Math.round((captionStyle.backgroundPadding ?? 14) * previewScale);
    const padY = Math.round(padX * 0.5);

    if (bgStyle === 'solid-pill') {
      return {
        backgroundColor: bgRgba,
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${padY}px ${padX}px`,
      };
    }
    if (bgStyle === 'frosted-glass') {
      return {
        backgroundColor: bgRgba,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${padY}px ${padX}px`,
      };
    }
    if (bgStyle === 'marker-bar') {
      return {
        backgroundColor: bgRgba,
        borderRadius: `${Math.min(6, radius)}px`,
        padding: `${padY}px ${padX}px`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      };
    }
    if (bgStyle === 'outline-pill') {
      return {
        backgroundColor: hexToRgba(rawBg, opacity * 0.4),
        border: `2px solid ${captionStyle.importantColor || '#FCD905'}`,
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${padY}px ${padX}px`,
      };
    }
    return {};
  };

  const previewLetterSpacing = `${Math.round((captionStyle.letterSpacing ?? 0) * previewScale)}px`;
  const previewLineHeight = captionStyle.lineHeight ?? 1.3;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div
        ref={containerRef}
        className={`relative rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center select-none ${getAspectRatioClasses()} w-full max-w-sm sm:max-w-md mx-auto group`}
      >
        {/* 1. Background Media Layer (Video or Image) */}
        {image ? (
          (image.fitMode || 'contain') === 'contain' ? (
            <div
              className="absolute inset-0 flex p-3 overflow-hidden"
              style={{
                justifyContent: posAlignment[image.position || 'bottom-left'].justifyContent,
                alignItems: posAlignment[image.position || 'bottom-left'].alignItems,
              }}
            >
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={image.fileUrl}
                  playsInline
                  muted
                  loop
                  style={{
                    maxWidth: `${image.scale ?? 100}%`,
                    maxHeight: `${image.scale ?? 100}%`,
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                  className="rounded-lg shadow-2xl transition-all duration-200"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.fileUrl}
                  alt="contained-bg"
                  style={{
                    maxWidth: `${image.scale ?? 100}%`,
                    maxHeight: `${image.scale ?? 100}%`,
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                  className="rounded-lg shadow-2xl transition-all duration-200"
                />
              )}
            </div>
          ) : (
            isVideo ? (
              <video
                ref={videoRef}
                src={image.fileUrl}
                playsInline
                muted
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.fileUrl}
                alt="bg"
                className="w-full h-full object-cover"
              />
            )
          )
        ) : (
          <div className="text-center p-6 text-zinc-500 flex flex-col items-center space-y-2">
            <Sparkles className="w-8 h-8 text-zinc-600 animate-pulse" />
            <p className="text-xs font-semibold text-zinc-400">Upload background video or image</p>
            <p className="text-[10px] text-zinc-600">Reel canvas will render here</p>
          </div>
        )}

        {/* 2. Safe Area Guides Overlay */}
        {captionStyle.showSafeArea && (
          <div className="absolute inset-x-6 inset-y-12 border-2 border-dashed border-sky-400/35 rounded-xl pointer-events-none z-10 flex flex-col justify-between p-2">
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-start">
              SAFE AREA TOP
            </span>
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-end">
              REEL UI SAFE ZONE
            </span>
          </div>
        )}

        {/* 3. Real-Time Animated Caption Layer */}
        <div
          style={{
            ...getPositionStyles(),
            width: '88%',
            maxWidth: '88%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: justifyAlign,
            justifyContent: 'center',
            textAlign,
          }}
          className="absolute z-20 pointer-events-none transition-all"
        >
          {/* Rohaid Ali CodePen GSAP Text Animation Keyframes */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes gsapWordsSlideUp {
                  0% { opacity: 0; transform: translateY(100%); }
                  100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes gsapWordsRotateIn {
                  0% { opacity: 0; transform: perspective(1000px) rotateX(-90deg); }
                  100% { opacity: 1; transform: perspective(1000px) rotateX(0deg); }
                }
                @keyframes gsapLettersSlideUp {
                  0% { opacity: 0; transform: translateY(100%); }
                  100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes gsapLettersSlideDown {
                  0% { opacity: 0; transform: translateY(-100%); }
                  100% { opacity: 1; transform: translateY(0); }
                }
              `,
            }}
          />

          {captionStyle.captionMode === 'word-by-word' ? (
            // Mode 1: Word-by-Word Solo Display
            displayWord && (() => {
              const animPreset = captionStyle.animationPreset;
              const isLetterPreset = animPreset?.startsWith('letters-');
              const soloWordText = captionStyle.uppercase ? displayWord.text.toUpperCase() : displayWord.text;

              let soloAnimStyle: React.CSSProperties = {};
              if (animPreset === 'words-slide-up') {
                soloAnimStyle = {
                  animation: 'gsapWordsSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                };
              } else if (animPreset === 'words-rotate-in') {
                soloAnimStyle = {
                  transformOrigin: '50% 100%',
                  animation: 'gsapWordsRotateIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                };
              }

              return (
                <div
                  key={displayWord.id}
                  style={{
                    fontFamily: effectiveFontFamily,
                    fontSize: `${previewFontSize}px`,
                    fontWeight:
                      captionStyle.fontWeight === 'black'
                        ? 900
                        : captionStyle.fontWeight === 'bold'
                        ? 700
                        : captionStyle.fontWeight === 'semibold'
                        ? 600
                        : captionStyle.fontWeight === 'medium'
                        ? 500
                        : 400,
                    color: displayWord.isImportant
                      ? captionStyle.importantColor
                      : captionStyle.textColor,
                    WebkitTextStroke: previewStrokeWidth > 0 ? `${previewStrokeWidth}px ${captionStyle.strokeColor}` : 'none',
                    paintOrder: 'stroke fill',
                    textShadow: getTextShadow(),
                    lineHeight: previewLineHeight,
                    letterSpacing: previewLetterSpacing,
                    whiteSpace: 'nowrap',
                    overflow: (isLetterPreset || animPreset === 'words-slide-up') ? 'hidden' : 'visible',
                    transform:
                      captionStyle.highlightAnimation === 'color-change' || captionStyle.highlightAnimation === 'none'
                        ? 'none'
                        : `scale(${Math.min(1.2, captionStyle.zoomScale ?? 1.15)})`,
                    ...getBackgroundStyles(),
                    ...soloAnimStyle,
                  }}
                  className="inline-block transition-transform duration-75"
                >
                  {isLetterPreset ? (
                    soloWordText.split('').map((char, cIdx) => (
                      <span
                        key={cIdx}
                        style={{
                          display: 'inline-block',
                          animation:
                            animPreset === 'letters-slide-down'
                              ? 'gsapLettersSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) both'
                              : 'gsapLettersSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
                          animationDelay: `${cIdx * 0.025}s`,
                        }}
                      >
                        {char}
                      </span>
                    ))
                  ) : (
                    soloWordText
                  )}
                </div>
              );
            })()
          ) : (
            // Mode 2 & Mode 3: Phrase Highlight
            displayGroup && (
              <div
                key={displayGroup.id}
                style={{
                  fontFamily: effectiveFontFamily,
                  fontSize: `${previewFontSize}px`,
                  fontWeight:
                    captionStyle.fontWeight === 'black'
                      ? 900
                      : captionStyle.fontWeight === 'bold'
                      ? 700
                      : captionStyle.fontWeight === 'semibold'
                      ? 600
                      : captionStyle.fontWeight === 'medium'
                      ? 500
                      : 400,
                  WebkitTextStroke: previewStrokeWidth > 0 ? `${previewStrokeWidth}px ${captionStyle.strokeColor}` : 'none',
                  paintOrder: 'stroke fill',
                  textShadow: getTextShadow(),
                  lineHeight: previewLineHeight,
                  letterSpacing: previewLetterSpacing,
                  ...getBackgroundStyles(),
                  textAlign,
                  maxWidth: '100%',
                  columnGap: `${Math.max(8, Math.round(previewFontSize * 0.32))}px`,
                  rowGap: `${Math.max(6, Math.round(previewFontSize * 0.40 * Math.max(0.3, previewLineHeight - 0.7)))}px`,
                }}
                className={`inline-flex flex-wrap items-center ${
                  textAlign === 'left'
                    ? 'justify-start'
                    : textAlign === 'right'
                    ? 'justify-end'
                    : 'justify-center'
                }`}
              >
                {displayGroup.words.map((w, idx) => {
                  const isCurrent = displayWord?.id === w.id;
                  const wordText = captionStyle.uppercase ? w.text.toUpperCase() : w.text;

                  const highlightAnim = captionStyle.highlightAnimation || 'pop';
                  const isWordPillActive = isCurrent && (highlightAnim === 'background' || Boolean(captionStyle.activeWordBgColor && highlightAnim !== 'color-change' && highlightAnim !== 'none'));
                  const isUnderline = isCurrent && highlightAnim === 'underline';
                  const isGlowFlash = isCurrent && highlightAnim === 'glow';

                  // Determine active word zoom:
                  let effectiveScale = 1.0;
                  if (isCurrent) {
                    if (highlightAnim === 'pop') {
                      effectiveScale = captionStyle.zoomScale ?? 1.15;
                    } else if (highlightAnim === 'background') {
                      effectiveScale = 1.04;
                    } else {
                      effectiveScale = 1.0;
                    }
                  }

                  // Active word horizontal margin buffer to prevent ANY text overlap:
                  const extraMargin = effectiveScale > 1.0
                    ? Math.round((effectiveScale - 1) * 0.45 * previewFontSize)
                    : 0;

                  const wordBg = isWordPillActive
                    ? (captionStyle.activeWordBgColor || captionStyle.importantColor)
                    : undefined;

                  const wordColor = isWordPillActive
                    ? '#000000'
                    : isCurrent
                    ? captionStyle.importantColor
                    : (w.isImportant ? captionStyle.importantColor : captionStyle.textColor);

                  let activeTextShadow = getTextShadow();
                  if (isGlowFlash) {
                    const glowCol = captionStyle.glowColor || captionStyle.importantColor || '#FCD905';
                    activeTextShadow = `0 0 4px ${glowCol}, 0 0 12px ${glowCol}, 0 0 20px ${glowCol}`;
                  }

                  const animPreset = captionStyle.animationPreset;
                  const isLetterPreset = animPreset?.startsWith('letters-');

                  let wordAnimStyle: React.CSSProperties = {};
                  if (animPreset === 'words-slide-up') {
                    wordAnimStyle = {
                      animation: 'gsapWordsSlideUp 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                      animationDelay: `${idx * 0.08}s`,
                    };
                  } else if (animPreset === 'words-rotate-in') {
                    wordAnimStyle = {
                      transformOrigin: '50% 100%',
                      animation: 'gsapWordsRotateIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
                      animationDelay: `${idx * 0.08}s`,
                    };
                  }

                  return (
                    <span
                      key={w.id || `${w.text}-${idx}`}
                      style={{
                        color: wordColor,
                        backgroundColor: wordBg,
                        padding: isWordPillActive ? '2px 8px' : undefined,
                        borderRadius: isWordPillActive ? `${Math.round(8 * previewScale)}px` : undefined,
                        opacity: isCurrent ? 1 : (captionStyle.textOpacity ?? 1.0),
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        transformOrigin: animPreset === 'words-rotate-in' ? '50% 100%' : 'center center',
                        transform: effectiveScale !== 1.0 ? `scale(${effectiveScale})` : undefined,
                        marginLeft: extraMargin > 0 ? `${extraMargin}px` : undefined,
                        marginRight: extraMargin > 0 ? `${extraMargin}px` : undefined,
                        textDecoration: isUnderline ? 'underline' : 'none',
                        textDecorationColor: isUnderline ? captionStyle.importantColor : undefined,
                        textUnderlineOffset: isUnderline ? '4px' : undefined,
                        textShadow: activeTextShadow,
                        overflow: (isLetterPreset || animPreset === 'words-slide-up') ? 'hidden' : 'visible',
                        ...wordAnimStyle,
                      }}
                      className="transition-all duration-75"
                    >
                      {isLetterPreset ? (
                        wordText.split('').map((char, cIdx) => (
                          <span
                            key={cIdx}
                            style={{
                              display: 'inline-block',
                              animation:
                                animPreset === 'letters-slide-down'
                                  ? 'gsapLettersSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) both'
                                  : 'gsapLettersSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                              animationDelay: `${(idx * 0.08) + (cIdx * 0.025)}s`,
                            }}
                          >
                            {char}
                          </span>
                        ))
                      ) : (
                        wordText
                      )}
                    </span>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* 4. Center Play/Pause Clickable Overlay */}
        <button
          type="button"
          onClick={onTogglePlay}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <div className="p-4 rounded-full bg-white/90 text-zinc-950 shadow-2xl hover:scale-110 transition-transform">
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </div>
        </button>
      </div>

      {/* Preset & Time Badge underneath preview */}
      <div className="flex items-center justify-between w-full max-w-sm sm:max-w-md pt-2 px-1 text-xs text-zinc-400 font-mono">
        <span className="capitalize">{outputSettings.preset.replace('-', ' ')}</span>
        <span className="text-zinc-200">
          {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
};
