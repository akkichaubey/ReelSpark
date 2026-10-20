import { CaptionGroup, CaptionStyle, OutputSettings, TranscriptWord } from './types';
import { getNinePositionCoordinates, applyWordTransform } from './text-transform';

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
      const text = applyWordTransform(word.text, style.textTransform, style.uppercase, true);
      const startAss = formatAssTime(word.start);
      const endAss = formatAssTime(Math.max(word.start + 0.15, word.end));

      const styleName = word.isImportant ? 'Important' : 'Default';

      let animTag = `\\an${alignment}\\pos(${posX},${posY})`;
      if (style.highlightAnimation !== 'color-change' && style.highlightAnimation !== 'none') {
        const peakScale = Math.min(125, Math.round((style.zoomScale ?? 1.15) * 100));
        if (style.animationPreset === 'pop') {
          animTag += `\\fscx85\\fscy85\\t(0,70,\\fscx${peakScale}\\fscy${peakScale})\\t(70,140,\\fscx100\\fscy100)`;
        } else if (style.animationPreset === 'punch' || style.animationPreset === 'kinetic') {
          animTag += `\\fscx${peakScale}\\fscy${peakScale}\\t(0,80,\\fscx100\\fscy100)`;
        } else if (style.animationPreset === 'words-rotate-in') {
          animTag += `\\frx-75\\t(0,120,\\frx0)`;
        } else if (style.animationPreset === 'words-slide-up' || style.animationPreset === 'letters-slide-up') {
          animTag += `\\fscy30\\t(0,90,\\fscy100)`;
        } else if (style.animationPreset === 'letters-slide-down') {
          animTag += `\\fscy150\\t(0,90,\\fscy100)`;
        }
      }

      ass += `Dialogue: 0,${startAss},${endAss},${styleName},,0,0,0,,{${animTag}}${text}\n`;
    }
  } else {
    // Mode 2 & Mode 3: Phrase group with active word highlighting
    for (const group of groups) {
      for (let wIdx = 0; wIdx < group.words.length; wIdx++) {
        const activeWord = group.words[wIdx];
        const nextWord = group.words[wIdx + 1];

        const startAss = formatAssTime(activeWord.start);
        const endAss = formatAssTime(
          nextWord ? nextWord.start : Math.max(activeWord.end, group.end)
        );

        let activeScale = 100;
        const highlightAnim = style.highlightAnimation || 'pop';
        if (highlightAnim === 'pop') {
          activeScale = Math.round((style.zoomScale ?? 1.15) * 100);
        } else if (highlightAnim === 'background') {
          activeScale = 104;
        } else {
          activeScale = 100; // Strictly flat normal text for color-change, none, underline
        }

        // Build formatted line: active word has highlight styling without \\k tags
        const lineParts = group.words.map((w, i) => {
          const isSentenceStart = i === 0 || /[.!?]$/.test(group.words[i - 1]?.text || '');
          const raw = applyWordTransform(w.text, style.textTransform, style.uppercase, isSentenceStart);
          const isCurrent = i === wIdx;

          const isSpk2 = w.speakerId === 'Speaker 2' || w.speakerId?.toLowerCase().includes('speaker 2') || (Boolean(w.speakerId) && w.speakerId !== 'Speaker 1');
          const spk2Hex = style.speaker2Color || '#06B6D4';
          const spk1Hex = style.speaker1Color || style.textColor;

          if (isCurrent) {
            let activeWordColor = importantColorAss;
            let currentScale = activeScale;

            if (w.intensity === 'punch') currentScale = Math.round(currentScale * 1.22);
            else if (w.intensity === 'climax') {
              currentScale = Math.round(currentScale * 1.35);
              activeWordColor = hexToAssColor('#FF3366');
            } else if (w.intensity === 'whisper') {
              currentScale = Math.round(currentScale * 0.90);
            }

            if (isSpk2 && w.intensity !== 'climax') {
              activeWordColor = hexToAssColor(spk2Hex);
            }

            const scaleTag = currentScale !== 100 ? `\\fscx${currentScale}\\fscy${currentScale}` : '';
            const resetScale = currentScale !== 100 ? `\\fscx100\\fscy100` : '';
            return `{\\c${activeWordColor}\\b1${scaleTag}}${raw}{${resetScale}\\b0}`;
          } else {
            const normalOpacity = style.textOpacity ?? 1.0;
            const normalAlphaVal = Math.max(0, Math.min(255, Math.round((1 - normalOpacity) * 255)));
            const normalAlphaHex = normalAlphaVal.toString(16).padStart(2, '0').toUpperCase();
            const baseHex = w.isImportant ? style.importantColor : isSpk2 ? spk2Hex : spk1Hex;
            const dimColor = hexToAssColor(baseHex, normalAlphaHex);
            return `{\\c${dimColor}\\fscx100\\fscy100}${raw}`;
          }
        });

        const dialogueText = lineParts.join(' ');
        let groupMotionTag = '';
        if (style.animationPreset === 'words-rotate-in') {
          groupMotionTag = '\\frx-65\\t(0,120,\\frx0)';
        } else if (style.animationPreset === 'words-slide-up' || style.animationPreset === 'letters-slide-up') {
          groupMotionTag = '\\fscy30\\t(0,90,\\fscy100)';
        } else if (style.animationPreset === 'letters-slide-down') {
          groupMotionTag = '\\fscy140\\t(0,90,\\fscy100)';
        }
        ass += `Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,{\\an${alignment}\\pos(${posX},${posY})${groupMotionTag}}${dialogueText}\n`;
      }
    }
  }

  return ass;
}
