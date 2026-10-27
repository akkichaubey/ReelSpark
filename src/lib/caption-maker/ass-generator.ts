import { CaptionGroup, CaptionStyle, OutputSettings, TranscriptWord } from './types';
import { getNinePositionCoordinates, applyWordTransform } from './text-transform';
import { getContrastingTextColor } from './sample-data';
import { getCaptionTimingSegments, getWordAnimationWindow } from './caption-timing';

/**
 * Convert Hex/CSS color to ASS color format: &HBBGGRR& or &HAABBGGRR&
 */
export function hexToAssColor(hex: string, alphaHex = '00'): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length !== 6) {
    return `&H${alphaHex}FFFFFF&`; // Default white
  }

  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);

  // ASS uses Blue-Green-Red order
  return `&H${alphaHex}${b}${g}${r}&`;
}

function formatAssTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs, 2)}`;
}

function toAssMilliseconds(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

function getAssWordMotionTags(
  style: CaptionStyle,
  duration: number,
  scaleTarget: number
): string {
  if (duration <= 0) return '';
  const window = getWordAnimationWindow(0, duration, 0.22, 0.06);
  const totalMs = toAssMilliseconds(window.duration);
  const enterMs = Math.min(totalMs, toAssMilliseconds(window.entryDuration));
  const exitMs = Math.min(totalMs, toAssMilliseconds(window.exitStart));
  if (totalMs <= 0 || enterMs <= 0) return '';

  const preset = style.animationPreset;
  if (preset === 'words-slide-up' || preset === 'letters-slide-up') {
    return `\\fscy30\\t(0,${enterMs},\\fscy100)`;
  }
  if (preset === 'letters-slide-down') {
    return `\\fscy150\\t(0,${enterMs},\\fscy100)`;
  }
  if (preset === 'words-rotate-in') {
    return `\\frx-75\\t(0,${enterMs},\\frx0)`;
  }
  if (scaleTarget <= 1) return '';

  const initialScale = preset === 'pop' || preset === 'punch' || preset === 'kinetic' ? 85 : 100;
  const peakScale = Math.min(140, Math.round(scaleTarget * 100));
  let tags = `\\fscx${initialScale}\\fscy${initialScale}\\t(0,${enterMs},\\fscx${peakScale}\\fscy${peakScale})`;
  if (exitMs < totalMs) {
    tags += `\\t(${exitMs},${totalMs},\\fscx100\\fscy100)`;
  }
  return tags;
}

/**
 * Generate full ASS subtitle script for FFmpeg rendering.
 */
export function generateAssSubtitles(
  groups: CaptionGroup[],
  words: TranscriptWord[],
  style: CaptionStyle,
  output: OutputSettings
): string {
  const { width, height } = output;

  // Compute font size scaled proportionally to 1080p width
  const scaleFactor = width / 1080;
  const scaledFontSize = Math.round(style.fontSize * scaleFactor);
  const scaledStrokeWidth = (style.strokeWidth ?? 0) > 0 ? Math.max(1, Math.round(style.strokeWidth * scaleFactor)) : 0;
  const importantOutline = scaledStrokeWidth > 0 ? scaledStrokeWidth + 1 : 0;

  const primaryColorAss = hexToAssColor(style.textColor);
  const importantColorAss = hexToAssColor(style.importantColor);
  const outlineColorAss = hexToAssColor(style.strokeColor);
  const effect = style.textEffect || 'none';
  const shadowColorAss = hexToAssColor(style.shadowColor || '#000000', '80');

  const hasDevanagari = words.some((w) => /[\u0900-\u097F]/.test(w.text));
  const selectedFont = style.fontFamily?.split(',')[0].replace(/["']/g, '').trim();
  const fontFamily = selectedFont || (hasDevanagari ? 'Nirmala UI' : 'Arial');

  const boldFlag =
    style.fontWeight === 'bold' || style.fontWeight === 'black' || style.fontWeight === 'semibold'
      ? -1
      : 0;
  const scaledShadow =
    !effect || effect === 'none'
      ? 0
      : Math.max(1, Math.round((style.shadowBlur || 6) * scaleFactor * 0.35));

  // Unified 9-position anchor and coordinates
  const coords = getNinePositionCoordinates(
    style.position,
    style.customX,
    style.customY,
    style.textAlign
  );
  const alignment = coords.assAlignment;
  const posX = Math.round((coords.assXPercent / 100) * width);
  const posY = Math.round((coords.assYPercent / 100) * height);

  // Header & Styles section (Spacing: 0 is mandatory for Devanagari ligatures, otherwise style.letterSpacing)
  const spacing = hasDevanagari ? 0 : Math.round(style.letterSpacing ?? 0);

  // Platform-accurate safe margins: on 9:16 vertical reels, right margin must be 15% (~162px on 1080p)
  // to prevent long text lines from bleeding into Instagram/TikTok/Shorts like & comment action buttons.
  const isVertical916 =
    output.aspectRatio === '9:16' ||
    output.preset === 'instagram-reel' ||
    output.preset === 'facebook-reel' ||
    output.preset === 'youtube-short' ||
    output.preset === 'threads-video' ||
    (!output.aspectRatio && height > width);

  const marginL = isVertical916 ? Math.round(width * 0.08) : Math.round(width * 0.06);
  const marginR = isVertical916 ? Math.round(width * 0.15) : Math.round(width * 0.06);
  const marginV = isVertical916 ? Math.round(height * 0.08) : Math.round(height * 0.06);

  let ass = `[Script Info]
Title: AI Reel Animated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${scaledFontSize},${primaryColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},${boldFlag},0,0,0,100,100,${spacing},0,1,${scaledStrokeWidth},${scaledShadow},${alignment},${marginL},${marginR},${marginV},1
Style: Important,${fontFamily},${Math.round(scaledFontSize * 1.08)},${importantColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},-1,0,0,0,100,100,${spacing},0,1,${importantOutline},${scaledShadow},${alignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Render events based on CaptionMode
  if (style.captionMode === 'word-by-word') {
    // Mode 1: Individual word events
    for (const word of words) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;
      const text = applyWordTransform(word.text, style.textTransform, style.uppercase, true);
      const startAss = formatAssTime(word.start);
      const endAss = formatAssTime(word.end);
      // ASS timestamps have centisecond precision. Drop intervals that cannot
      // be represented instead of extending a caption beyond its speech.
      if (endAss <= startAss) continue;

      const styleName = word.isImportant ? 'Important' : 'Default';
      const isSpk2 =
        word.speakerId === 'Speaker 2' ||
        word.speakerId?.toLowerCase().includes('speaker 2') ||
        (Boolean(word.speakerId) && word.speakerId !== 'Speaker 1');
      const baseWordColor = word.isImportant
        ? importantColorAss
        : hexToAssColor(style.speaker1Color || style.textColor);
      const activeWordColor = style.highlightAnimation === 'none'
        ? baseWordColor
        : isSpk2
          ? hexToAssColor(style.speaker2Color || '#06B6D4')
          : importantColorAss;

      let animTag = `\\an${alignment}\\pos(${posX},${posY})`;
      // In solo-word mode every dialogue is the active spoken word.
      animTag += `\\c${activeWordColor}`;
      const highlightScale = style.highlightAnimation === 'background'
        ? 1.04
        : ['pop', 'scale'].includes(style.highlightAnimation)
          ? style.zoomScale ?? 1.15
          : 1;
      const intensityScale = word.intensity === 'climax' ? 1.35
        : word.intensity === 'punch' ? 1.22
          : word.intensity === 'whisper' ? 0.9 : 1;
      animTag += getAssWordMotionTags(style, word.end - word.start, highlightScale * intensityScale);

      ass += `Dialogue: 0,${startAss},${endAss},${styleName},,0,0,0,,{${animTag}}${text}\n`;
    }
  } else {
    // Mode 2 & Mode 3: Phrase group with active word highlighting
    for (const group of groups) {
      const segments = getCaptionTimingSegments(group);
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const segment = segments[segmentIndex];
        const startAss = formatAssTime(segment.start);
        const endAss = formatAssTime(segment.end);
        if (endAss <= startAss) continue;

        const lineParts = group.words.map((word, index) => {
          const isSentenceStart = index === 0 || /[.!?]$/.test(group.words[index - 1]?.text || '');
          const raw = applyWordTransform(word.text, style.textTransform, style.uppercase, isSentenceStart);
          const isSpeaker2 = word.speakerId === 'Speaker 2' || word.speakerId?.toLowerCase().includes('speaker 2') || (Boolean(word.speakerId) && word.speakerId !== 'Speaker 1');
          const speakerColor = isSpeaker2
            ? style.speaker2Color || '#06B6D4'
            : style.speaker1Color || style.textColor;
          const baseColor = word.isImportant ? style.importantColor : speakerColor;

          if (segment.activeWord?.id !== word.id) {
            const normalOpacity = style.textOpacity ?? 1;
            const alpha = Math.max(0, Math.min(255, Math.round((1 - normalOpacity) * 255)));
            const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
            return `{\\c${hexToAssColor(baseColor, alphaHex)}\\fscx100\\fscy100}${raw}`;
          }

          const highlight = style.highlightAnimation || 'pop';
          const wordBg = style.activeWordBgColor || style.importantColor;
          const isBadge = highlight === 'background' || Boolean(
            style.activeWordBgColor && highlight !== 'none' && highlight !== 'color-change'
          );
          const activeColor = highlight === 'none'
            ? baseColor
            : isBadge
              ? getContrastingTextColor(wordBg)
              : isSpeaker2
                ? style.speaker2Color || '#06B6D4'
                : style.importantColor;
          const scale = highlight === 'background' ? 1.04
            : ['pop', 'scale'].includes(highlight) ? style.zoomScale ?? 1.15 : 1;
          const intensityScale = word.intensity === 'climax' ? 1.35
            : word.intensity === 'punch' ? 1.22
              : word.intensity === 'whisper' ? 0.9 : 1;
          const currentScale = Math.min(1.4, scale * intensityScale);
          const wordWindow = getWordAnimationWindow(segment.start, segment.end, 0.06, 0.07);
          const totalMs = toAssMilliseconds(wordWindow.duration);
          const enterMs = Math.min(totalMs, toAssMilliseconds(wordWindow.entryDuration));
          const exitMs = Math.min(totalMs, toAssMilliseconds(wordWindow.exitStart - wordWindow.start));
          const targetScale = Math.round(currentScale * 100);
          let activeTags = `\\c${hexToAssColor(activeColor)}\\b1\\fscx100\\fscy100`;
          if (targetScale !== 100 && totalMs > 0 && enterMs > 0) {
            activeTags += `\\t(0,${enterMs},\\fscx${targetScale}\\fscy${targetScale})`;
            if (exitMs < totalMs) activeTags += `\\t(${exitMs},${totalMs},\\fscx100\\fscy100)`;
          }
          return `{${activeTags}}${raw}{\\b0}`;
        });

        // Apply the phrase entrance once. Replaying it on every active-word
        // segment made slide/rotate presets restart on each word in FFmpeg.
        let groupMotionTag = '';
        if (segmentIndex === 0) {
          const motionWindow = getWordAnimationWindow(group.start, group.end, 0.12, 0);
          const motionMs = toAssMilliseconds(motionWindow.entryDuration);
          if (motionMs > 0 && style.animationPreset === 'words-rotate-in') {
            groupMotionTag = `\\frx-65\\t(0,${motionMs},\\frx0)`;
          } else if (motionMs > 0 && (style.animationPreset === 'words-slide-up' || style.animationPreset === 'letters-slide-up')) {
            groupMotionTag = `\\fscy30\\t(0,${motionMs},\\fscy100)`;
          } else if (motionMs > 0 && style.animationPreset === 'letters-slide-down') {
            groupMotionTag = `\\fscy140\\t(0,${motionMs},\\fscy100)`;
          }
        }
        ass += `Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,{\\an${alignment}\\pos(${posX},${posY})${groupMotionTag}}${lineParts.join(' ')}\n`;
      }
    }
  }

  return ass;
}
