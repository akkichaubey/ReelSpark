import { createCaptionProjectFromClip } from '../caption-maker/clip-to-reel';
import type {
  AudioAsset,
  ImageAsset,
  SyncedPhraseSegment,
} from '../caption-maker/types';
import type { ClipCandidate, Project } from '../types';
import type { SavedReel } from './types';

/** Use the existing media bridge: a successful save must include real sliced media, never sample fallbacks. */
export async function saveAnalysisCandidate(
  project: Project,
  candidate: ClipCandidate,
  lang: 'en' | 'hi',
  request: typeof fetch = fetch
): Promise<SavedReel> {
  if (!project.localVideoPath)
    throw new Error('Restore the source media before saving this clip.');
  const response = await request('/api/clipping-studio/bridge-caption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clipId: candidate.id,
      clipName: candidate.customTitle || candidate.title,
      startMs: Math.round(candidate.start * 1000),
      endMs: Math.round(candidate.end * 1000),
      sourcePath: project.localVideoPath,
      sourceProjectId: project.id,
      hasVideo: Boolean(
        project.videoMetadata?.width && project.videoMetadata?.height
      ),
    }),
  });
  const media = (await response.json()) as {
    success?: boolean;
    error?: string;
    audio?: AudioAsset;
    video?: ImageAsset;
    syncedSegments?: SyncedPhraseSegment[];
  };
  if (!response.ok || !media.success || !media.audio)
    throw new Error(
      media.error || 'Clip media preparation failed; nothing was saved.'
    );
  if (project.videoMetadata?.width && !media.video)
    throw new Error('The clip video could not be prepared; nothing was saved.');
  const captionProject = createCaptionProjectFromClip(
    candidate,
    project,
    lang,
    {
      audioUrl: media.audio.fileUrl,
      storagePath: media.audio.storagePath,
      duration: media.audio.duration,
      fileSize: media.audio.fileSize,
      fileName: media.audio.fileName,
      syncedSegments: media.syncedSegments,
    }
  );
  captionProject.audio = media.audio;
  captionProject.image = media.video
    ? { ...media.video, muteSourceAudio: true }
    : undefined;
  const result = await request('/api/saved-reels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: captionProject,
      originProjectId: project.id,
      originProjectName: project.title,
    }),
  });
  const data = await result.json();
  if (!result.ok || !data.success || !data.reel)
    throw new Error(data.error || 'Could not save reel');
  return data.reel;
}
