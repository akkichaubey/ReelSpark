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
  const scaledStrokeWidth = Math.max(1, Math.round(style.strokeWidth * scaleFactor));

  const primaryColorAss = hexToAssColor(style.textColor);
  const importantColorAss = hexToAssColor(style.importantColor);
  const outlineColorAss = hexToAssColor(style.strokeColor);
  const shadowColorAss = hexToAssColor(style.shadowColor || '#000000', '80');

  // Alignment: 2 = bottom-center, 5 = middle-center, 8 = top-center
  let alignment = 2;
  let posX = Math.round(width / 2);
  let posY = Math.round(height * 0.8); // default bottom

  if (style.position === 'top') {
    alignment = 8;
    posY = Math.round(height * 0.18);
  } else if (style.position === 'center') {
    alignment = 5;
    posY = Math.round(height * 0.5);
  } else if (style.position === 'custom' && style.customX !== undefined && style.customY !== undefined) {
    alignment = 5;
    posX = Math.round((style.customX / 100) * width);
    posY = Math.round((style.customY / 100) * height);
  }

  const fontFamily = style.fontFamily || 'Arial';
  const boldFlag = style.fontWeight === 'bold' || style.fontWeight === 'black' ? -1 : 0;

  // Header & Styles section
  let ass = `[Script Info]
Title: AI Reel Animated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${scaledFontSize},${primaryColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},${boldFlag},0,0,0,100,100,1,0,1,${scaledStrokeWidth},2,${alignment},40,40,60,1
Style: Important,${fontFamily},${Math.round(scaledFontSize * 1.08)},${importantColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},-1,0,0,0,105,105,1,0,1,${scaledStrokeWidth + 1},3,${alignment},40,40,60,1

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

      // Kinetic punch on important word or pop animation
      let animTag = `\\pos(${posX},${posY})\\k${Math.max(1, Math.round((word.end - word.start) * 100))}`;
      if (style.animationPreset === 'pop' || style.animationPreset === 'punch') {
        animTag += `\\t(0,70,\\fscx118\\fscy118)\\t(70,140,\\fscx100\\fscy100)`;
      } else if (style.animationPreset === 'kinetic') {
        animTag += `\\t(0,50,\\fscx125\\fscy125)\\t(50,120,\\fscx100\\fscy100)`;
      }

      ass += `Dialogue: 0,${startAss},${endAss},${styleName},,0,0,0,,{${animTag}}${text}\n`;
    }
  } else {
    // Mode 2 & Mode 3: Phrase group with word highlighting
    for (const group of groups) {
      for (let wIdx = 0; wIdx < group.words.length; wIdx++) {
        const activeWord = group.words[wIdx];
        const nextWord = group.words[wIdx + 1];

        const startAss = formatAssTime(activeWord.start);
        const endAss = formatAssTime(
          nextWord ? nextWord.start : Math.max(activeWord.end, group.end)
        );

        // Build formatted line: active word has highlight styling
        const lineParts = group.words.map((w, i) => {
          const raw = style.uppercase ? w.text.toUpperCase() : w.text;
          const isCurrent = i === wIdx;
          const durationCs = Math.max(1, Math.round((w.end - w.start) * 100));

          if (isCurrent) {
            const wordColor = w.isImportant ? importantColorAss : primaryColorAss;
            let effect = `\\k${durationCs}\\c${wordColor}\\b1`;
            if (style.animationPreset === 'pop' || style.animationPreset === 'punch') {
              effect += `\\fscx112\\fscy112`;
            }
            return `{${effect}}${raw}{\\r}`;
          } else {
            const dimColor = hexToAssColor(style.textColor, '40'); // semi-dim non-active words
            return `{\\k${durationCs}\\c${dimColor}}${raw}{\\r}`;
          }
        });

        const dialogueText = lineParts.join(' ');
        ass += `Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,{\\pos(${posX},${posY})}${dialogueText}\n`;
      }
    }
  }

  return ass;
}
