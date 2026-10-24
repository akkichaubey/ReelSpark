import type { CaptionProject } from './types';
import { createDefaultCaptionProject, SAMPLE_TRANSCRIPT_WORDS } from './sample-data';

/** Remove only the unchanged bundled demo, never an uploaded or edited reel. */
export function cleanBundledSampleProject(project: CaptionProject): CaptionProject {
  const original = createDefaultCaptionProject();
  for (const field of ['rawTranscriptHindi', 'rawTranscriptEnglish', 'rawTranscriptHinglish'] as const) {
    if (project[field] && project[field] !== original[field]) return project;
  }
  const cover = project.thumbnailSettings;
  if (cover && (!['', 'CREATE VIRAL REELS IN SECONDS', 'CREATE VIRAL REELS'].includes(cover.title) ||
      !['', 'Hook viewers in the first 3 seconds', 'Step-by-step masterclass with AI subtitles'].includes(cover.subtitle || '') ||
      !['', 'MUST WATCH'].includes(cover.badgeText || '') || cover.brandingText)) return project;
  if (project.title !== 'Motivational Reel Captions' || project.sourceClipId ||
      project.audio?.id !== 'default_audio' || project.audio.fileUrl !== '/sample-audio.mp3' ||
      (project.image && project.image.fileUrl !== '/sample-image.jpg') ||
      project.transcript?.length !== SAMPLE_TRANSCRIPT_WORDS.length ||
      !project.transcript.every((word, index) => word.text === SAMPLE_TRANSCRIPT_WORDS[index].text &&
        word.start === SAMPLE_TRANSCRIPT_WORDS[index].start && word.end === SAMPLE_TRANSCRIPT_WORDS[index].end &&
        word.isImportant === SAMPLE_TRANSCRIPT_WORDS[index].isImportant)) {
    return project;
  }
  return {
    ...project,
    title: 'Untitled Reel',
    audio: undefined,
    image: undefined,
    transcript: [],
    captionGroups: [],
    syncedSegments: undefined,
    rawTranscriptHindi: '',
    rawTranscriptEnglish: '',
    rawTranscriptHinglish: '',
    isAudioSynced: false,
    captionStyle: { ...project.captionStyle, showSafeArea: false },
    thumbnailSettings: project.thumbnailSettings ? {
      ...project.thumbnailSettings,
      title: '',
      subtitle: '',
      badgeText: '',
      badgeEnabled: false,
      showSafeArea: false,
    } : undefined,
  };
}
