import type { AudioAsset, CaptionProject } from './types';

/** Apply this choice atomically with the voice upload, before transcription starts. */
export function voiceVideoBackgroundUpdates(project: CaptionProject, audio: AudioAsset, useVideo = false): Pick<CaptionProject, 'image' | 'mediaAssets'> | Record<string, never> {
  const video = audio.sourceType === 'video' && audio.sourceVideo?.mediaType === 'video' ? audio.sourceVideo : undefined;
  if (!useVideo || !video) return {};
  const image = { ...video, muteSourceAudio: true, fitMode: video.fitMode || 'cover' as const, position: video.position || 'center' as const, scale: video.scale ?? 100 };
  return {
    image,
    mediaAssets: [...new Map([
      ...(project.mediaAssets || []).map(asset => [asset.id, asset] as const),
      ...(project.image ? [[project.image.id, project.image] as const] : []),
      [image.id, image] as const,
    ]).values()],
  };
}
