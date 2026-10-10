import { ClipCandidate, Project } from '../types';
import { CaptionProject, TranscriptWord } from './types';
import { detectImportantWords } from './important-words';
import { groupTranscriptWords } from './caption-grouping';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from './sample-data';

/**
 * Convert a ClipCandidate from the Clip Finder into a full CaptionProject
 * ready for the AI Reel Caption Video Maker.
 */
export function createCaptionProjectFromClip(
  candidate: ClipCandidate,
  activeProject?: Project | null,
  preferredLanguage: 'hi' | 'en' = 'en'
): CaptionProject {
  // Select best transcript text based on preferred language or available fields
  let text = candidate.transcript;
  if (preferredLanguage === 'hi' && candidate.transcriptHindi) {
    text = candidate.transcriptHindi;
  } else if (preferredLanguage === 'en' && candidate.transcriptEnglish) {
    text = candidate.transcriptEnglish;
  }

  // Fallback clean text
  const cleanText = text || candidate.title || 'Inspirational Reel';
  const rawWordTokens = cleanText
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const duration = Math.max(
    3,
    candidate.duration || (candidate.end - candidate.start) || 15
  );

  const wordCount = Math.max(1, rawWordTokens.length);
  const timePerWord = duration / wordCount;

  // Generate word-level timestamps across the duration of the clip
  const rawWords: TranscriptWord[] = rawWordTokens.map((token, idx) => {
    const start = Number((idx * timePerWord).toFixed(2));
    const end = Number((Math.min(duration, (idx + 0.85) * timePerWord)).toFixed(2));
    return {
      id: `w_${idx + 1}_${Date.now().toString(36)}`,
      text: token,
      start,
      end: Math.max(start + 0.1, end),
    };
  });

  // Automatically detect emotional, motivational, and high-impact words
  const wordsWithImportance = detectImportantWords(rawWords);
  const captionGroups = groupTranscriptWords(wordsWithImportance, 4);

  // Audio asset resolution
  let audioUrl = '/sample-audio.mp3';

  if (candidate.renderedVideoPath) {
    const rel =
      candidate.renderedVideoPath.split('storage/')[1] ||
      candidate.renderedVideoPath.split('storage\\')[1];
    if (rel) {
      audioUrl = `/api/files/${rel.replace(/\\/g, '/')}`;
    }
  } else if (activeProject?.localVideoPath) {
    const rel =
      activeProject.localVideoPath.split('storage/')[1] ||
      activeProject.localVideoPath.split('storage\\')[1];
    if (rel) {
      audioUrl = `/api/files/${rel.replace(/\\/g, '/')}`;
    }
  }

  const selectedTitle =
    preferredLanguage === 'hi' && candidate.titleHindi
      ? candidate.titleHindi
      : candidate.title;

  return {
    id: `reel_${candidate.id}_${Date.now()}`,
    title: selectedTitle || 'Viral Reel Caption',
    image: {
      id: 'default_img',
      fileName: 'sample-image.jpg',
      fileUrl: '/sample-image.jpg',
      width: 1080,
      height: 1920,
      fileSize: 12000,
      format: 'image/jpeg',
      fitMode: 'cover',
    },
    audio: {
      id: `audio_${candidate.id}`,
      fileName: 'clip-audio.mp3',
      fileUrl: audioUrl,
      fileSize: Math.round(duration * 16000),
      duration,
      format: 'audio/mp3',
    },
    transcript: wordsWithImportance,
    captionGroups,
    captionStyle: {
      ...DEFAULT_CAPTION_STYLE,
      captionMode: 'phrase-highlight',
      animationPreset: 'punch',
      highlightAnimation: 'pop',
    },
    outputSettings: {
      ...DEFAULT_OUTPUT_SETTINGS,
      preset: 'instagram-reel',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
