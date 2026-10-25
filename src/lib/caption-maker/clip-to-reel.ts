import { ClipCandidate, Project } from '../types';
import { CaptionProject, SyncedPhraseSegment, TranscriptWord } from './types';
import { detectImportantWords } from './important-words';
import { groupTranscriptWords } from './caption-grouping';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from './sample-data';
import { devanagariToHinglish, enrichWordsWithEmojis } from './hinglish-and-emoji';
import { matchExactWordTimings } from './word-timing';

export interface ClipAudioOverride {
  audioUrl: string;
  storagePath?: string;
  duration?: number;
  fileSize?: number;
  fileName?: string;
  syncedSegments?: SyncedPhraseSegment[];
  rawTranscriptHindi?: string;
  rawTranscriptEnglish?: string;
  rawTranscriptHinglish?: string;
  titleHindi?: string;
  titleEnglish?: string;
  titleHinglish?: string;
  isAudioSynced?: boolean;
}

/**
 * Convert phrase-locked bilingual segments into word-level TranscriptWord[]
 * weighted by word character length and locked to exact speech segment boundaries.
 */
export function buildWordsFromSyncedSegments(
  segments: SyncedPhraseSegment[],
  lang: 'hi' | 'en' | 'hinglish'
): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let wordIdx = 1;

  for (const seg of segments) {
    let rawPhrase = '';
    if (lang === 'hi') {
      rawPhrase = seg.textHindi || seg.textEnglish || '';
    } else if (lang === 'hinglish') {
      rawPhrase =
        seg.textHinglish ||
        (seg.textHindi ? devanagariToHinglish(seg.textHindi) : seg.textEnglish || '');
    } else {
      rawPhrase = seg.textEnglish || seg.textHindi || '';
    }
    const tokens = rawPhrase
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    const exactTimings = matchExactWordTimings(tokens, seg.wordTimings, lang, seg.wordTimingLanguage);
    if (exactTimings) {
      for (let i = 0; i < tokens.length; i += 1) {
        words.push({
          id: `w_${wordIdx++}_${Date.now().toString(36)}`,
          text: tokens[i],
          start: exactTimings[i].start,
          end: exactTimings[i].end,
          speakerId: seg.speakerId,
          intensity: seg.intensity,
          timingSource: 'model-word-level',
        });
      }
      continue;
    }

    const segStart = Math.max(0, Number(seg.start) || 0);
    const segEnd = Math.max(segStart + 0.15, Number(seg.end) || segStart + 1.2);
    const segDur = segEnd - segStart;

    const weights = tokens.map((t) => {
      const cleanLen = Math.max(2, t.replace(/[.,?!।"'—-]/g, '').length);
      const hasMidPause = /[,;:]/.test(t.slice(-1)) ? 1.5 : 0;
      return Math.pow(cleanLen, 0.75) + hasMidPause;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || tokens.length;

    let cursor = segStart;
    for (let i = 0; i < tokens.length; i++) {
      const isLast = i === tokens.length - 1;
      const tokenDur = (weights[i] / totalWeight) * segDur;
      const wStart = Number(cursor.toFixed(2));
      const nextCursor = isLast ? segEnd : cursor + tokenDur;
      const hasPunctGap = !isLast && /[.!?।,;:]/.test(tokens[i].slice(-1));
      const rawEnd = hasPunctGap ? nextCursor - Math.min(0.08, tokenDur * 0.2) : nextCursor;
      const wEnd = Number(Math.min(segEnd, Math.max(wStart + 0.05, rawEnd)).toFixed(2));
      words.push({
        id: `w_${wordIdx++}_${Date.now().toString(36)}`,
        text: tokens[i],
        start: wStart,
        end: wEnd,
        speakerId: seg.speakerId,
        intensity: seg.intensity,
        timingSource: seg.wordTimings?.length ? 'phrase-estimated' : undefined,
      });
      cursor = nextCursor;
    }
  }

  return enrichWordsWithEmojis(detectImportantWords(words));
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
  preferredLanguage: 'hi' | 'en' | 'hinglish' = 'en',
  audioOverride?: ClipAudioOverride
): CaptionProject {
  const resolvedTranscriptHindi =
    audioOverride?.rawTranscriptHindi || candidate.transcriptHindi || candidate.transcript;
  const resolvedTranscriptEnglish =
    audioOverride?.rawTranscriptEnglish || candidate.transcriptEnglish || candidate.transcript;
  const resolvedTranscriptHinglish =
    audioOverride?.rawTranscriptHinglish ||
    (resolvedTranscriptHindi ? devanagariToHinglish(resolvedTranscriptHindi) : resolvedTranscriptEnglish);

  // Select best transcript text based on preferred language or available fields
  let text = candidate.transcript;
  if (preferredLanguage === 'hi') {
    text = resolvedTranscriptHindi;
  } else if (preferredLanguage === 'hinglish') {
    text = resolvedTranscriptHinglish;
  } else if (preferredLanguage === 'en') {
    text = resolvedTranscriptEnglish;
  }

  // Duration in seconds
  const duration = Math.max(
    3,
    audioOverride?.duration || candidate.duration || (candidate.end - candidate.start) || 15
  );

  // Exact clean text matching what user sees on the Clip Card
  const cleanText = (text || candidate.title || 'Inspirational Reel').trim();

  let wordsWithImportance: TranscriptWord[] = [];
  const syncedSegments = audioOverride?.syncedSegments;

  if (syncedSegments && syncedSegments.length > 0) {
    wordsWithImportance = buildWordsFromSyncedSegments(syncedSegments, preferredLanguage);
  } else {
    // Tokenize cleanText into words so every single word is 100% identical to the clip transcript
    const cleanWordTokens = cleanText
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    const wordCount = Math.max(1, cleanWordTokens.length);

    // Active speech range from Whisper/Gemini segments relative to clip boundary
    const matchingSegments = (activeProject?.transcript || []).filter(
      (seg) => seg.end > candidate.start && seg.start < candidate.end
    );

    let relSpeechStart = 0;
    let relSpeechEnd = duration;

    if (matchingSegments.length > 0) {
      relSpeechStart = Math.max(0, matchingSegments[0].start - candidate.start);
      relSpeechEnd = Math.min(duration, matchingSegments[matchingSegments.length - 1].end - candidate.start);
      if (relSpeechEnd <= relSpeechStart) {
        relSpeechStart = 0;
        relSpeechEnd = duration;
      }
    }

    const speechDuration = Math.max(0.5, relSpeechEnd - relSpeechStart);
    const timePerWord = speechDuration / wordCount;

    // Words constructed strictly from cleanWordTokens with precise timing
    const rawWords: TranscriptWord[] = cleanWordTokens.map((token, idx) => {
      const wStart = Number((relSpeechStart + idx * timePerWord).toFixed(2));
      const wEnd = Number(Math.min(duration, relSpeechStart + (idx + 0.85) * timePerWord).toFixed(2));
      return {
        id: `w_${idx + 1}_${Date.now().toString(36)}`,
        text: token,
        start: wStart,
        end: Math.max(wStart + 0.1, wEnd),
      };
    });

    wordsWithImportance = enrichWordsWithEmojis(detectImportantWords(rawWords));
  }

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
      const baseName = candidate.renderedVideoPath.split(/[/\\]/).pop();
      fileName = baseName || `${clipSafeId}.mp4`;
    }
  } else if (activeProject?.id) {
    // Route to clip-audio endpoint which slices the original audio specifically for this clip
    audioUrl = `/api/projects/${activeProject.id}/clip-audio?clipId=${candidate.id}`;
    storagePath = `storage/projects/${activeProject.id}/clips/${clipSafeId}_audio.mp3`;
  }

  const resolvedTitleHindi = audioOverride?.titleHindi || candidate.titleHindi || candidate.title;
  const resolvedTitleEnglish = audioOverride?.titleEnglish || candidate.titleEnglish || candidate.title;
  const resolvedTitleHinglish =
    audioOverride?.titleHinglish || (resolvedTitleHindi ? devanagariToHinglish(resolvedTitleHindi) : candidate.title);
  const selectedTitle =
    preferredLanguage === 'hi'
      ? resolvedTitleHindi
      : preferredLanguage === 'hinglish'
      ? resolvedTitleHinglish
      : resolvedTitleEnglish;

  return {
    id: `reel_${candidate.id}_${Date.now()}`,
    title: selectedTitle || 'Viral Reel Caption',
    rawTranscriptHindi: resolvedTranscriptHindi,
    rawTranscriptEnglish: resolvedTranscriptEnglish,
    rawTranscriptHinglish: resolvedTranscriptHinglish,
    preferredLanguage,
    sourceClipId: candidate.id,
    syncedSegments,
    isAudioSynced: Boolean(audioOverride?.isAudioSynced || (syncedSegments && syncedSegments.length > 0)),
    syncVersion: syncedSegments && syncedSegments.length > 0
      ? syncedSegments.some((segment) => segment.wordTimings?.length) ? 5 : 4
      : undefined,
    wordTimingSource: syncedSegments?.some((segment) => segment.wordTimings?.length)
      ? 'model-word-level'
      : syncedSegments?.length ? 'phrase-estimated' : undefined,
    wordTimingLanguage: syncedSegments?.find((segment) => segment.wordTimings?.length)?.wordTimingLanguage,
    image: undefined,
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

/**
 * Switch a CaptionProject between Hindi, English, and Hinglish transcripts
 * while preserving styling, audio, images, and exact phrase timestamps.
 */
export function switchProjectLanguage(
  project: CaptionProject,
  newLang: 'en' | 'hi' | 'hinglish'
): CaptionProject {
  if (project.syncedSegments && project.syncedSegments.length > 0) {
    const wordsWithImportance = buildWordsFromSyncedSegments(project.syncedSegments, newLang);
    const captionGroups = groupTranscriptWords(wordsWithImportance, 4);
    return {
      ...project,
      preferredLanguage: newLang,
      transcript: wordsWithImportance,
      captionGroups,
      updatedAt: new Date().toISOString(),
    };
  }

  let targetText = '';
  if (newLang === 'hi') {
    targetText = project.rawTranscriptHindi || project.transcript.map((w) => w.text).join(' ');
  } else if (newLang === 'hinglish') {
    targetText =
      project.rawTranscriptHinglish ||
      (project.rawTranscriptHindi
        ? devanagariToHinglish(project.rawTranscriptHindi)
        : project.transcript.map((w) => w.text).join(' '));
  } else {
    targetText = project.rawTranscriptEnglish || project.transcript.map((w) => w.text).join(' ');
  }

  if (!targetText) {
    return {
      ...project,
      preferredLanguage: newLang,
      updatedAt: new Date().toISOString(),
    };
  }

  const duration = Math.max(3, project.audio?.duration || 15);
  const cleanTokens = targetText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const wordCount = Math.max(1, cleanTokens.length);

  let relSpeechStart = 0;
  let relSpeechEnd = duration;
  if (project.transcript && project.transcript.length > 0) {
    relSpeechStart = project.transcript[0].start;
    relSpeechEnd = project.transcript[project.transcript.length - 1].end;
  }
  const speechDuration = Math.max(0.5, relSpeechEnd - relSpeechStart);
  const timePerWord = speechDuration / wordCount;

  const rawWords: TranscriptWord[] = cleanTokens.map((token, idx) => {
    const wStart = Number((relSpeechStart + idx * timePerWord).toFixed(2));
    const wEnd = Number(Math.min(duration, relSpeechStart + (idx + 0.85) * timePerWord).toFixed(2));
    return {
      id: `w_${idx + 1}_${Date.now().toString(36)}`,
      text: token,
      start: wStart,
      end: Math.max(wStart + 0.1, wEnd),
    };
  });

  const wordsWithImportance = enrichWordsWithEmojis(detectImportantWords(rawWords));
  const captionGroups = groupTranscriptWords(wordsWithImportance, 4);

  return {
    ...project,
    preferredLanguage: newLang,
    transcript: wordsWithImportance,
    captionGroups,
    updatedAt: new Date().toISOString(),
  };
}


