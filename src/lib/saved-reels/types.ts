import type { CaptionProject } from '../caption-maker/types';

export interface SavedReel {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  originProjectName?: string;
  originProjectId?: string;
  project: CaptionProject;
}

export function reelDuration(project: CaptionProject): number {
  return project.trimRange
    ? Math.max(0, project.trimRange.end - project.trimRange.start)
    : project.audio?.duration || project.image?.duration || 0;
}

export function reelPlayback(project: CaptionProject): {
  url?: string;
  rendered: boolean;
  start: number;
  end: number;
} {
  const rendered = Boolean(project.renderedVideoUrl);
  return {
    url:
      project.renderedVideoUrl ||
      (project.image?.mediaType === 'video'
        ? project.image.fileUrl
        : project.audio?.fileUrl),
    rendered,
    start: rendered ? 0 : project.trimRange?.start || 0,
    end: rendered
      ? reelDuration(project)
      : project.trimRange?.end ||
        project.audio?.duration ||
        project.image?.duration ||
        0,
  };
}
