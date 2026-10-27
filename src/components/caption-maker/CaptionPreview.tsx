'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause, Clapperboard } from 'lucide-react';
import {
  CaptionGroup,
  CaptionStyle,
  ImageAsset,
  ImagePosition,
  OutputSettings,
  SfxCue,
  TranscriptWord,
} from '@/lib/caption-maker/types';
import { hexToRgba, getContrastingTextColor } from '@/lib/caption-maker/sample-data';
import { loadGoogleFontInDocument } from '@/lib/caption-maker/google-fonts';
import { getKeywordEmoji } from '@/lib/caption-maker/hinglish-and-emoji';
import {
  easeOutBack,
  easeInPower1,
  easeOutPower2,
  getActiveTranscriptWordAtTime,
  getEmojiBounceOffset,
  getStaggeredAnimationTiming,
  getUnitProgress,
  getWordHighlightProgress,
  getWordAnimationWindow,
  interpolateCssColor,
} from '@/lib/caption-maker/caption-timing';
import {
  getNinePositionCoordinates,
  applyWordTransform,
  resolveNinePosition,
  splitGraphemes,
  isDevanagari,
} from '@/lib/caption-maker/text-transform';
import { SafeAreaOverlay } from './SafeAreaOverlay';


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
  speaker1Color?: string;
  speaker2Color?: string;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  onUpdateStyle?: (updates: Partial<CaptionStyle>) => void;
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
  speaker1Color,
  speaker2Color,
  sfxCues,
  autoSfxEnabled = true,
  onUpdateStyle,
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

  // Live preview AI SFX cues playback
  const lastPlayedSfxRef = useRef<Record<number, boolean>>({});
  useEffect(() => {
    if (!isPlaying || autoSfxEnabled === false || !sfxCues || sfxCues.length === 0) {
      lastPlayedSfxRef.current = {};
      return;
    }
    sfxCues.forEach((cue, idx) => {
      if (Math.abs(currentTime - cue.time) < 0.15 && !lastPlayedSfxRef.current[idx]) {
        lastPlayedSfxRef.current[idx] = true;
        try {
          const sfx = new Audio(`/audio/sfx/${cue.type}.mp3`);
          sfx.volume = Math.max(0, Math.min(1.0, cue.volume ?? 0.7));
          sfx.play().catch(() => {});
        } catch {}
      }
    });
  }, [currentTime, isPlaying, autoSfxEnabled, sfxCues]);

  // Clean primary font chosen by user (MUST be first in font stack so it always updates & applies!)
  // Nirmala UI and Segoe UI act as graceful secondary fallbacks if a glyph is missing.
  const cleanPrimaryFont =
    captionStyle.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Inter';
  const effectiveFontFamily = `"${cleanPrimaryFont}", "Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", "Segoe UI", sans-serif`;

  // Use half-open acoustic intervals so the next word owns an exact shared
  // boundary and pauses never keep the previous word highlighted.
  const activeGroup = captionGroups.find(
    (g) => currentTime >= g.start && currentTime < g.end
  );
  const displayGroup = activeGroup;
  const displayWord = displayGroup
    ? getActiveTranscriptWordAtTime(displayGroup.words, currentTime)
    : getActiveTranscriptWordAtTime(transcript, currentTime);

  // Dynamic scaling relative to 1080p canvas width (matches ASS output scaling perfectly)
  const previewScale = (containerWidth || 360) / 1080;
  const previewFontSize = Math.max(12, Math.round(captionStyle.fontSize * previewScale));
  const previewStrokeWidth = (captionStyle.strokeWidth ?? 0) > 0 ? Math.max(1, Math.round(captionStyle.strokeWidth * previewScale)) : 0;
  const previewShadowBlur = Math.round((captionStyle.shadowBlur || 6) * previewScale);

  // Aspect ratio calculation
  const getAspectRatioClasses = () => {
    switch (outputSettings.preset) {
      case 'instagram-reel':
      case 'facebook-reel':
      case 'youtube-short':
      case 'threads-video':
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

  // Unified 9-position anchor and coordinates
  const coords = getNinePositionCoordinates(
    captionStyle.position,
    captionStyle.customX,
    captionStyle.customY,
    captionStyle.textAlign
  );

  const getPositionStyles = (): React.CSSProperties => {
    return {
      top: coords.top,
      left: coords.left,
      transform: coords.transform,
    };
  };

  const textAlign = coords.textAlign;
  const justifyAlign = coords.alignItems;

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

  const hasDevanagari = useMemo(() => {
    const sampleText =
      (displayGroup?.words || []).map((w) => w.text).join(' ') +
      ' ' +
      (displayWord?.text || '');
    return isDevanagari(sampleText);
  }, [displayGroup, displayWord]);

  const previewLetterSpacing = hasDevanagari
    ? '0px'
    : `${Math.round((captionStyle.letterSpacing ?? 0) * previewScale)}px`;
  const previewLineHeight = captionStyle.lineHeight ?? 1.3;
  const phraseDuration = displayGroup
    ? Math.max(0, displayGroup.end - displayGroup.start)
    : 0;
  const phraseWindow = displayGroup
    ? getWordAnimationWindow(displayGroup.start, displayGroup.end, 0.06, 0.06)
    : undefined;
  const phraseOpacity = phraseWindow && phraseWindow.duration > 0
    ? Math.min(
        getUnitProgress(currentTime - phraseWindow.start, phraseWindow.entryDuration),
        1 - getUnitProgress(currentTime - phraseWindow.exitStart, phraseWindow.exitDuration)
      )
    : 0;
  const phraseMotionPreset = captionStyle.animationPreset;
  const phraseIsWordMotion = phraseMotionPreset === 'words-slide-up' || phraseMotionPreset === 'words-rotate-in';
  const phraseIsLetterMotion = phraseMotionPreset === 'letters-slide-up' || phraseMotionPreset === 'letters-slide-down';
  const phraseCharacterOffsets = new Map<string, number>();
  let phraseCharacterCount = 0;
  if (displayGroup && phraseIsLetterMotion) {
    for (const word of displayGroup.words) {
      phraseCharacterOffsets.set(word.id, phraseCharacterCount);
      phraseCharacterCount += splitGraphemes(
        applyWordTransform(word.text, captionStyle.textTransform, captionStyle.uppercase, true)
      ).length;
    }
  }
  const phraseMotionItemCount = phraseIsWordMotion
    ? displayGroup?.words.length ?? 0
    : phraseCharacterCount;
  const phraseMotionRequestedDuration = phraseMotionPreset === 'words-slide-up'
    ? Math.min(0.45, phraseDuration * 0.4)
    : phraseMotionPreset === 'words-rotate-in'
      ? Math.min(0.55, phraseDuration * 0.45)
      : Math.min(0.3, phraseDuration * 0.35);
  const phraseMotionTiming = getStaggeredAnimationTiming(
    phraseMotionItemCount,
    phraseWindow ? Math.max(0, phraseWindow.exitStart - phraseWindow.start) : 0,
    phraseMotionRequestedDuration,
    phraseIsWordMotion ? 0.08 : 0.025
  );

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div
        ref={containerRef}
        className={`relative rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center select-none ${getAspectRatioClasses()} w-full max-w-sm sm:max-w-md mx-auto group`}
      >
        {/* 1. Background Media Layer (Video or Image) */}
        {image ? (
          (image.fitMode || 'cover') === 'blur' ? (
            <>
              {isVideo ? (
                <video src={image.fileUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-70" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.fileUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-70" />
              )}
              {isVideo ? (
                <video src={image.fileUrl} muted playsInline className="absolute inset-0 w-full h-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.fileUrl} alt={image.fileName} className="absolute inset-0 w-full h-full object-contain" />
              )}
            </>
          ) : (image.fitMode || 'cover') === 'contain' ? (
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
            <Clapperboard className="w-8 h-8 text-zinc-600" aria-hidden="true" />
            <p className="text-xs font-semibold text-zinc-400">Upload background video or image</p>
            <p className="text-[10px] text-zinc-600">Reel canvas will render here</p>
          </div>
        )}

        {/* 2. Professional Dynamic Social Safe Area & Guides Overlay */}
        <SafeAreaOverlay
          aspectRatio={outputSettings.aspectRatio}
          preset={captionStyle.safeZoneOverrides?.platform || outputSettings.preset}
          mode="reel"
          showGuides={captionStyle.showSafeArea}
          activeNinePos={coords.ninePos}
          customOverrides={captionStyle.safeZoneOverrides}
          onSelectPlatform={(p) => {
            if (onUpdateStyle) {
              onUpdateStyle({
                safeZoneOverrides: {
                  ...captionStyle.safeZoneOverrides,
                  platform: p,
                },
              });
            }
          }}
        />

        {/* 3. Real-Time Animated Caption Layer */}
        {(() => {
          const isVertical916 =
            outputSettings.preset === 'instagram-reel' ||
            outputSettings.preset === 'facebook-reel' ||
            outputSettings.preset === 'youtube-short' ||
            outputSettings.preset === 'threads-video' ||
            outputSettings.aspectRatio === '9:16';
          const captionWidth = isVertical916 ? '78%' : '88%';

          return (
            <div
              style={{
                ...getPositionStyles(),
                width: captionWidth,
                maxWidth: captionWidth,
                display: 'flex',
                flexDirection: 'column',
                alignItems: justifyAlign,
                justifyContent: 'center',
                textAlign,
              }}
              className="absolute z-20 pointer-events-none"
            >
          {captionStyle.captionMode === 'word-by-word' ? (
            // Mode 1: Word-by-Word Solo Display
            displayWord && (() => {
              const animPreset = captionStyle.animationPreset;
              const isLetterPreset = animPreset?.startsWith('letters-');
              const soloCharacters = splitGraphemes(applyWordTransform(
                displayWord.text,
                captionStyle.textTransform,
                captionStyle.uppercase,
                true
              ));
              const soloWordText = applyWordTransform(
                displayWord.text,
                captionStyle.textTransform,
                captionStyle.uppercase,
                true
              );
              const soloRequestedDuration = animPreset?.startsWith('letters-') ? 0.16
                : animPreset === 'words-slide-up' ? 0.22
                  : animPreset === 'words-rotate-in' ? 0.25 : 0.06;
              const soloWindow = getWordAnimationWindow(
                displayWord.start,
                displayWord.end,
                soloRequestedDuration,
                0.06
              );
              const soloProgress = getUnitProgress(currentTime - soloWindow.start, soloWindow.entryDuration);
              const soloHighlight = captionStyle.highlightAnimation || 'pop';
              const soloIsSpeaker2 = displayWord.speakerId === 'Speaker 2' ||
                displayWord.speakerId?.toLowerCase().includes('speaker 2') ||
                (Boolean(displayWord.speakerId) && displayWord.speakerId !== 'Speaker 1');
              const soloSpeakerColor = soloIsSpeaker2
                ? speaker2Color || captionStyle.speaker2Color || '#06B6D4'
                : speaker1Color || captionStyle.speaker1Color || captionStyle.textColor;
              const soloBaseColor = displayWord.isImportant ? captionStyle.importantColor : soloSpeakerColor;
              const soloHasWordBadge = soloHighlight === 'background' || Boolean(
                captionStyle.activeWordBgColor && soloHighlight !== 'color-change' && soloHighlight !== 'none'
              );
              const soloBadgeColor = captionStyle.activeWordBgColor || captionStyle.importantColor;
              const soloHighlightProgress = getWordHighlightProgress(
                displayWord.start,
                displayWord.end,
                currentTime
              );
              const soloTargetColor = soloHighlight === 'none'
                ? soloBaseColor
                : soloHasWordBadge
                  ? getContrastingTextColor(soloBadgeColor)
                  : soloIsSpeaker2
                    ? soloSpeakerColor
                    : captionStyle.importantColor;
              const soloWordColor = interpolateCssColor(soloBaseColor, soloTargetColor, soloHighlightProgress);
              const soloEasedProgress = easeOutPower2(soloProgress);
              const soloEntryOpacity = animPreset === 'words-slide-up'
                ? easeOutBack(soloProgress)
                : soloEasedProgress;
              const soloExitProgress = currentTime >= soloWindow.exitStart
                ? getUnitProgress(currentTime - soloWindow.exitStart, soloWindow.exitDuration)
                : 0;
              const soloExitEased = easeInPower1(soloExitProgress);
              const soloOpacity = currentTime >= soloWindow.exitStart
                ? 1 - soloExitEased
                : soloEntryOpacity;
              const soloTextScale = Math.min(
                1.4,
                (captionStyle.highlightAnimation === 'color-change' || captionStyle.highlightAnimation === 'none'
                  ? 1
                  : captionStyle.highlightAnimation === 'background'
                    ? 1.04
                    : captionStyle.zoomScale ?? 1.15) *
                  (displayWord.intensity === 'climax' ? 1.35 : displayWord.intensity === 'punch' ? 1.22 : displayWord.intensity === 'whisper' ? 0.90 : 1.0)
              );
              const hasNativeEntryMotion = isLetterPreset || animPreset === 'words-slide-up' || animPreset === 'words-rotate-in';
              const soloScale = hasNativeEntryMotion
                ? soloTextScale
                : currentTime >= soloWindow.exitStart
                  ? soloTextScale + (0.9 - soloTextScale) * soloExitEased
                  : 0.85 + (soloTextScale - 0.85) * soloEasedProgress;
              const soloTranslate = animPreset === 'words-slide-up'
                ? currentTime >= soloWindow.exitStart
                  ? `translateY(${-40 * soloExitEased}%)`
                  : `translateY(${(1 - easeOutBack(soloProgress)) * 100}%)`
                : animPreset === 'words-rotate-in'
                  ? currentTime >= soloWindow.exitStart
                    ? `perspective(1000px) rotateX(${45 * soloExitEased}deg)`
                    : `perspective(1000px) rotateX(${-90 * (1 - soloEasedProgress)}deg)`
                  : '';
              const soloCharTiming = getStaggeredAnimationTiming(
                soloCharacters.length,
                Math.max(0, soloWindow.exitStart - soloWindow.start),
                soloWindow.entryDuration,
                0.02
              );
              const soloAnimStyle: React.CSSProperties = {
                opacity: soloOpacity,
                transform: `${soloTranslate} scale(${soloScale})`.trim(),
                transformOrigin: animPreset === 'words-rotate-in' ? '50% 100%' : 'center center',
              };

              const soloEmoji = displayWord.emoji || getKeywordEmoji(displayWord.text);

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
                    color: soloWordColor,
                    WebkitTextStroke: previewStrokeWidth > 0 ? `${previewStrokeWidth}px ${captionStyle.strokeColor}` : 'none',
                    paintOrder: 'stroke fill',
                    textShadow: getTextShadow(),
                    lineHeight: previewLineHeight,
                    letterSpacing: previewLetterSpacing,
                    whiteSpace: 'nowrap',
                    overflow: (isLetterPreset || animPreset === 'words-slide-up') ? 'hidden' : 'visible',
                    ...getBackgroundStyles(),
                    ...(soloHasWordBadge ? {
                      backgroundColor: interpolateCssColor('transparent', soloBadgeColor, soloHighlightProgress),
                      borderRadius: `${Math.round(8 * previewScale)}px`,
                      paddingTop: `${Math.max(1, Math.round(2 * previewScale))}px`,
                      paddingBottom: `${Math.max(1, Math.round(2 * previewScale))}px`,
                      paddingLeft: `${Math.round(8 * previewScale)}px`,
                      paddingRight: `${Math.round(8 * previewScale)}px`,
                    } : {}),
                    ...soloAnimStyle,
                  }}
                  className="relative inline-block"
                >
                  {captionStyle.showEmojis !== false && soloEmoji && (
                    <span
                      className="absolute -top-10 left-1/2 select-none pointer-events-none z-30 leading-none"
                      style={{
                        transform: `translate(-50%, -${getEmojiBounceOffset(currentTime, displayWord.start)}px)`,
                        fontSize: `${Math.max(24, Math.round(previewFontSize * 1.05))}px`,
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))',
                      }}
                    >
                      {soloEmoji}
                    </span>
                  )}
                  {isLetterPreset ? (
                    soloCharacters.map((char, cIdx) => {
                      const charProgress = getUnitProgress(
                        currentTime - displayWord.start - cIdx * soloCharTiming.stagger,
                        soloCharTiming.duration
                      );
                      const charEase = easeOutPower2(charProgress);
                      const direction = animPreset === 'letters-slide-down' ? -1 : 1;
                      return (
                      <span
                        key={cIdx}
                        style={{
                          display: 'inline-block',
                          opacity: charProgress,
                          transform: `translateY(${direction * (1 - charEase) * 100}%)`,
                        }}
                      >
                        {char}
                      </span>
                    )})
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
                  opacity: phraseOpacity,
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
                  const isSentenceStart = idx === 0 || /[.!?]$/.test(displayGroup.words[idx - 1]?.text || '');
                  const wordText = applyWordTransform(
                    w.text,
                    captionStyle.textTransform,
                    captionStyle.uppercase,
                    isSentenceStart
                  );
                  const matchedEmoji = w.emoji || getKeywordEmoji(w.text);
                  const showWordEmoji = captionStyle.showEmojis !== false && matchedEmoji && isCurrent;

                  const highlightAnim = captionStyle.highlightAnimation || 'pop';
                  const isWordPillActive = isCurrent && (highlightAnim === 'background' || Boolean(captionStyle.activeWordBgColor && highlightAnim !== 'color-change' && highlightAnim !== 'none'));
                  const isUnderline = isCurrent && highlightAnim === 'underline';

                  // Determine active word zoom:
                  let targetScale = 1.0;
                  if (highlightAnim === 'pop' || highlightAnim === 'scale') {
                    targetScale = captionStyle.zoomScale ?? 1.15;
                  } else if (highlightAnim === 'background') {
                    targetScale = 1.04;
                  }
                  if (w.intensity === 'punch') targetScale *= 1.22;
                  else if (w.intensity === 'climax') targetScale *= 1.35;
                  else if (w.intensity === 'whisper') targetScale *= 0.90;

                  const highlightProgress = getWordHighlightProgress(
                    w.start,
                    w.end,
                    currentTime,
                    0.06,
                    0.07,
                    targetScale > 1 ? 'power2' : 'linear'
                  );
                  const effectiveScale = 1 + (targetScale - 1) * highlightProgress;

                  // Active word horizontal margin buffer to prevent ANY text overlap:
                  const extraMargin = effectiveScale > 1.0
                    ? Math.round((effectiveScale - 1) * 0.45 * previewFontSize)
                    : 0;

                  const isSpeaker2 =
                    w.speakerId === 'Speaker 2' ||
                    w.speakerId?.toLowerCase().includes('speaker 2') ||
                    (Boolean(w.speakerId) && w.speakerId !== 'Speaker 1');
                  const spk2Col = speaker2Color || captionStyle.speaker2Color || '#06B6D4';
                  const spk1Col = speaker1Color || captionStyle.speaker1Color || captionStyle.textColor;
                  const speakerColor = isSpeaker2 ? spk2Col : spk1Col;

                  const wordBg = isWordPillActive
                    ? (captionStyle.activeWordBgColor || captionStyle.importantColor)
                    : undefined;

                  // Vocal intensity changes scale, but the chosen active-word color remains authoritative.
                  const activeColor = isSpeaker2 ? spk2Col : captionStyle.importantColor;

                  const baseWordColor = w.isImportant ? captionStyle.importantColor : speakerColor;
                  const targetWordColor = highlightAnim === 'none'
                    ? baseWordColor
                    : isWordPillActive
                      ? getContrastingTextColor(wordBg || '#FCD905')
                      : activeColor;
                  const wordColor = interpolateCssColor(baseWordColor, targetWordColor, highlightProgress);

                  let activeTextShadow = getTextShadow();
                  if (highlightAnim === 'glow' && highlightProgress > 0) {
                    const glowCol = captionStyle.glowColor || captionStyle.importantColor || '#FCD905';
                    const glowColor = interpolateCssColor('transparent', glowCol, highlightProgress);
                    activeTextShadow = `0 0 ${Math.max(1, Math.round(4 * highlightProgress))}px ${glowColor}, 0 0 ${Math.round(12 * highlightProgress)}px ${glowColor}, 0 0 ${Math.round(20 * highlightProgress)}px ${glowColor}`;
                  }

                  const animPreset = captionStyle.animationPreset;
                  const isLetterPreset = animPreset?.startsWith('letters-');

                  const motionItemIndex = phraseIsLetterMotion
                    ? phraseCharacterOffsets.get(w.id) ?? 0
                    : idx;
                  const motionStart = displayGroup.start + motionItemIndex * phraseMotionTiming.stagger;
                  const motionProgress = getUnitProgress(
                    currentTime - motionStart,
                    phraseMotionTiming.duration
                  );
                  const motionEase = animPreset === 'words-slide-up'
                    ? easeOutBack(motionProgress)
                    : easeOutPower2(motionProgress);
                  const motionTransform = animPreset === 'words-slide-up'
                    ? `translateY(${(1 - motionEase) * 100}%)`
                    : animPreset === 'words-rotate-in'
                      ? `perspective(1000px) rotateX(${-90 * (1 - motionEase)}deg)`
                      : '';
                  const scaledWordTransform = effectiveScale !== 1.0
                    ? `scale(${effectiveScale})`
                    : '';
                  const normalOpacity = captionStyle.textOpacity ?? 1.0;
                  const highlightOpacity = normalOpacity + (1 - normalOpacity) * highlightProgress;
                  const wordAnimStyle: React.CSSProperties = phraseIsWordMotion
                    ? {
                        opacity: motionProgress * highlightOpacity,
                        transform: `${motionTransform} ${scaledWordTransform}`.trim(),
                        transformOrigin: animPreset === 'words-rotate-in' ? '50% 100%' : 'center center',
                      }
                    : scaledWordTransform
                      ? { transform: scaledWordTransform }
                      : {};

                  return (
                    <span
                      key={w.id || `${w.text}-${idx}`}
                      style={{
                        color: wordColor,
                        backgroundColor: wordBg
                          ? interpolateCssColor('transparent', wordBg, highlightProgress)
                          : undefined,
                        borderRadius: isWordPillActive ? `${Math.round(8 * previewScale)}px` : undefined,
                        opacity: phraseIsWordMotion ? undefined : highlightOpacity,
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        transformOrigin: animPreset === 'words-rotate-in' ? '50% 100%' : 'center center',
                        marginLeft: extraMargin > 0 ? `${extraMargin}px` : undefined,
                        marginRight: extraMargin > 0 ? `${extraMargin}px` : undefined,
                        textDecoration: isUnderline ? 'underline' : 'none',
                        textDecorationColor: isUnderline
                          ? interpolateCssColor('transparent', captionStyle.importantColor, highlightProgress)
                          : undefined,
                        textUnderlineOffset: isUnderline ? '4px' : undefined,
                        textShadow: activeTextShadow,
                        overflow: (isLetterPreset || animPreset === 'words-slide-up') ? 'hidden' : 'visible',
                        paddingTop: isWordPillActive
                          ? `${Math.max(1, Math.round(2 * previewScale))}px`
                          : (isLetterPreset || animPreset === 'words-slide-up')
                            ? '0.14em'
                            : undefined,
                        paddingBottom: isWordPillActive
                          ? `${Math.max(1, Math.round(2 * previewScale))}px`
                          : (isLetterPreset || animPreset === 'words-slide-up')
                            ? '0.14em'
                            : undefined,
                        paddingLeft: isWordPillActive ? `${Math.round(8 * previewScale)}px` : undefined,
                        paddingRight: isWordPillActive ? `${Math.round(8 * previewScale)}px` : undefined,
                        marginTop: (isLetterPreset || animPreset === 'words-slide-up') ? '-0.14em' : undefined,
                        marginBottom: (isLetterPreset || animPreset === 'words-slide-up') ? '-0.14em' : undefined,
                        ...wordAnimStyle,
                      }}
                      className="relative"
                    >
                      {showWordEmoji && (
                        <span
                          className="absolute -top-9 left-1/2 select-none pointer-events-none z-30 leading-none"
                          style={{
                            transform: `translate(-50%, -${getEmojiBounceOffset(currentTime, w.start)}px)`,
                            fontSize: `${Math.max(22, Math.round(previewFontSize * 0.95))}px`,
                            filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6))',
                          }}
                        >
                          {matchedEmoji}
                        </span>
                      )}
                      {isLetterPreset ? (
                        splitGraphemes(wordText).map((char, cIdx) => {
                          const charIndex = motionItemIndex + cIdx;
                          const charStart = displayGroup.start + charIndex * phraseMotionTiming.stagger;
                          const charProgress = getUnitProgress(
                            currentTime - charStart,
                            phraseMotionTiming.duration
                          );
                          const charEase = easeOutPower2(charProgress);
                          const direction = animPreset === 'letters-slide-down' ? -1 : 1;
                          return (
                          <span
                            key={cIdx}
                            style={{
                              display: 'inline-block',
                              opacity: charProgress,
                              transform: `translateY(${direction * (1 - charEase) * 100}%)`,
                            }}
                          >
                            {char}
                          </span>
                        )})
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
          );
        })()}

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
      <div className="h-7 flex items-center justify-between w-full max-w-sm sm:max-w-md pt-2 px-1 text-xs text-zinc-400 font-mono">
        <span className="capitalize">{outputSettings.preset.replace('-', ' ')}</span>
        <div className="flex items-center gap-2">
          {onUpdateStyle && (
            <button
              type="button"
              onClick={() => onUpdateStyle({ showSafeArea: !captionStyle.showSafeArea })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                captionStyle.showSafeArea
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
              title="Toggle 9:16 Social Safe Area & 9-Position Guides"
            >
              <span>🛡️</span>
              <span>Safe Area: {captionStyle.showSafeArea ? 'ON' : 'OFF'}</span>
            </button>
          )}
          <span className="text-zinc-200 font-bold">
            {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
};
