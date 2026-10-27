import fs from 'node:fs/promises';
import { resolveStoragePath } from '../storage';
import { canReadMedia } from '../media-access';
import { restorePrivateMedia } from '../cloudflare/private-media';
import { probeVideo } from '../ffmpeg';
import { createEmptyCaptionProject } from '../caption-maker/sample-data';
import type { CaptionProject } from '../caption-maker/types';

/** Import an already-completed Studio video through the same library retention pipeline. */
export async function projectFromCompletedExport(
  owner: string,
  sourceUrl: string,
  title: string,
  origin: string
): Promise<CaptionProject> {
  const url = new URL(sourceUrl, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/files/'))
    throw new Error('Invalid exported media URL');
  const source = resolveStoragePath(decodeURIComponent(url.pathname.slice(11)));
  if (!(await canReadMedia(owner, source))) {
    if (
      !(await restorePrivateMedia(owner, source)) ||
      !(await canReadMedia(owner, source))
    )
      throw new Error('Export unavailable to this account');
  }
  const metadata = await probeVideo(source);
  if (!metadata.width || !metadata.height)
    throw new Error('Invalid video export');
  const project = createEmptyCaptionProject();
  const fileSize = (await fs.stat(source)).size;
  project.title = title.trim().slice(0, 300) || 'Saved video export';
  project.image = {
    id: 'export_video',
    fileUrl: url.pathname,
    fileName: project.title,
    fileSize,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    mediaType: 'video',
    duration: metadata.duration,
    fitMode: 'contain',
    position: 'center',
    scale: 100,
    muteSourceAudio: metadata.hasAudio,
  };
  if (metadata.hasAudio)
    project.audio = {
      id: 'export_audio',
      fileUrl: url.pathname,
      fileName: project.title,
      fileSize,
      duration: metadata.duration,
      format: metadata.format,
      sourceType: 'video',
    };
  project.renderedVideoUrl = url.pathname;
  const ratio = metadata.width / metadata.height;
  const aspectRatio = (
    [
      ['9:16', 9 / 16],
      ['4:5', 4 / 5],
      ['1:1', 1],
      ['16:9', 16 / 9],
    ] as const
  ).reduce((best, candidate) =>
    Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio)
      ? candidate
      : best
  )[0];
  project.outputSettings = {
    ...project.outputSettings,
    width: metadata.width,
    height: metadata.height,
    aspectRatio,
    fps: Math.min(60, Math.max(12, Math.round(metadata.fps || 30))),
  };
  return project;
}
