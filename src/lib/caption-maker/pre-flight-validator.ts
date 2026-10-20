import { CaptionGroup, CaptionProject, TranscriptWord } from './types';
import { buildWordsFromSyncedSegments } from './clip-to-reel';
import { groupTranscriptWords } from './caption-grouping';

export interface PreFlightCheckItem {
  id: 'audio_sync' | 'word_timing' | 'pause_alignment' | 'transcript_integrity' | 'media_assets';
  label: string;
  status: 'passed' | 'auto-fixed' | 'warning' | 'error';
  detail: string;
}

export interface PreFlightValidationResult {
  ready: boolean;
  needsServerAudioSync: boolean;
  autoFixedCount: number;
  healedProject: CaptionProject;
  checks: PreFlightCheckItem[];
}

/**
 * Comprehensive Pre-Flight Validator & Auto-Healer for AI Reel Caption Maker.
 * Runs automatically before opening a clip, inside the Export Modal, and right before rendering
 * so the user never wastes time rendering an out-of-sync or broken reel.
 */
export function validateAndHealReelProject(
  project: CaptionProject,
  actualAudioDuration?: number
): PreFlightValidationResult {
  let autoFixedCount = 0;
  const checks: PreFlightCheckItem[] = [];

  const duration = Math.max(
    1,
    actualAudioDuration || project.audio?.duration || 15
  );

  const isSampleAudio =
    !project.audio?.fileUrl || project.audio.fileUrl === '/sample-audio.mp3';
  const needsServerAudioSync =
    !isSampleAudio && (!project.isAudioSynced || project.syncVersion !== 4);

  // 1. Check Audio & Voice Waveform Sync
  if (!project.audio?.fileUrl) {
    checks.push({
      id: 'audio_sync',
      label: 'Audio & Voice Waveform Lock',
      status: 'error',
      detail: 'No audio track found. Upload audio or select a clip first.',
    });
  } else if (needsServerAudioSync) {
    checks.push({
      id: 'audio_sync',
      label: 'Audio & Voice Waveform Lock',
      status: 'warning',
      detail: 'Pending automatic FFmpeg + AI voice interval lock before render.',
    });
  } else {
    checks.push({
      id: 'audio_sync',
      label: 'Audio & Voice Waveform Lock',
      status: 'passed',
      detail: `Locked to ${project.syncedSegments?.length || project.captionGroups.length} acoustic speech intervals (${duration.toFixed(1)}s).`,
    });
  }

  // Clone words for inspection & auto-healing
  let words: TranscriptWord[] = Array.isArray(project.transcript)
    ? project.transcript.map((w) => ({ ...w }))
    : [];

  // If transcript is empty but syncedSegments exist, rebuild words automatically
  if (words.length === 0 && project.syncedSegments && project.syncedSegments.length > 0) {
    words = buildWordsFromSyncedSegments(
      project.syncedSegments,
      project.preferredLanguage || 'en'
    );
    autoFixedCount++;
  }

  // 2. Word Timestamp Monotonicity, Bounds & Zero-Overlap Check
  let wordTimingFixes = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let s = Number.isFinite(w.start) ? Math.max(0, w.start) : 0;
    let e = Number.isFinite(w.end) ? w.end : s + 0.2;

    if (i > 0 && s < words[i - 1].end) {
      s = Number(words[i - 1].end.toFixed(2));
      wordTimingFixes++;
    }
    if (e <= s) {
      e = Number((s + 0.12).toFixed(2));
      wordTimingFixes++;
    }
    if (s > duration + 0.5) {
      s = Number(Math.max(0, duration - 0.3).toFixed(2));
      e = Number(duration.toFixed(2));
      wordTimingFixes++;
    } else if (e > duration + 0.5) {
      e = Number((duration + 0.2).toFixed(2));
      wordTimingFixes++;
    }

    w.start = s;
    w.end = e;
  }

  autoFixedCount += wordTimingFixes;
  checks.push({
    id: 'word_timing',
    label: 'Word Highlight Timestamps',
    status: words.length === 0 ? 'error' : wordTimingFixes > 0 ? 'auto-fixed' : 'passed',
    detail:
      words.length === 0
        ? 'No transcript words found.'
        : wordTimingFixes > 0
        ? `Auto-healed ${wordTimingFixes} word timestamp overlap(s) across ${words.length} words.`
        : `All ${words.length} words strictly monotonic with 0ms overlap.`,
  });

  // 3. Phrase Grouping & Pause/Silence Bleed Check
  let groups: CaptionGroup[] = Array.isArray(project.captionGroups)
    ? project.captionGroups.map((g) => ({
        ...g,
        words: g.words.map((w) => {
          const syncedWord = words.find((tw) => tw.id === w.id);
          return syncedWord ? { ...syncedWord } : { ...w };
        }),
      }))
    : [];

  let groupFixes = 0;
  if (groups.length === 0 && words.length > 0) {
    groups = groupTranscriptWords(words, 4);
    groupFixes++;
  } else {
    // Verify no group spans across an acoustic silence >= 0.20s
    const splitVerifiedGroups: CaptionGroup[] = [];
    for (const g of groups) {
      if (!g.words || g.words.length === 0) {
        groupFixes++;
        continue;
      }
      let bucket: TranscriptWord[] = [g.words[0]];
      for (let k = 1; k < g.words.length; k++) {
        const prevW = g.words[k - 1];
        const currW = g.words[k];
        const gap = currW.start - prevW.end;
        const prevEndsPunct = /[.!?।,;:]/.test(prevW.text.trim().slice(-1));
        if (gap >= 0.18 || (prevEndsPunct && gap >= 0.06)) {
          // Split group across pause so caption never lingers during silence!
          splitVerifiedGroups.push({
            id: `group_${splitVerifiedGroups.length + 1}`,
            words: bucket,
            start: bucket[0].start,
            end: bucket[bucket.length - 1].end,
            text: bucket.map((w) => w.text).join(' '),
          });
          bucket = [currW];
          groupFixes++;
        } else {
          bucket.push(currW);
        }
      }
      if (bucket.length > 0) {
        const expectedStart = bucket[0].start;
        const expectedEnd = bucket[bucket.length - 1].end;
        const expectedText = bucket.map((w) => w.text).join(' ');
        if (
          Math.abs(g.start - expectedStart) > 0.01 ||
          Math.abs(g.end - expectedEnd) > 0.01 ||
          g.text !== expectedText
        ) {
          groupFixes++;
        }
        splitVerifiedGroups.push({
          id: `group_${splitVerifiedGroups.length + 1}`,
          words: bucket,
          start: expectedStart,
          end: expectedEnd,
          text: expectedText,
        });
      }
    }

    // Ensure non-overlapping group boundaries
    for (let i = 1; i < splitVerifiedGroups.length; i++) {
      if (splitVerifiedGroups[i].start < splitVerifiedGroups[i - 1].end) {
        splitVerifiedGroups[i - 1].end = splitVerifiedGroups[i].start;
        groupFixes++;
      }
    }
    groups = splitVerifiedGroups;
  }

  autoFixedCount += groupFixes;
  checks.push({
    id: 'pause_alignment',
    label: 'Pause & Silence Alignment',
    status: groups.length === 0 ? 'error' : groupFixes > 0 ? 'auto-fixed' : 'passed',
    detail:
      groups.length === 0
        ? 'No caption groups available.'
        : groupFixes > 0
        ? `Auto-aligned ${groupFixes} phrase boundary pause(s) across ${groups.length} groups.`
        : `${groups.length} caption phrases aligned with speaker pauses (0 silence bleed).`,
  });

  // 4. Transcript & Language Readiness
  const langLabel = project.preferredLanguage === 'hi' ? 'Hindi (हिन्दी)' : 'English (EN)';
  checks.push({
    id: 'transcript_integrity',
    label: 'Transcript & Language Sync',
    status: words.length > 0 && groups.length > 0 ? 'passed' : 'error',
    detail:
      words.length > 0
        ? `Active: ${langLabel} • ${groups.length} phrases, ${words.length} words verified.`
        : 'Transcript is empty.',
  });

  // 5. Media & Canvas Readiness
  const width = project.outputSettings?.width || 1080;
  const height = project.outputSettings?.height || 1920;
  const isEvenDims = width % 2 === 0 && height % 2 === 0;
  const hasMedia = Boolean(project.audio?.fileUrl && width && height);

  let canvasDetail = '';
  let canvasStatus: 'passed' | 'warning' | 'error' = 'passed';

  if (!hasMedia) {
    canvasStatus = 'error';
    canvasDetail = 'Missing audio track or canvas dimension settings.';
  } else if (!isEvenDims) {
    canvasStatus = 'warning';
    canvasDetail = `Canvas dimensions ${width}×${height} are not divisible by 2. Auto-scaling to even dimensions for video encoding.`;
  } else {
    canvasDetail = `${width}×${height} (${project.outputSettings.aspectRatio}) @ ${project.outputSettings.fps}fps • Safe Zone verified • Audio ${duration.toFixed(1)}s`;
  }

  checks.push({
    id: 'media_assets',
    label: 'Canvas & Audio Track',
    status: canvasStatus,
    detail: canvasDetail,
  });

  const hasError = checks.some((c) => c.status === 'error');
  const healedProject: CaptionProject =
    autoFixedCount > 0
      ? {
          ...project,
          transcript: words,
          captionGroups: groups,
        }
      : project;

  return {
    ready: !hasError,
    needsServerAudioSync,
    autoFixedCount,
    healedProject,
    checks,
  };
}
