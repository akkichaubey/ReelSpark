import { ClipCandidate, Project } from '../types';
import { CaptionProject, TranscriptWord } from './types';
import { detectImportantWords } from './important-words';
import { groupTranscriptWords } from './caption-grouping';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from './sample-data';

export interface ClipAudioOverride {
  audioUrl: string;
  storagePath?: string;
  duration?: number;
  fileSize?: number;
  fileName?: string;
}

/**
 * Convert a ClipCandidate from the Clip Finder into a full CaptionProject
 * ready for the AI Reel Caption Video Maker.
 *
 * Slices word timestamps and audio references to precisely align with the selected clip's
 * start and end times, rather than using full original video audio.
 */
export function createCaptionProjectFromClip(
  candidate: ClipCandidate,
  activeProject?: Project | null,
  preferredLanguage: 'hi' | 'en' = 'en',
  audioOverride?: ClipAudioOverride
): CaptionProject {
  // Select best transcript text based on preferred language or available fields
  let text = candidate.transcript;
  if (preferredLanguage === 'hi' && candidate.transcriptHindi) {
    text = candidate.transcriptHindi;
  } else if (preferredLanguage === 'en' && candidate.transcriptEnglish) {
    text = candidate.transcriptEnglish;
  }

  // Duration in seconds
  const duration = Math.max(
    3,
    audioOverride?.duration || candidate.duration || (candidate.end - candidate.start) || 15
  );

  // Fallback clean text
  const cleanText = text || candidate.title || 'Inspirational Reel';

  // Words alignment: prioritize matching segments from activeProject.transcript
  // mapped relative to the clip's start boundary (t = 0.00 at clip start)
  let rawWords: TranscriptWord[] = [];
  const matchingSegments = (activeProject?.transcript || []).filter(
    (seg) => seg.end > candidate.start && seg.start < candidate.end
  );

  if (matchingSegments.length > 0) {
    const collectedWords: TranscriptWord[] = [];
    matchingSegments.forEach((seg, sIdx) => {
      const segText = seg.text.trim();
      const tokens = segText.split(/\s+/).filter((t) => t.length > 0);
      if (tokens.length === 0) return;

      const segRelStart = Math.max(0, seg.start - candidate.start);
      const segRelEnd = Math.min(duration, seg.end - candidate.start);
      const segDur = Math.max(0.2, segRelEnd - segRelStart);
      const wDur = segDur / tokens.length;

      tokens.forEach((token, wIdx) => {
        const wStart = Number((segRelStart + wIdx * wDur).toFixed(2));
        const wEnd = Number(Math.min(duration, segRelStart + (wIdx + 0.85) * wDur).toFixed(2));
        collectedWords.push({
          id: `w_${sIdx}_${wIdx}_${Date.now().toString(36)}`,
          text: token,
          start: wStart,
          end: Math.max(wStart + 0.1, wEnd),
        });
      });
    });

    if (collectedWords.length > 0) {
      rawWords = collectedWords;
    }
  }

  // Fallback word timestamp generation across duration
  if (rawWords.length === 0) {
    const rawWordTokens = cleanText
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    const wordCount = Math.max(1, rawWordTokens.length);
    const timePerWord = duration / wordCount;

    rawWords = rawWordTokens.map((token, idx) => {
      const start = Number((idx * timePerWord).toFixed(2));
      const end = Number((Math.min(duration, (idx + 0.85) * timePerWord)).toFixed(2));
      return {
        id: `w_${idx + 1}_${Date.now().toString(36)}`,
        text: token,
        start,
        end: Math.max(start + 0.1, end),
      };
    });
  }

  // Automatically detect emotional, motivational, and high-impact words
  const wordsWithImportance = detectImportantWords(rawWords);
  const captionGroups = groupTranscriptWords(wordsWithImportance, 4);

  // Audio asset resolution for the specific clip
  const clipSafeId = candidate.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  let audioUrl = '/sample-audio.mp3';
  let storagePath: string | undefined = undefined;
  let fileName = `${clipSafeId}_audio.mp3`;
  let fileSize = Math.round(duration * 24000);

  if (audioOverride?.audioUrl) {
    audioUrl = audioOverride.audioUrl;
    storagePath = audioOverride.storagePath;
    fileName = audioOverride.fileName || fileName;
    fileSize = audioOverride.fileSize || fileSize;
  } else if (candidate.renderedVideoPath) {
    // If the candidate clip has already been rendered to an isolated MP4, use its sliced media
    const rel =
      candidate.renderedVideoPath.split('storage/')[1] ||
      candidate.renderedVideoPath.split('storage\\')[1];
    if (rel) {
      audioUrl = `/api/files/${rel.replace(/\\/g, '/')}`;
      storagePath = candidate.renderedVideoPath;
      fileName = `${clipSafeId}.mp4`;
    }
  } else if (activeProject?.id) {
    // Route to clip-audio endpoint which slices the original audio specifically for this clip
    audioUrl = `/api/projects/${activeProject.id}/clip-audio?clipId=${candidate.id}`;
    storagePath = `storage/projects/${activeProject.id}/clips/${clipSafeId}_audio.mp3`;
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
      fileName,
      fileUrl: audioUrl,
      storagePath,
      fileSize,
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
