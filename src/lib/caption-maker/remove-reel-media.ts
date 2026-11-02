import type { CaptionProject } from "./types";
import { deleteTimelineClips, timelineFromProject } from "../timeline/model";

/** Remove reel references only. Shared source files remain available to Undo and other reels. */
export function removeReelMedia(project: CaptionProject, assetId: string): CaptionProject {
  const timeline = timelineFromProject(project);
  const edited = deleteTimelineClips(timeline, timeline.clips.filter(clip => clip.assetId === assetId).map(clip => clip.id));
  const removingVoice = project.audio?.id === assetId;
  return {
    ...project,
    image: project.image?.id === assetId ? undefined : project.image,
    mediaAssets: project.mediaAssets?.filter(asset => asset.id !== assetId),
    audio: removingVoice ? undefined : project.audio,
    bgMusic: project.bgMusic?.id === assetId ? undefined : project.bgMusic,
    ...(removingVoice ? {
      transcript: [], captionGroups: [], sfxCues: [], syncedSegments: undefined,
      rawTranscriptHindi: undefined, rawTranscriptEnglish: undefined, rawTranscriptHinglish: undefined,
      audioAnalysis: undefined, fillerSegments: undefined,
    } : {}),
    timeline: { ...edited, assets: edited.assets.filter(asset => asset.id !== assetId) },
    trimRange: undefined,
    renderedVideoUrl: undefined, renderedVideoPath: undefined, renderedSrtUrl: undefined, renderedSrtPath: undefined,
    updatedAt: new Date().toISOString(),
  };
}
