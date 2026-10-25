import path from 'node:path';
import fs from 'node:fs/promises';
import { APP_CONFIG } from '../config';
import { assertSafePath } from '../storage';
import { canReadMedia } from '../media-access';
import { restorePrivateMedia } from '../cloudflare/private-media';
import { probeVideo } from '../ffmpeg';

export async function resolvePublishingMedia(userId: string, relativePath: string, kind: 'video' | 'image' = 'video') {
  if (!userId || typeof relativePath !== 'string' || path.isAbsolute(relativePath) || /^[a-z]:|^[/\\]|[?#\0]/i.test(relativePath)) {
    throw new Error('Select an owned media file using its relative storage path.');
  }
  const candidate = assertSafePath(path.resolve(APP_CONFIG.storageRoot, relativePath), APP_CONFIG.storageRoot);
  const extensions = kind === 'video' ? ['.mp4', '.mov', '.webm'] : ['.png', '.jpg', '.jpeg', '.webp'];
  if (!extensions.includes(path.extname(candidate).toLowerCase())) throw new Error('Unsupported publishing media type.');
  if (!(await canReadMedia(userId, candidate))) await restorePrivateMedia(userId, candidate);
  if (!(await canReadMedia(userId, candidate))) throw new Error('Publishing media not found or not owned by this account.');
  const real = assertSafePath(await fs.realpath(candidate), await fs.realpath(APP_CONFIG.storageRoot));
  if (!(await fs.stat(real)).isFile()) throw new Error('Select a media file.');
  return real;
}

export async function probePublishingVideo(userId: string, relativePath: string) {
  const absolutePath = await resolvePublishingMedia(userId, relativePath);
  const metadata = await probeVideo(absolutePath);
  if (!metadata.videoCodec || !Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.width <= 0 || metadata.height <= 0) {
    throw new Error('The selected file does not contain a valid video stream.');
  }
  return { durationSeconds: metadata.duration, width: metadata.width, height: metadata.height,
    fileSizeBytes: (await fs.stat(absolutePath)).size, aspectRatio: metadata.aspectRatio };
}
