import { SubtitleStyle, TranscriptSegment } from './types';

/**
 * Format seconds into SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds % 1) * 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

/**
 * Format seconds into ASS subtitle format: H:MM:SS.cc (centiseconds)
 */
export function formatAssTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const cs = Math.floor(((safeSeconds % 1) * 100));

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${hrs}:${pad(mins)}:${pad(secs)}.${pad(cs, 2)}`;
}

/**
 * Split long sentence into readable multi-line subtitle blocks (max words per line).
 */
export function breakTextIntoSubtitleLines(text: string, maxWordsPerLine = 7): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWordsPerLine) return text;

  const lines: string[] = [];
  let currentLine: string[] = [];

  for (const word of words) {
    currentLine.push(word);
    if (currentLine.length >= maxWordsPerLine) {
      lines.push(currentLine.join(' '));
      currentLine = [];
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }

  return lines.join('\n');
}

/**
 * Generate synchronized SRT content for a clip.
 * Critical: Re-synchronizes timestamps to start at 00:00:00 relative to the clip start.
 */
export function generateSrtForClip(
  fullTranscript: TranscriptSegment[],
  clipStart: number,
  clipEnd: number
): string {
  // Filter segments that overlap with [clipStart, clipEnd]
  const relevant = fullTranscript.filter(seg => seg.end > clipStart && seg.start < clipEnd);

  if (relevant.length === 0) {
    // If no exact segment found, output a fallback entry
    return `1\n00:00:00,000 --> ${formatSrtTimestamp(clipEnd - clipStart)}\n[Spoken Audio]\n\n`;
  }

  const srtEntries: string[] = [];
  let index = 1;

  for (const seg of relevant) {
    // Relative offset to clip start
    const segStartRel = Math.max(0, seg.start - clipStart);
    const segEndRel = Math.min(clipEnd - clipStart, Math.max(segStartRel + 0.3, seg.end - clipStart));

    if (segEndRel > segStartRel) {
      const formattedText = breakTextIntoSubtitleLines(seg.text.trim());
      srtEntries.push(`${index}\n${formatSrtTimestamp(segStartRel)} --> ${formatSrtTimestamp(segEndRel)}\n${formattedText}\n`);
      index++;
    }
  }

  return srtEntries.join('\n');
}

/**
 * Generate full source video SRT content with absolute timestamps.
 */
export function generateFullSourceSrt(transcript: TranscriptSegment[]): string {
  const srtEntries: string[] = [];
  let index = 1;

  for (const seg of transcript) {
    if (seg.end > seg.start) {
      const formattedText = breakTextIntoSubtitleLines(seg.text.trim());
      srtEntries.push(`${index}\n${formatSrtTimestamp(seg.start)} --> ${formatSrtTimestamp(seg.end)}\n${formattedText}\n`);
      index++;
    }
  }

  return srtEntries.join('\n');
}

/**
 * Generate Advanced SubStation Alpha (.ass) file content for burned-in subtitles.
 * Provides custom styling, font size, bold outline, color, and vertical alignment.
 */
export function generateAssForClip(
  fullTranscript: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
  style: SubtitleStyle,
  videoWidth = 1080,
  videoHeight = 1920
): string {
  const relevant = fullTranscript.filter(seg => seg.end > clipStart && seg.start < clipEnd);

  // Convert hex color #RRGGBB to ASS &HBBGGRR&
  const hexToAssColor = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
      const r = clean.substring(0, 2);
      const g = clean.substring(2, 4);
      const b = clean.substring(4, 6);
      return `&H00${b}${g}${r}&`;
    }
    return '&H00FFFFFF&';
  };

  const primaryColor = hexToAssColor(style.fontColor);
  const outlineColor = hexToAssColor(style.outlineColor);
  
  // Alignment in ASS: 2 = Bottom-Center, 5 = Middle-Center, 8 = Top-Center
  let alignment = 2;
  let marginV = 80;
  if (style.verticalPosition === 'middle') {
    alignment = 5;
    marginV = 0;
  } else if (style.verticalPosition === 'top') {
    alignment = 8;
    marginV = 80;
  }

  const assHeader = `[Script Info]
Title: AI Clip Studio Subtitles
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${style.fontSize || 48},${primaryColor},&H000000FF&,${outlineColor},&H80000000&,-1,0,0,0,100,100,0,0,1,${style.outlineWidth || 3},1,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  for (const seg of relevant) {
    const segStartRel = Math.max(0, seg.start - clipStart);
    const segEndRel = Math.min(clipEnd - clipStart, Math.max(segStartRel + 0.3, seg.end - clipStart));

    if (segEndRel > segStartRel) {
      // In ASS, \N is line break
      const text = seg.text.trim().replace(/\n/g, '\\N');
      dialogueLines.push(
        `Dialogue: 0,${formatAssTimestamp(segStartRel)},${formatAssTimestamp(segEndRel)},Default,,0,0,0,,{\\b1}${text}{\\b0}`
      );
    }
  }

  return assHeader + dialogueLines.join('\n') + '\n';
}
