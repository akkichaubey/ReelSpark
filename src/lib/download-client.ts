import { generateSrtForClip } from './srt';
import { TranscriptSegment } from './types';

/**
 * Triggers a browser file download from a URL.
 */
export function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Generates relative-synced SRT content and prompts immediate browser download.
 */
export function downloadSrtDirectly(
  transcript: TranscriptSegment[],
  start: number,
  end: number,
  baseFilename: string
) {
  const srtContent = generateSrtForClip(transcript, start, end);
  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = `${baseFilename.replace(/[^a-zA-Z0-9_-]/g, '_')}.srt`;
  triggerBrowserDownload(url, safeName);
  URL.revokeObjectURL(url);
}
