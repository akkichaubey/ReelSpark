import { CaptionGroup, CaptionStyle, OutputSettings, TranscriptWord } from './types';

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

  // Alignment: 1=BL, 2=BC, 3=BR; 4=ML, 5=MC, 6=MR; 7=TL, 8=TC, 9=TR
  let alignment = 2;
  const isCustomX = style.textAlign === 'custom';
  const alignCol = style.textAlign === 'left' ? 1 : style.textAlign === 'right' ? 3 : 2;

  let posX = isCustomX
    ? Math.round(((style.customX ?? 50) / 100) * width)
    : style.textAlign === 'left'
    ? Math.round(width * 0.08)
    : style.textAlign === 'right'
    ? Math.round(width * 0.92)
    : Math.round(width / 2);

  let posY = Math.round(height * 0.82); // default bottom

  if (style.position === 'top') {
    alignment = style.textAlign === 'left' ? 7 : style.textAlign === 'right' ? 9 : 8;
    posY = Math.round(height * 0.18);
  } else if (style.position === 'center') {
    alignment = style.textAlign === 'left' ? 4 : style.textAlign === 'right' ? 6 : 5;
    posY = Math.round(height * 0.5);
  } else if (style.position === 'custom') {
    alignment = style.textAlign === 'left' ? 4 : style.textAlign === 'right' ? 6 : 5;
    posX = Math.round(((style.customX ?? 50) / 100) * width);
    posY = Math.round(((style.customY ?? 20) / 100) * height);
  } else {
    alignment = alignCol;
  }

  // Header & Styles section (Spacing: 0 is mandatory for Devanagari ligatures, otherwise style.letterSpacing)
  const spacing = hasDevanagari ? 0 : Math.round(style.letterSpacing ?? 0);
  let ass = `[Script Info]
Title: AI Reel Animated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${scaledFontSize},${primaryColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},${boldFlag},0,0,0,100,100,${spacing},0,1,${scaledStrokeWidth},${scaledShadow},${alignment},40,40,60,1
Style: Important,${fontFamily},${Math.round(scaledFontSize * 1.08)},${importantColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},-1,0,0,0,100,100,${spacing},0,1,${importantOutline},${scaledShadow},${alignment},40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Render events based on CaptionMode
  if (style.captionMode === 'word-by-word') {
    // Mode 1: Individual word events
    for (const word of words) {
      const text = style.uppercase ? word.text.toUpperCase() : word.text;
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
          const raw = style.uppercase ? w.text.toUpperCase() : w.text;
          const isCurrent = i === wIdx;

          if (isCurrent) {
            const wordColor = importantColorAss;
            const scaleTag = activeScale !== 100 ? `\\fscx${activeScale}\\fscy${activeScale}` : '';
            const resetScale = activeScale !== 100 ? `\\fscx100\\fscy100` : '';
            return `{\\c${wordColor}\\b1${scaleTag}}${raw}{${resetScale}\\b0}`;
          } else {
            const normalOpacity = style.textOpacity ?? 1.0;
            const normalAlphaVal = Math.max(0, Math.min(255, Math.round((1 - normalOpacity) * 255)));
            const normalAlphaHex = normalAlphaVal.toString(16).padStart(2, '0').toUpperCase();
            const dimColor = w.isImportant
              ? hexToAssColor(style.importantColor, normalAlphaHex)
              : hexToAssColor(style.textColor, normalAlphaHex);
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
