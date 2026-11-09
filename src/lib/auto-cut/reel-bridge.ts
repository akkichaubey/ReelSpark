import { createEmptyCaptionProject } from '../caption-maker/sample-data';
import type { MediaAsset } from '../clipping-studio/contracts';
import { getMediaAssetWebUrl } from '../clipping-studio/contracts';
import { validateTimeline } from '../timeline/model';
import type { AutoCutClipCandidate } from './types';
import { autoCutClipsToTimelineClips } from './optimizer';

/** Reuse the editor's timeline document and original media; no rendered intermediate. */
export function createAutoCutReel(asset: MediaAsset, candidates: AutoCutClipCandidate[], title: string) {
  const selected = candidates.filter(c => c.selected);
  if (!selected.length) throw new Error('Select at least one clip.');
  if (selected.some(c => !Number.isSafeInteger(c.startMs) || !Number.isSafeInteger(c.endMs) || c.startMs < 0 || c.endMs > asset.metadata.durationMs || c.endMs <= c.startMs || c.durationMs !== c.endMs - c.startMs)) {
    throw new Error('Clip timing exceeds the source media. Regenerate the edit.');
  }
  const project = createEmptyCaptionProject(`autocut_${crypto.randomUUID()}`);
  project.title = title;
  const url = getMediaAssetWebUrl(asset);
  const duration = asset.metadata.durationMs / 1000;
  const sourceId = `source_${asset.id}`;
  const clips = autoCutClipsToTimelineClips(selected, asset.metadata.hasVideo ? 'video' : 'audio', sourceId);
  project.timeline = { version: 1, enabled: true, fps: Math.min(60, Math.max(12, asset.metadata.fps || 30)),
    tracks: [], assets: [{ id: sourceId, fileUrl: url, fileName: asset.filename,
      mediaType: asset.metadata.hasVideo ? 'video' : 'audio', durationMs: asset.metadata.durationMs,
      width: asset.metadata.width, height: asset.metadata.height, hasAudio: asset.metadata.hasAudio }],
    clips: [], captionSources: {}, markers: [] };
  if (asset.metadata.hasVideo) {
    project.timeline.tracks.push({ id: 'video', name: 'Auto Cut video', kind: 'video', locked: false, hidden: false, muted: false, height: 64 });
    project.timeline.clips.push(...clips.map(c => ({ ...c, muted: true, linkId: `link_${c.id}` })));
    project.image = { id: sourceId, fileUrl: url, storagePath: asset.localPath, fileName: asset.filename,
      fileSize: asset.fileSizeBytes, width: asset.metadata.width || 1080, height: asset.metadata.height || 1920,
      format: asset.metadata.formatName, fitMode: 'cover', position: 'center', scale: 100,
      mediaType: 'video', duration, muteSourceAudio: true };
  }
  if (asset.metadata.hasAudio) {
    project.audio = { id: sourceId, fileUrl: url, storagePath: asset.localPath, fileName: asset.filename,
      fileSize: asset.fileSizeBytes, duration, format: asset.metadata.formatName, sourceType: asset.metadata.hasVideo ? 'video' : 'audio' };
    project.timeline.tracks.push({ id: 'audio', name: 'Original audio', kind: 'audio', locked: false, hidden: false, muted: false, height: 56 });
    project.timeline.clips.push(...clips.map(c => ({ ...c, id: `audio_${c.id}`, trackId: 'audio', linkId: `link_${c.id}` })));
    project.timeline.tracks.push({ id: 'captions', name: 'Captions', kind: 'captions', locked: false, hidden: false, muted: false, height: 48 });
    project.timeline.clips.push(...clips.map(c => ({ ...c, id: 'captions_' + c.id, trackId: 'captions', linkId: 'link_' + c.id })));
    project.timeline.captionSources[sourceId] = { transcript: [], captionGroups: [] };
  }
  if (asset.metadata.hasAudio) {
    const words = candidates.flatMap(c => c.transcriptWords || []);
    const unique = new Map(words.map(w => [w.startMs + ':' + w.endMs + ':' + w.text, w]));
    project.transcript = [...unique.values()].sort((a,b)=>a.startMs-b.startMs).map((w,index)=>({ id: 'word_' + index, text: w.text, start: w.startMs / 1000, end: w.endMs / 1000 }));
    project.isAudioSynced = project.transcript.length > 0;
    project.timeline.captionSources[sourceId] = { transcript: project.transcript, captionGroups: [] };
  }
  const errors = validateTimeline(project.timeline);
  if (errors.length) throw new Error(errors.join(' '));
  return project;
}
