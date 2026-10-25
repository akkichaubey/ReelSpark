import path from 'path';

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const MEDIA_EXTENSIONS = {
  image: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  video: new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']),
  audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']),
};

export function validateUpload(file: { name: string; size?: number }, kinds: Array<keyof typeof MEDIA_EXTENSIONS>): string | null {
  if (file.size === 0) return 'The uploaded file is empty.';
  if (file.size !== undefined && file.size > MAX_UPLOAD_BYTES) {
    return `Files larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB are not supported.`;
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!kinds.some((kind) => MEDIA_EXTENSIONS[kind].has(extension))) {
    return 'This file type is not supported for the selected upload.';
  }
  return null;
}

/** Reject malformed or excessive render payloads before FFmpeg/Remotion work begins. */
export function validateCaptionRenderRequest(body: Record<string, unknown>): string | null {
  const settings = body.outputSettings as Record<string, unknown> | undefined;
  const style = body.captionStyle as Record<string, unknown> | undefined;
  if (!settings || !style) return 'Caption style and output settings are required.';

  const width = Number(settings.width);
  const height = Number(settings.height);
  const fps = Number(settings.fps);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 320 || width > 3840 || height > 3840) {
    return 'Output dimensions must be between 320 and 3840 pixels.';
  }
  if (!Number.isFinite(fps) || fps < 12 || fps > 60) return 'Output FPS must be between 12 and 60.';
  if (Array.isArray(body.transcript) && body.transcript.length > 10_000) return 'A render can contain at most 10,000 caption words.';
  if (Array.isArray(body.captionGroups) && body.captionGroups.length > 3_000) return 'A render can contain at most 3,000 caption groups.';
  return null;
}
