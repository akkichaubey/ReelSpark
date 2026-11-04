import type { CaptionProject, ThumbnailSettings } from './types';
import { renderThumbnailToCanvas } from './thumbnail-presets';
import { loadGoogleFontInDocument } from './google-fonts';

export const THUMBNAIL_COVER_SECONDS = 0.01;

/** One encoded frame is the minimum at normal export frame rates. No pre-roll. */
export function thumbnailCoverFrameSeconds(fps: number) {
  return 1 / (Number.isFinite(fps) && fps > 0 ? fps : 30);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => { image.src = ''; reject(new Error('Thumbnail image timed out.')); }, 10000);
    image.crossOrigin = 'anonymous';
    image.onload = () => { window.clearTimeout(timeout); resolve(image); };
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Thumbnail image could not be loaded.')); };
    image.src = url;
  });
}

/** Shared by the preview, separate downloads and video export: no stale render poster. */
export async function createThumbnailCoverDataUrl(project: Pick<CaptionProject, 'thumbnailCover' | 'image' | 'outputSettings'>, settings: ThumbnailSettings, format: 'png' | 'jpeg' = 'png') {
  const canvas = document.createElement('canvas');
  if (project.thumbnailCover?.customBgUrl) {
    const image = await loadImage(project.thumbnailCover.customBgUrl);
    canvas.width = project.outputSettings.width;
    canvas.height = project.outputSettings.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thumbnail canvas is unavailable.');
    context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  } else {
    await new Promise<void>(resolve => {
      const timeout = window.setTimeout(resolve, 3000);
      loadGoogleFontInDocument(settings.fontFamily || 'Montserrat', () => { window.clearTimeout(timeout); resolve(); });
    });
    const isVideo = project.image?.mediaType === 'video' || /\.(mp4|mov|webm|mkv|avi)(?:\?|$)/i.test(project.image?.fileName || project.image?.fileUrl || '');
    const source = settings.customBgUrl || (!isVideo ? project.image?.fileUrl : undefined);
    const background = source ? await loadImage(source) : null;
    await renderThumbnailToCanvas(canvas, settings, background, project.image);
  }
  return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
}
