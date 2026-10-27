import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import gsap from 'gsap';
import { CaptionGroup, CaptionStyle, TranscriptWord } from '../lib/caption-maker/types';
import { hexToRgba, getContrastingTextColor } from '../lib/caption-maker/sample-data';
import { getGoogleFontUrl } from '../lib/caption-maker/google-fonts';
import { getKeywordEmoji } from '../lib/caption-maker/hinglish-and-emoji';
import {
  getActiveTranscriptWordAtTime,
  getEmojiBounceOffset,
  getStaggeredAnimationTiming,
  getWordAnimationWindow,
} from '../lib/caption-maker/caption-timing';
import {
  getNinePositionCoordinates,
  applyWordTransform,
  splitGraphemes,
  isDevanagari,
} from '../lib/caption-maker/text-transform';

interface GsapAnimatedCaptionsProps {
  words: TranscriptWord[];
  captionGroups: CaptionGroup[];
  style: CaptionStyle;
  width: number;
  height: number;
  speaker1Color?: string;
  speaker2Color?: string;
}

export const GsapAnimatedCaptions: React.FC<GsapAnimatedCaptionsProps> = ({
  words,
  captionGroups,
  style,
  width,
  height,
  speaker1Color,
  speaker2Color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  // Proportional typography sizing relative to 1080p width
  const scaleFactor = width / 1080;
  const fontSize = Math.round(style.fontSize * scaleFactor);
  const strokeWidth = Math.max(0, Math.round(style.strokeWidth * scaleFactor));
  const shadowBlur = Math.round((style.shadowBlur || 8) * scaleFactor);
  const paddingX = Math.round((style.backgroundPadding ?? 14) * scaleFactor);
  const paddingY = Math.round(paddingX * 0.5);

  // Container width constraint matching platform safe areas: 78% for 9:16 vertical reels (avoiding 15% right action bar)
  // and 88% for landscape/square/portrait feeds without vertical action bars.
  const isVertical916 = height > width;
  const containerWidth = Math.round(width * (isVertical916 ? 0.78 : 0.88));
  const textAlign = style.textAlign === 'custom' ? 'center' : (style.textAlign || 'center');
  const justifyAlign =
    textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';

  const primaryFontName = useMemo(() => {
    return style.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Arial';
  }, [style.fontFamily]);

  const cleanFontFamily = useMemo(() => {
    return `"${primaryFontName}", "Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", "Segoe UI", sans-serif`;
  }, [primaryFontName]);

  const googleFontUrl = useMemo(() => {
    if (!primaryFontName || ['Arial', 'Helvetica', 'Times New Roman', 'Impact', 'sans-serif'].includes(primaryFontName)) {
      return null;
    }
    return getGoogleFontUrl(primaryFontName);
  }, [primaryFontName]);

  const fontWeight =
    style.fontWeight === 'black'
      ? 900
      : style.fontWeight === 'bold'
      ? 700
      : style.fontWeight === 'semibold'
      ? 600
      : style.fontWeight === 'medium'
      ? 500
      : 400;

  // Compute text shadow / neon glow based on textEffect
  const getTextShadow = (): string => {
    const effect = style.textEffect || 'none';
    if (!effect || effect === 'none') return 'none';
    if (effect === 'neon-glow') {
      const glow = style.glowColor || style.importantColor || '#FCD905';
      const blur = shadowBlur || 12;
      return `0 0 ${Math.max(2, Math.round(blur * 0.4))}px ${glow}, 0 0 ${blur}px ${glow}, 0 0 ${Math.round(blur * 1.5)}px ${glow}`;
    }
    if (effect === 'retro-3d') {
      const offX = Math.round((style.shadowOffsetX ?? 5) * scaleFactor);
      const offY = Math.round((style.shadowOffsetY ?? 5) * scaleFactor);
      const col = style.shadowColor || '#000000';
      return `${offX}px ${offY}px 0px ${col}`;
    }
    if (effect === 'soft-ambient') {
      return `0px 2px ${shadowBlur}px ${style.shadowColor || 'rgba(0,0,0,0.6)'}`;
    }
    // drop-shadow
    const offX = Math.round((style.shadowOffsetX ?? 0) * scaleFactor);
    const offY = Math.max(1, Math.round((style.shadowOffsetY ?? shadowBlur * 0.4) * scaleFactor));
    return `${offX}px ${offY}px ${shadowBlur}px ${style.shadowColor || 'rgba(0,0,0,0.85)'}`;
  };

  // Compute background container styling (Instagram / VN style badges)
  const getBackgroundStyles = (): React.CSSProperties => {
    const bgStyle = style.backgroundStyle || 'none';
    if (bgStyle === 'none') {
      if (style.backgroundColor && style.backgroundColor !== 'transparent') {
        const rawBg = style.backgroundColor;
        const opacity = style.backgroundOpacity ?? 0.8;
        return {
          backgroundColor: hexToRgba(rawBg, opacity),
          padding: `${paddingY}px ${paddingX}px`,
          borderRadius: `${Math.round(16 * scaleFactor)}px`,
        };
      }
      return {};
    }

    const rawBg = style.backgroundColor || '#000000';
    const opacity = style.backgroundOpacity ?? 0.8;
    const bgRgba = hexToRgba(rawBg, opacity);
    const radius = Math.round((style.backgroundRadius ?? 16) * scaleFactor);

    if (bgStyle === 'solid-pill') {
      return {
        backgroundColor: bgRgba,
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${paddingY}px ${paddingX}px`,
      };
    }
    if (bgStyle === 'frosted-glass') {
      return {
        backgroundColor: bgRgba,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${paddingY}px ${paddingX}px`,
      };
    }
    if (bgStyle === 'marker-bar') {
      return {
        backgroundColor: bgRgba,
        borderRadius: `${Math.min(6, radius)}px`,
        padding: `${paddingY}px ${paddingX}px`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      };
    }
    if (bgStyle === 'outline-pill') {
      return {
        backgroundColor: hexToRgba(rawBg, opacity * 0.4),
        border: `2px solid ${style.importantColor || '#FCD905'}`,
        borderRadius: radius >= 30 ? '9999px' : `${radius}px`,
        padding: `${paddingY}px ${paddingX}px`,
      };
    }
    return {};
  };

  // Vertical & Horizontal position styling matching ASS/Preview anchors 1:1
  const coords = getNinePositionCoordinates(
    style.position,
    style.customX,
    style.customY,
    style.textAlign
  );

  const getContainerPositionStyles = (): React.CSSProperties => {
    return {
      top: coords.top,
      left: coords.left,
      transform: coords.transform,
    };
  };

  const getGroupVerticalAnchor = (): React.CSSProperties => {
    if (coords.ninePos.startsWith('bottom')) {
      return { bottom: 0 };
    }
    if (coords.ninePos.startsWith('top')) {
      return { top: 0 };
    }
    return { top: '50%', transform: 'translateY(-50%)' };
  };

  const hasDevanagari = useMemo(() => {
    return isDevanagari(words.map((w) => w.text).join(' '));
  }, [words]);

  const letterSpacing = hasDevanagari
    ? '0px'
    : `${Math.round((style.letterSpacing ?? 0) * scaleFactor)}px`;
  const lineHeight = style.lineHeight ?? 1.3;

  // Build paused GSAP master timeline deterministically
  useLayoutEffect(() => {
    if (!rootRef.current) return;

    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true });

      if (style.captionMode === 'word-by-word') {
        // Mode 1: Individual word animations
        const targetScale =
          style.highlightAnimation === 'color-change' || style.highlightAnimation === 'none'
            ? 1.0
            : Math.min(1.2, style.zoomScale ?? 1.15);

        words.forEach((w) => {
          const target = `.w-item-${w.id}`;
          const isSpeaker2 =
            w.speakerId === 'Speaker 2' ||
            w.speakerId?.toLowerCase().includes('speaker 2') ||
            (Boolean(w.speakerId) && w.speakerId !== 'Speaker 1');
          const activeColor = isSpeaker2
            ? speaker2Color || style.speaker2Color || '#06B6D4'
            : style.importantColor;
          const animPreset = style.animationPreset;
          const requestedEntryDuration = animPreset?.startsWith('letters-')
            ? 0.16
            : animPreset === 'words-slide-up'
              ? 0.22
              : animPreset === 'words-rotate-in'
                ? 0.25
                : 0.06;
          const wordWindow = getWordAnimationWindow(w.start, w.end, requestedEntryDuration, 0.06);
          const exitDuration = wordWindow.exitDuration;
          const wordDuration = wordWindow.duration;
          const letterCount = splitGraphemes(
            applyWordTransform(w.text, style.textTransform, style.uppercase, true)
          ).length;
          const charTiming = getStaggeredAnimationTiming(
            letterCount,
            Math.max(0, wordWindow.exitStart - wordWindow.start),
            Math.min(0.16, wordWindow.entryDuration),
            0.02
          );

          if (animPreset === 'words-slide-up') {
            gsap.set(target, { autoAlpha: 0, yPercent: 100, scale: targetScale, color: activeColor });
            if (wordDuration > 0) {
              tl.to(target, { autoAlpha: 1, yPercent: 0, duration: wordWindow.entryDuration, ease: 'back.out(2)' }, wordWindow.start);
              if (exitDuration > 0) tl.to(target, { autoAlpha: 0, yPercent: -40, duration: exitDuration, ease: 'power1.in' }, wordWindow.exitStart);
            }
          } else if (animPreset === 'words-rotate-in') {
            gsap.set(target, { autoAlpha: 0, rotationX: -90, transformPerspective: 1000, transformOrigin: '50% 100%', scale: targetScale, color: activeColor });
            if (wordDuration > 0) {
              tl.to(target, { autoAlpha: 1, rotationX: 0, duration: Math.min(0.25, wordWindow.entryDuration), ease: 'power2.out' }, wordWindow.start);
              if (exitDuration > 0) tl.to(target, { autoAlpha: 0, rotationX: 45, duration: exitDuration, ease: 'power1.in' }, wordWindow.exitStart);
            }
          } else if (animPreset === 'letters-slide-up') {
            gsap.set(target, { autoAlpha: 1, scale: targetScale, color: activeColor });
            const charTargets = `.w-item-${w.id} .char-item`;
            gsap.set(charTargets, { autoAlpha: 0, yPercent: 100 });
            if (wordDuration > 0) {
              tl.to(charTargets, { autoAlpha: 1, yPercent: 0, duration: charTiming.duration, ease: 'power2.out', stagger: charTiming.stagger }, wordWindow.start);
              if (exitDuration > 0) tl.to(target, { autoAlpha: 0, duration: exitDuration, ease: 'power1.in' }, wordWindow.exitStart);
            }
          } else if (animPreset === 'letters-slide-down') {
            gsap.set(target, { autoAlpha: 1, scale: targetScale, color: activeColor });
            const charTargets = `.w-item-${w.id} .char-item`;
            gsap.set(charTargets, { autoAlpha: 0, yPercent: -100 });
            if (wordDuration > 0) {
              tl.to(charTargets, { autoAlpha: 1, yPercent: 0, duration: charTiming.duration, ease: 'power2.out', stagger: charTiming.stagger }, wordWindow.start);
              if (exitDuration > 0) tl.to(target, { autoAlpha: 0, duration: exitDuration, ease: 'power1.in' }, wordWindow.exitStart);
            }
          } else {
            // Default appearance
            gsap.set(target, { autoAlpha: 0, scale: 0.85 });
            if (wordDuration > 0) {
              tl.to(target, { autoAlpha: 1, scale: targetScale, color: activeColor, duration: Math.min(0.06, wordWindow.entryDuration), ease: 'power2.out' }, wordWindow.start);
              if (exitDuration > 0) tl.to(target, { autoAlpha: 0, scale: 0.9, duration: exitDuration, ease: 'power1.in' }, wordWindow.exitStart);
            }
          }
        });
      } else {
        // Mode 2 & Mode 3: Phrase Groups with Word Highlights
        captionGroups.forEach((group, gIdx) => {
          const groupSelector = `.c-group-${gIdx}`;
          const animPreset = style.animationPreset;
          const groupDuration = Math.max(0, group.end - group.start);
          const groupWindow = getWordAnimationWindow(group.start, group.end, 0.06, 0.06);
          const availableMotionDuration = Math.max(0, groupWindow.exitStart - groupWindow.start);
          const groupCharacterCount = group.words.reduce(
            (count, word) => count + splitGraphemes(
              applyWordTransform(word.text, style.textTransform, style.uppercase, true)
            ).length,
            0
          );

          // Initially invisible
          gsap.set(groupSelector, { autoAlpha: 0 });

          // Group visible window
          if (groupWindow.duration > 0) {
            tl.to(groupSelector, { autoAlpha: 1, duration: groupWindow.entryDuration, ease: 'power2.out' }, groupWindow.start);
            if (groupWindow.exitDuration > 0) {
              tl.to(groupSelector, { autoAlpha: 0, duration: groupWindow.exitDuration, ease: 'power2.in' }, groupWindow.exitStart);
            }
          }

          // Rohaid Ali CodePen GSAP text animation effects at group.start:
          const isGsapTextMotion =
            animPreset === 'words-slide-up' ||
            animPreset === 'words-rotate-in' ||
            animPreset?.startsWith('letters-');

          if (animPreset === 'words-slide-up') {
            const wordTargets = group.words.map((w) => `.w-span-${w.id}`);
            const timing = getStaggeredAnimationTiming(
              wordTargets.length,
              availableMotionDuration,
              Math.min(0.45, groupDuration * 0.4),
              0.08
            );
            gsap.set(wordTargets, { yPercent: 100, autoAlpha: 0 });
            tl.to(
              wordTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: timing.duration,
                ease: 'back.out(2)',
                stagger: timing.stagger,
              },
              groupWindow.start
            );
          } else if (animPreset === 'words-rotate-in') {
            const wordTargets = group.words.map((w) => `.w-span-${w.id}`);
            const timing = getStaggeredAnimationTiming(
              wordTargets.length,
              availableMotionDuration,
              Math.min(0.55, groupDuration * 0.45),
              0.08
            );
            gsap.set(wordTargets, {
              rotationX: -90,
              transformPerspective: 1000,
              transformOrigin: '50% 100%',
              autoAlpha: 0,
            });
            tl.to(
              wordTargets,
              {
                rotationX: 0,
                autoAlpha: 1,
                duration: timing.duration,
                ease: 'power2.out',
                stagger: timing.stagger,
              },
              groupWindow.start
            );
          } else if (animPreset === 'letters-slide-up') {
            const charTargets = `.c-group-${gIdx} .char-item`;
            const timing = getStaggeredAnimationTiming(
              groupCharacterCount,
              availableMotionDuration,
              Math.min(0.3, groupDuration * 0.35),
              0.025
            );
            gsap.set(charTargets, { yPercent: 100, autoAlpha: 0 });
            tl.to(
              charTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: timing.duration,
                ease: 'power2.out',
                stagger: timing.stagger,
              },
              groupWindow.start
            );
          } else if (animPreset === 'letters-slide-down') {
            const charTargets = `.c-group-${gIdx} .char-item`;
            const timing = getStaggeredAnimationTiming(
              groupCharacterCount,
              availableMotionDuration,
              Math.min(0.3, groupDuration * 0.35),
              0.025
            );
            gsap.set(charTargets, { yPercent: -100, autoAlpha: 0 });
            tl.to(
              charTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: timing.duration,
                ease: 'power2.out',
                stagger: timing.stagger,
              },
              groupWindow.start
            );
          }

          // Word highlighting within group
          group.words.forEach((w, wIdx) => {
            const wordSelector = `.w-span-${w.id}`;
            // Clip malformed overlaps at the next word start. The latest word
            // owns the shared time in preview and render alike.
            const activeEndTime = group.words[wIdx + 1]
              ? Math.min(w.end, group.words[wIdx + 1].start)
              : w.end;

            const isSpeaker2 =
              w.speakerId === 'Speaker 2' ||
              w.speakerId?.toLowerCase().includes('speaker 2') ||
              (Boolean(w.speakerId) && w.speakerId !== 'Speaker 1');
            const spk2Col = speaker2Color || style.speaker2Color || '#06B6D4';
            const spk1Col = speaker1Color || style.speaker1Color || style.textColor;
            const speakerColor = isSpeaker2 ? spk2Col : spk1Col;
            const baseColor = w.isImportant ? style.importantColor : speakerColor;

            // Keep the selected caption color; intensity is represented by scale below.
            const activeColor = isSpeaker2 ? spk2Col : style.importantColor;

            const highlightAnim = style.highlightAnimation || 'pop';
            const isWordBadge = highlightAnim === 'background' || Boolean(style.activeWordBgColor && highlightAnim !== 'color-change' && highlightAnim !== 'none');
            const wordBadgeColor = style.activeWordBgColor || style.importantColor;

            // Target zoom scale: Base scale + AI Vocal Intensity punch
            let targetScale = 1.0;
            if (highlightAnim === 'pop' || highlightAnim === 'scale') {
              targetScale = style.zoomScale ?? 1.15;
            } else if (highlightAnim === 'background') {
              targetScale = 1.04;
            } else {
              targetScale = 1.0; // Flat text for color-change, none, underline!
            }

            // AI Kinetic Vocal Intensity punch
            if (w.intensity === 'punch') {
              targetScale *= 1.22;
            } else if (w.intensity === 'climax') {
              targetScale *= 1.35;
            } else if (w.intensity === 'whisper') {
              targetScale *= 0.90;
            }

            const extraMargin = targetScale > 1.0
              ? Math.round((targetScale - 1) * 0.45 * fontSize)
              : 0;

            const normalOpacity = style.textOpacity ?? 1.0;

            // Initially set base appearance
            if (!isGsapTextMotion) {
              gsap.set(wordSelector, {
                color: baseColor,
                backgroundColor: 'transparent',
                opacity: normalOpacity,
                scale: 1.0,
                marginLeft: 0,
                marginRight: 0,
              });
            } else {
              gsap.set(wordSelector, {
                color: baseColor,
                backgroundColor: 'transparent',
                scale: 1.0,
                marginLeft: 0,
                marginRight: 0,
              });
            }

            // At w.start: Pop/Punch/Glow to active state
            const targetColor = highlightAnim === 'none'
              ? baseColor
              : isWordBadge
                ? getContrastingTextColor(wordBadgeColor || '#FCD905')
                : activeColor;
            const targetBg = isWordBadge ? wordBadgeColor : 'transparent';
            const activeGlowColor = style.glowColor || style.importantColor || '#FCD905';
            const activeTextShadow = highlightAnim === 'glow'
              ? `0 0 4px ${activeGlowColor}, 0 0 12px ${activeGlowColor}, 0 0 20px ${activeGlowColor}`
              : getTextShadow();
            const activeWordWindow = getWordAnimationWindow(w.start, activeEndTime, 0.06, 0.07);
            if (activeWordWindow.duration > 0) {
              tl.to(wordSelector, {
                color: targetColor,
                backgroundColor: targetBg,
                opacity: 1.0,
                scale: targetScale,
                marginLeft: extraMargin,
                marginRight: extraMargin,
                textShadow: activeTextShadow,
                textDecoration: highlightAnim === 'underline' ? 'underline' : 'none',
                textDecorationColor: style.importantColor,
                duration: activeWordWindow.entryDuration,
                ease: targetScale > 1.0 ? 'power2.out' : 'none',
              }, activeWordWindow.start);

              if (activeWordWindow.exitDuration > 0) {
                tl.to(wordSelector, {
                  color: baseColor,
                  backgroundColor: 'transparent',
                  opacity: normalOpacity,
                  scale: 1.0,
                  marginLeft: 0,
                  marginRight: 0,
                  textShadow: getTextShadow(),
                  textDecoration: 'none',
                  duration: activeWordWindow.exitDuration,
                  ease: 'power1.inOut',
                }, activeWordWindow.exitStart);
              }
            }
          });

        });
      }

      tl.seek(currentTime);
      timelineRef.current = tl;
    }, rootRef);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionGroups, words, style, fontSize]);

  // Synchronize GSAP seek on frame update
  useLayoutEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.seek(currentTime);
    }
  }, [currentTime]);

  const baseTextStyle: React.CSSProperties = {
    fontFamily: cleanFontFamily,
    fontSize: `${fontSize}px`,
    fontWeight,
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${style.strokeColor}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: getTextShadow(),
    textAlign,
    lineHeight,
    letterSpacing,
    userSelect: 'none',
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        ...getContainerPositionStyles(),
        width: `${containerWidth}px`,
        maxWidth: `${containerWidth}px`,
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: justifyAlign,
        justifyContent: 'center',
        textAlign,
      }}
    >
      {googleFontUrl && (
        <style dangerouslySetInnerHTML={{ __html: `@import url('${googleFontUrl}');` }} />
      )}

      {style.captionMode === 'word-by-word' ? (
        // Mode 1: Individual word containers
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: `${Math.round(fontSize * 1.5)}px`,
            display: 'flex',
            justifyContent: justifyAlign,
            alignItems: 'center',
          }}
        >
          {words.map((w) => {
            const text = applyWordTransform(w.text, style.textTransform, style.uppercase, true);
            const isLetterPreset = style.animationPreset?.startsWith('letters-');
            const soloEmoji = w.emoji || getKeywordEmoji(w.text);
            const highlightAnim = style.highlightAnimation || 'pop';
            const isSoloWordBadge = highlightAnim === 'background' || Boolean(
              style.activeWordBgColor && highlightAnim !== 'color-change' && highlightAnim !== 'none'
            );
            return (
              <div
                key={w.id}
                className={`w-item-${w.id}`}
                style={{
                  ...baseTextStyle,
                  position: 'absolute',
                  top: '50%',
                  left: textAlign === 'left' ? 0 : textAlign === 'right' ? '100%' : '50%',
                  transform:
                    textAlign === 'center'
                      ? 'translate(-50%, -50%)'
                      : textAlign === 'right'
                      ? 'translate(-100%, -50%)'
                      : 'translate(0, -50%)',
                  whiteSpace: 'nowrap',
                  overflow: isLetterPreset || style.animationPreset === 'words-slide-up' ? 'hidden' : 'visible',
                  color: style.textColor,
                  ...getBackgroundStyles(),
                  ...(isSoloWordBadge ? {
                    borderRadius: `${Math.round(8 * scaleFactor)}px`,
                    paddingTop: `${Math.max(1, Math.round(2 * scaleFactor))}px`,
                    paddingBottom: `${Math.max(1, Math.round(2 * scaleFactor))}px`,
                    paddingLeft: `${Math.round(8 * scaleFactor)}px`,
                    paddingRight: `${Math.round(8 * scaleFactor)}px`,
                  } : {}),
                }}
              >
                {style.showEmojis !== false && soloEmoji && (
                  <span
                    style={{
                      position: 'absolute',
                      top: `-${Math.round(fontSize * 1.15)}px`,
                      left: '50%',
                      transform: `translate(-50%, -${getEmojiBounceOffset(currentTime, w.start)}px)`,
                      fontSize: `${Math.round(fontSize * 0.95)}px`,
                      filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))',
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {soloEmoji}
                  </span>
                )}
                {isLetterPreset ? (
                  splitGraphemes(text).map((char, cIdx) => (
                    <span
                      key={cIdx}
                      className="char-item"
                      style={{
                        display: 'inline-block',
                        willChange: 'transform, opacity',
                      }}
                    >
                      {char}
                    </span>
                  ))
                ) : (
                  text
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Mode 2 & Mode 3: Phrase Groups with Word Highlight Spans
        <div
          style={{
            position: 'relative',
            width: '100%',
            textAlign,
          }}
        >
          {captionGroups.map((group, gIdx) => {
            return (
              <div
                key={group.id}
                className={`c-group-${gIdx}`}
                style={{
                  position: 'absolute',
                  ...getGroupVerticalAnchor(),
                  left: 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: justifyAlign,
                  textAlign,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: justifyAlign,
                    columnGap: `${Math.round(fontSize * 0.32)}px`,
                    rowGap: `${Math.round(fontSize * 0.40 * Math.max(0.3, lineHeight - 0.7))}px`,
                    ...getBackgroundStyles(),
                    maxWidth: '100%',
                    textAlign,
                  }}
                >
                  {group.words.map((w, wIndex) => {
                    const isSentenceStart = wIndex === 0 || /[.!?]$/.test(group.words[wIndex - 1]?.text || '');
                    const text = applyWordTransform(w.text, style.textTransform, style.uppercase, isSentenceStart);
                    const isWordBadge =
                      style.highlightAnimation === 'background' ||
                      Boolean(
                        style.activeWordBgColor &&
                          style.highlightAnimation !== 'color-change' &&
                          style.highlightAnimation !== 'none'
                      );
                    const isLetterPreset = style.animationPreset?.startsWith('letters-');
                    const wordEmoji = w.emoji || getKeywordEmoji(w.text);
                    const isCurrent = getActiveTranscriptWordAtTime(group.words, currentTime)?.id === w.id;
                    return (
                      <span
                        key={w.id}
                        className={`w-span-${w.id}`}
                        style={{
                          ...baseTextStyle,
                          position: 'relative',
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                          transformOrigin: 'center center',
                          overflow: isLetterPreset || style.animationPreset === 'words-slide-up' ? 'hidden' : 'visible',
                          paddingTop: isLetterPreset || style.animationPreset === 'words-slide-up' ? `${Math.round(fontSize * 0.12)}px` : undefined,
                          paddingBottom: isLetterPreset || style.animationPreset === 'words-slide-up' ? `${Math.round(fontSize * 0.12)}px` : undefined,
                          marginTop: isLetterPreset || style.animationPreset === 'words-slide-up' ? `-${Math.round(fontSize * 0.12)}px` : undefined,
                          marginBottom: isLetterPreset || style.animationPreset === 'words-slide-up' ? `-${Math.round(fontSize * 0.12)}px` : undefined,
                          borderRadius: isWordBadge && isCurrent ? `${Math.round(8 * scaleFactor)}px` : undefined,
                          paddingLeft: isWordBadge && isCurrent ? `${Math.round(8 * scaleFactor)}px` : undefined,
                          paddingRight: isWordBadge && isCurrent ? `${Math.round(8 * scaleFactor)}px` : undefined,
                          willChange: 'transform, color, opacity, background-color',
                        }}
                      >
                        {style.showEmojis !== false && wordEmoji && isCurrent && (
                          <span
                            style={{
                              position: 'absolute',
                              top: `-${Math.round(fontSize * 1.05)}px`,
                              left: '50%',
                              transform: `translate(-50%, -${getEmojiBounceOffset(currentTime, w.start)}px)`,
                              fontSize: `${Math.round(fontSize * 0.9)}px`,
                              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6))',
                              lineHeight: 1,
                              userSelect: 'none',
                            }}
                          >
                            {wordEmoji}
                          </span>
                        )}
                        {isLetterPreset ? (
                          splitGraphemes(text).map((char, cIdx) => (
                            <span
                              key={cIdx}
                              className="char-item"
                              style={{
                                display: 'inline-block',
                                willChange: 'transform, opacity',
                              }}
                            >
                              {char}
                            </span>
                          ))
                        ) : (
                          text
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
