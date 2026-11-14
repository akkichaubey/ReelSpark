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
 * Reliably downloads a file in modern browsers using Blob URL or attachment endpoint.
 */
export async function downloadFileReliably(fileUrl: string, filename: string): Promise<boolean> {
  if (!fileUrl) return false;
  const safeFilename = filename.replace(/["\r\n]/g, '').trim();
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return true;
  } catch (err) {
    console.warn('Blob download fallback to direct attachment URL:', err);
    const separator = fileUrl.includes('?') ? '&' : '?';
    const downloadUrl = `${fileUrl}${separator}download=1&filename=${encodeURIComponent(safeFilename)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
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
