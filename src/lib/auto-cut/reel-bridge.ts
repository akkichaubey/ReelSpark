import { createEmptyCaptionProject } from '../caption-maker/sample-data';
import { groupTranscriptWords } from '../caption-maker/caption-grouping';
import type { TranscriptWord } from '../caption-maker/types';
import type { MediaAsset } from '../clipping-studio/contracts';
import { getMediaAssetWebUrl } from '../clipping-studio/contracts';
import { validateTimeline, type TimelineClip } from '../timeline/model';
import type { AutoCutClipCandidate } from './types';
import { autoCutClipsToTimelineClips } from './optimizer';
import { prependHook, trimHook, type AutoCutHook } from './hooks';
import type { BRollEdit } from './broll';
import { applyBRollEdits } from './broll-timeline';
import { suggestTransition, type NaturalTransitionConfig } from './natural-transitions';
import { setNaturalTimelineBoundary } from '../timeline/natural-transitions';
import type { CameraSync } from './multicamera';

/** Reuse the editor timeline while preserving each clip's source-local trim. */
export function createAutoCutReel(asset: MediaAsset | MediaAsset[], candidates: AutoCutClipCandidate[], title: string, openingHook?: AutoCutHook,
  broll?: { edits: BRollEdit[]; authorizedUrls: Record<string, string> }, natural?: NaturalTransitionConfig, showCaptions = true,
  multicam?: { masterId: string; sync: CameraSync; transcriptClips: AutoCutClipCandidate[] }) {
  const available = Array.isArray(asset) ? asset : [asset];
  const hook = openingHook ? trimHook(openingHook, openingHook.clip.startMs, openingHook.clip.endMs) : undefined;
  const selected = hook ? prependHook(candidates, hook) : candidates.filter(clip => clip.selected);
  if (!selected.length) throw new Error('Select at least one clip.');
  const byId = new Map(available.map(source => [source.id, source]));
  const getSource = (clip: AutoCutClipCandidate) => {
    const source = clip.sourceVideoId ? byId.get(clip.sourceVideoId) : available.length === 1 ? available[0] : undefined;
    if (!source) throw new Error('Selected clip source is unavailable.');
    return source;
  };
  const sources = [...new Set(selected.map(getSource))];
  const master = multicam ? byId.get(multicam.masterId) : undefined;
  if (multicam && (!master?.metadata.hasAudio || !multicam.sync[master.id] || Math.abs(multicam.sync[master.id].driftMs ?? 0) > 100)) {
    throw new Error('Choose a synchronized master camera with usable audio.');
  }
  const visuals = (broll?.edits ?? []).map(edit => {
    const source = byId.get(edit.sourceId);
    if (!source?.metadata.hasVideo || !broll?.authorizedUrls[source.id]) throw new Error('B-roll media access changed. Remove or replace the unavailable placement.');
    return source;
  });
  if (new Set((broll?.edits ?? []).map(edit => edit.targetId)).size !== (broll?.edits.length ?? 0)) throw new Error('Choose one B-roll placement per target.');
  for (const clip of selected) {
    if (!Number.isSafeInteger(clip.startMs) || !Number.isSafeInteger(clip.endMs) ||
      clip.startMs < 0 || clip.endMs > getSource(clip).metadata.durationMs ||
      clip.endMs <= clip.startMs || clip.durationMs !== clip.endMs - clip.startMs) {
      throw new Error('Clip timing exceeds the source media. Regenerate the edit.');
    }
  }
  const project = createEmptyCaptionProject(`autocut_${crypto.randomUUID()}`);
  project.title = title;
  const firstVideo = sources.find(source => source.metadata.hasVideo);
  const firstAudio = master ?? sources.find(source => source.metadata.hasAudio);
  const timeline = project.timeline = {
    version: 1, enabled: true, fps: natural ? project.outputSettings.fps : Math.min(60, Math.max(12, sources[0].metadata.fps || 30)),
    naturalTransitionSettings: natural ? { profile: natural.profile, durationMs: natural.durationMs } : undefined,
    tracks: [], assets: [...new Set([...sources, ...visuals, ...(master ? [master] : [])])].map(source => ({
      id: `source_${source.id}`, fileUrl: broll?.authorizedUrls[source.id] ?? getMediaAssetWebUrl(source), fileName: source.filename,
      mediaType: source.metadata.hasVideo ? 'video' as const : 'audio' as const,
      durationMs: source.metadata.durationMs, width: source.metadata.width, height: source.metadata.height,
      hasAudio: source.metadata.hasAudio,
    })),
    clips: [], captionSources: {}, markers: [],
  } satisfies NonNullable<typeof project.timeline>;
  const addTrack = (id: 'video' | 'audio' | 'captions' | 'text', name: string, height: number) => {
    project.timeline!.tracks.push({ id, name, kind: id, locked: false, hidden: id === 'captions' && !showCaptions, muted: false, height });
  };
  if (firstVideo) {
    addTrack('video', 'Auto Cut video', 64);
    project.image = { id: `source_${firstVideo.id}`, fileUrl: broll?.authorizedUrls[firstVideo.id] ?? getMediaAssetWebUrl(firstVideo), storagePath: firstVideo.localPath,
      fileName: firstVideo.filename, fileSize: firstVideo.fileSizeBytes, width: firstVideo.metadata.width || 1080,
      height: firstVideo.metadata.height || 1920, format: firstVideo.metadata.formatName, fitMode: 'cover',
      position: 'center', scale: 100, mediaType: 'video', duration: firstVideo.metadata.durationMs / 1000, muteSourceAudio: true };
  }
  if (firstAudio) {
    addTrack('audio', 'Original audio', 56);
    addTrack('captions', 'Captions', 48);
    project.audio = { id: `source_${firstAudio.id}`, fileUrl: broll?.authorizedUrls[firstAudio.id] ?? getMediaAssetWebUrl(firstAudio), storagePath: firstAudio.localPath,
      fileName: firstAudio.filename, fileSize: firstAudio.fileSizeBytes, duration: firstAudio.metadata.durationMs / 1000,
      format: firstAudio.metadata.formatName, sourceType: firstAudio.metadata.hasVideo ? 'video' : 'audio' };
  }
  if (hook?.text.trim()) addTrack('text', 'Opening hook text', 48);
  const affected = new Set(broll?.edits.map(edit => edit.targetId));
  const clips = autoCutClipsToTimelineClips(selected.map((clip, index) => natural || master || affected.has(clip.id) || affected.has(selected[index + 1]?.id)
    ? { ...clip, transitionToNext: 'cut' } : clip), firstVideo ? 'video' : 'audio');
  clips.forEach((clip, index) => {
    const source = getSource(selected[index]);
    const linked = { ...clip, assetId: `source_${source.id}`, linkId: `link_${clip.id}` };
    if (source.metadata.hasVideo) project.timeline!.clips.push({ ...linked, muted: true,
      transitionEvidence: natural ? { black: selected[index].transitionBlack ?? [],
        silence: selected[index].measuredSilence || selected[index].audioQuality === 'silent_signal'
          ? { startMs: selected[index].startMs, endMs: selected[index].endMs } : undefined } : undefined });
    const opening = index === 0 ? hook : undefined;
    if (!master && source.metadata.hasAudio && opening?.audio !== 'visual') {
      project.timeline!.clips.push({ ...linked, id: `audio_${clip.id}`, trackId: 'audio' });
      project.timeline!.clips.push({ ...linked, id: `captions_${clip.id}`, trackId: 'captions' });
    }
    if (opening?.text.trim()) project.timeline!.clips.push({
      ...clip, id: `text_${clip.id}`, trackId: 'text', assetId: undefined, sourceStartMs: 0, linkId: linked.linkId,
      text: { value: opening.text.trim(), fontFamily: 'Arial', fontSize: 64, color: '#FFFFFF', background: '#141414', x: 50, y: 25 },
    });
  });
  if (master && multicam) {
    const audioRuns: TimelineClip[] = [];
    for (const [index, clip] of clips.entries()) {
      if (index === 0 && hook?.audio === 'visual') continue;
      const source = getSource(selected[index]);
      const offset = multicam.sync[source.id];
      if (!offset || Math.abs(offset.driftMs ?? 0) > 100) throw new Error('Verify the sync offset for every selected camera.');
      const sourceStartMs = clip.sourceStartMs + offset.offsetMs - multicam.sync[master.id].offsetMs;
      if (sourceStartMs < 0 || sourceStartMs + clip.durationMs > master.metadata.durationMs) throw new Error('Master audio does not cover the entire edit. Trim the shot or choose another master.');
      const previous = audioRuns.at(-1);
      if (previous && previous.startMs + previous.durationMs === clip.startMs && previous.sourceStartMs + previous.durationMs === sourceStartMs) previous.durationMs += clip.durationMs;
      else audioRuns.push({ ...clip, id: 'master_' + clip.id, trackId: 'audio', assetId: 'source_' + master.id,
        sourceStartMs, name: 'Master audio · ' + master.filename, muted: false, linkId: undefined });
    }
    project.timeline!.clips.push(...audioRuns, ...audioRuns.map(clip => ({ ...clip, id: 'captions_' + clip.id, trackId: 'captions' })));
  }
  for (const source of (master ? [master] : sources.filter(item => item.metadata.hasAudio))) {
    const words = [...candidates, ...(hook ? [hook.clip] : []), ...(multicam?.transcriptClips ?? [])].filter(clip =>
      (clip.sourceVideoId ?? available[0]?.id) === source.id && clip.audioQuality !== 'silent_signal')
      .flatMap(clip => (clip.transcriptWords ?? []).filter(word => word.text.trim() && Number.isSafeInteger(word.startMs) &&
        Number.isSafeInteger(word.endMs) && word.startMs >= 0 && word.endMs <= source.metadata.durationMs && word.endMs > word.startMs)
        .map(word => ({ ...word, timing: clip.speechTiming })));
    const unique = new Map(words.map(word => [`${word.startMs}:${word.endMs}:${word.text}`, word]));
    const transcript: TranscriptWord[] = [...unique.values()].sort((a, b) => a.startMs - b.startMs).map((word, index) => ({
      id: `word_${source.id}_${index}`, text: word.text, start: word.startMs / 1000, end: word.endMs / 1000,
      timingSource: word.timing === 'provider_estimate' ? 'phrase-estimated' : undefined,
    }));
    const captionGroups = groupTranscriptWords(transcript);
    project.timeline!.captionSources[`source_${source.id}`] = { transcript, captionGroups };
    if (source === firstAudio) { project.transcript = transcript; project.captionGroups = captionGroups; }
  }
  project.isAudioSynced = Object.values(project.timeline.captionSources).some(source => source.transcript.length > 0);
  if (broll?.edits.length) applyBRollEdits(timeline, selected, clips, broll.edits);
  if (natural && !master) for (let index = 1; index < selected.length; index++) {
    const outgoing = selected[index - 1], incoming = selected[index];
    if (affected.has(outgoing.id) || affected.has(incoming.id) || !getSource(outgoing).metadata.hasVideo || !getSource(incoming).metadata.hasVideo) continue;
    const proposal = suggestTransition(outgoing, incoming, natural);
    try { project.timeline = setNaturalTimelineBoundary(project.timeline!, clips[index].id, proposal.kind, proposal.durationMs, proposal.reason); }
    catch (error) {
      const clip = project.timeline!.clips.find(item => item.id === clips[index].id);
      if (clip) clip.naturalTransition = { kind: 'cut', reason: error instanceof Error ? error.message : 'The boundary uses a clean cut.' };
    }
  }
  const errors = validateTimeline(project.timeline!);
  if (errors.length) throw new Error(errors.join(' '));
  return project;
}
