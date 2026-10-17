import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import gsap from 'gsap';
import { CaptionGroup, CaptionStyle, TranscriptWord } from '../lib/caption-maker/types';
import { hexToRgba } from '../lib/caption-maker/sample-data';
import { getGoogleFontUrl } from '../lib/caption-maker/google-fonts';
import { getKeywordEmoji } from '../lib/caption-maker/hinglish-and-emoji';

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

  // Container width constraint matching preview (88% of canvas width)
  const containerWidth = Math.round(width * 0.88);
  const textAlign = style.textAlign === 'custom' ? 'center' : (style.textAlign || 'center');
  const justifyAlign =
    textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';

  const primaryFontName = useMemo(() => {
    return style.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Arial';
  }, [style.fontFamily]);

  const cleanFontFamily = useMemo(() => {
    return `"${primaryFontName}", "Nirmala UI", "Segoe UI", sans-serif`;
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
  const getContainerPositionStyles = (): React.CSSProperties => {
    const isCustomX = style.textAlign === 'custom' || style.position === 'custom';
    const posX = isCustomX ? `${style.customX ?? 50}%` : '50%';

    if (style.position === 'top') {
      return { top: '18%', left: posX, transform: 'translateX(-50%)' };
    }
    if (style.position === 'center') {
      return { top: '50%', left: posX, transform: 'translate(-50%, -50%)' };
    }
    if (style.position === 'bottom') {
      return { top: '82%', left: posX, transform: 'translateX(-50%)' };
    }
    return {
      top: `${style.customY ?? 20}%`,
      left: posX,
      transform: 'translate(-50%, -50%)',
    };
  };

  const getGroupVerticalAnchor = (): React.CSSProperties => {
    if (style.position === 'bottom') {
      return { bottom: 0 };
    }
    if (style.position === 'top') {
      return { top: 0 };
    }
    return { top: '50%', transform: 'translateY(-50%)' };
  };

  const letterSpacing = `${Math.round((style.letterSpacing ?? 0) * scaleFactor)}px`;
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
          const activeColor = style.importantColor;
          const animPreset = style.animationPreset;
          const exitTime = Math.max(w.start + 0.15, w.end);

          if (animPreset === 'words-slide-up') {
            gsap.set(target, { autoAlpha: 0, yPercent: 100, scale: targetScale, color: activeColor });
            tl.to(target, { autoAlpha: 1, yPercent: 0, duration: 0.22, ease: 'back.out(2)' }, w.start);
            tl.to(target, { autoAlpha: 0, yPercent: -40, duration: 0.06, ease: 'power1.in' }, exitTime);
          } else if (animPreset === 'words-rotate-in') {
            gsap.set(target, { autoAlpha: 0, rotationX: -90, transformPerspective: 1000, transformOrigin: '50% 100%', scale: targetScale, color: activeColor });
            tl.to(target, { autoAlpha: 1, rotationX: 0, duration: 0.25, ease: 'power2.out' }, w.start);
            tl.to(target, { autoAlpha: 0, rotationX: 45, duration: 0.06, ease: 'power1.in' }, exitTime);
          } else if (animPreset === 'letters-slide-up') {
            gsap.set(target, { autoAlpha: 1, scale: targetScale, color: activeColor });
            const charTargets = `.w-item-${w.id} .char-item`;
            gsap.set(charTargets, { autoAlpha: 0, yPercent: 100 });
            tl.to(charTargets, { autoAlpha: 1, yPercent: 0, duration: 0.16, ease: 'power2.out', stagger: 0.02 }, w.start);
            tl.to(target, { autoAlpha: 0, duration: 0.05, ease: 'power1.in' }, exitTime);
          } else if (animPreset === 'letters-slide-down') {
            gsap.set(target, { autoAlpha: 1, scale: targetScale, color: activeColor });
            const charTargets = `.w-item-${w.id} .char-item`;
            gsap.set(charTargets, { autoAlpha: 0, yPercent: -100 });
            tl.to(charTargets, { autoAlpha: 1, yPercent: 0, duration: 0.16, ease: 'power2.out', stagger: 0.02 }, w.start);
            tl.to(target, { autoAlpha: 0, duration: 0.05, ease: 'power1.in' }, exitTime);
          } else {
            // Default appearance
            gsap.set(target, { autoAlpha: 0, scale: 0.85 });
            tl.to(target, { autoAlpha: 1, scale: targetScale, color: activeColor, duration: 0.06, ease: 'power2.out' }, w.start);
            tl.to(target, { autoAlpha: 0, scale: 0.9, duration: 0.05, ease: 'power1.in' }, exitTime);
          }
        });
      } else {
        // Mode 2 & Mode 3: Phrase Groups with Word Highlights
        captionGroups.forEach((group, gIdx) => {
          const groupSelector = `.c-group-${gIdx}`;
          const animPreset = style.animationPreset;
          const groupDuration = group.end - group.start;

          // Initially invisible
          gsap.set(groupSelector, { autoAlpha: 0 });

          // Group visible window
          tl.to(groupSelector, { autoAlpha: 1, duration: 0.06, ease: 'power2.out' }, group.start);

          // Rohaid Ali CodePen GSAP text animation effects at group.start:
          const isGsapTextMotion =
            animPreset === 'words-slide-up' ||
            animPreset === 'words-rotate-in' ||
            animPreset?.startsWith('letters-');

          if (animPreset === 'words-slide-up') {
            const wordTargets = group.words.map((w) => `.w-span-${w.id}`);
            const dur = Math.min(0.45, groupDuration * 0.4);
            gsap.set(wordTargets, { yPercent: 100, autoAlpha: 0 });
            tl.to(
              wordTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: dur,
                ease: 'back.out(2)',
                stagger: 0.08,
              },
              group.start
            );
          } else if (animPreset === 'words-rotate-in') {
            const wordTargets = group.words.map((w) => `.w-span-${w.id}`);
            const dur = Math.min(0.55, groupDuration * 0.45);
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
                duration: dur,
                ease: 'power2.out',
                stagger: 0.08,
              },
              group.start
            );
          } else if (animPreset === 'letters-slide-up') {
            const charTargets = `.c-group-${gIdx} .char-item`;
            const dur = Math.min(0.3, groupDuration * 0.35);
            gsap.set(charTargets, { yPercent: 100, autoAlpha: 0 });
            tl.to(
              charTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: dur,
                ease: 'power2.out',
                stagger: 0.025,
              },
              group.start
            );
          } else if (animPreset === 'letters-slide-down') {
            const charTargets = `.c-group-${gIdx} .char-item`;
            const dur = Math.min(0.3, groupDuration * 0.35);
            gsap.set(charTargets, { yPercent: -100, autoAlpha: 0 });
            tl.to(
              charTargets,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: dur,
                ease: 'power2.out',
                stagger: 0.025,
              },
              group.start
            );
          }

          // Word highlighting within group
          group.words.forEach((w, wIdx) => {
            const wordSelector = `.w-span-${w.id}`;
            const nextWord = group.words[wIdx + 1];
            const activeEndTime = nextWord ? nextWord.start : Math.max(w.end, group.end);

            const isSpeaker2 =
              w.speakerId === 'Speaker 2' ||
              w.speakerId?.toLowerCase().includes('speaker 2') ||
              (Boolean(w.speakerId) && w.speakerId !== 'Speaker 1');
            const spk2Col = speaker2Color || style.speaker2Color || '#06B6D4';
            const spk1Col = speaker1Color || style.speaker1Color || style.textColor;
            const speakerColor = isSpeaker2 ? spk2Col : spk1Col;
            const baseColor = w.isImportant ? style.importantColor : speakerColor;

            let activeColor = style.importantColor;
            if (w.intensity === 'climax') {
              activeColor = '#FF3366';
            } else if (isSpeaker2) {
              activeColor = spk2Col;
            }

            const highlightAnim = style.highlightAnimation || 'pop';
            const isWordBadge = highlightAnim === 'background' || Boolean(style.activeWordBgColor && highlightAnim !== 'color-change' && highlightAnim !== 'none');
            const wordBadgeColor = style.activeWordBgColor || style.importantColor;

            // Target zoom scale: Base scale + AI Vocal Intensity punch
            let targetScale = 1.0;
            if (highlightAnim === 'pop') {
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
            const targetColor = isWordBadge ? '#000000' : activeColor;
            const targetBg = isWordBadge ? wordBadgeColor : 'transparent';

            tl.to(wordSelector, {
              color: targetColor,
              backgroundColor: targetBg,
              opacity: 1.0,
              scale: targetScale,
              marginLeft: extraMargin,
              marginRight: extraMargin,
              duration: 0.06,
              ease: targetScale > 1.0 ? 'power2.out' : 'none',
            }, w.start);

            // At activeEndTime: Revert to dimmed inactive state
            tl.to(wordSelector, {
              color: baseColor,
              backgroundColor: 'transparent',
              opacity: normalOpacity,
              scale: 1.0,
              marginLeft: 0,
              marginRight: 0,
              duration: 0.07,
              ease: 'power1.inOut',
            }, activeEndTime);
          });

          // Group fades out at group.end
          tl.to(groupSelector, { autoAlpha: 0, duration: 0.06, ease: 'power2.in' }, group.end);
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
            const text = style.uppercase ? w.text.toUpperCase() : w.text;
            const isLetterPreset = style.animationPreset?.startsWith('letters-');
            const soloEmoji = w.emoji || getKeywordEmoji(w.text);
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
                }}
              >
                {style.showEmojis !== false && soloEmoji && (
                  <span
                    style={{
                      position: 'absolute',
                      top: `-${Math.round(fontSize * 1.15)}px`,
                      left: '50%',
                      transform: 'translateX(-50%)',
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
                  text.split('').map((char, cIdx) => (
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
                  {group.words.map((w) => {
                    const text = style.uppercase ? w.text.toUpperCase() : w.text;
                    const isWordBadge = style.highlightAnimation === 'background' || Boolean(style.activeWordBgColor);
                    const isLetterPreset = style.animationPreset?.startsWith('letters-');
                    const wordEmoji = w.emoji || getKeywordEmoji(w.text);
                    const isCurrent = currentTime >= w.start && currentTime <= w.end;
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
                          borderRadius: isWordBadge ? `${Math.round(8 * scaleFactor)}px` : undefined,
                          padding: isWordBadge ? `${Math.round(2 * scaleFactor)}px ${Math.round(8 * scaleFactor)}px` : undefined,
                          willChange: 'transform, color, opacity, background-color',
                        }}
                      >
                        {style.showEmojis !== false && wordEmoji && isCurrent && (
                          <span
                            style={{
                              position: 'absolute',
                              top: `-${Math.round(fontSize * 1.05)}px`,
                              left: '50%',
                              transform: 'translateX(-50%)',
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
                          text.split('').map((char, cIdx) => (
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
