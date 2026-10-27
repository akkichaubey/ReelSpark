import type { Project } from '../types';
import type { ClippingProject, Clip, MediaAsset } from './contracts';

export function primaryWorkspaceForSource(sourceId: string, projects: ClippingProject[]): ClippingProject | undefined {
  const linked = projects.filter(project => project.sourceProjectId === sourceId);
  return linked.find(project => project.id === `studio_${sourceId}`) || linked.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
}

/** Additive adapter: AI manifests remain authoritative for analysis, timeline edits stay independent. */
export function linkAnalysisProject(source: Project, existing?: ClippingProject, importSelected = false): ClippingProject {
  if (existing?.sourceProjectId && existing.sourceProjectId !== source.id) throw new Error('This workspace belongs to a different AI project.');
  const id = existing?.id || `studio_${source.id}`;
  const mediaId = existing?.sourceMediaAssetId || `media_${source.id}`;
  const result: ClippingProject = existing
    ? { ...existing, mediaAssets: [...existing.mediaAssets], clips: [...existing.clips] }
    : { id, name: source.title, mediaAssets: [], clips: [], mergeRecipes: [], exportJobs: [], createdAt: source.createdAt, updatedAt: source.updatedAt };
  result.sourceProjectId = source.id;
  result.sourceMediaAssetId = mediaId;
  const metadata = source.videoMetadata;
  if (source.localVideoPath && metadata && !result.mediaAssets.some(asset => asset.id === mediaId)) {
    const asset: MediaAsset = {
      id: mediaId, projectId: id, filename: source.originalFileName || source.title,
      localPath: source.localVideoPath, fileSizeBytes: metadata.sizeBytes,
      metadata: { durationSeconds: metadata.duration, durationMs: Math.round(metadata.duration * 1000),
        sizeBytes: metadata.sizeBytes, formatName: metadata.format, width: metadata.width,
        height: metadata.height, fps: metadata.fps, aspectRatio: metadata.aspectRatio,
        hasAudio: metadata.hasAudio, hasVideo: metadata.width > 0 && metadata.height > 0,
        videoCodec: metadata.videoCodec, audioCodec: metadata.audioCodec },
      createdAt: source.createdAt,
    };
    result.mediaAssets.push(asset);
  }
  const asset = result.mediaAssets.find(item => item.id === mediaId);
  if (importSelected && !asset) throw new Error('Upload or restore the original media before importing AI clips.');
  if (importSelected && asset) {
    const ids = new Set(result.clips.map(clip => clip.id));
    const importedCandidates = new Set(result.clips.map(clip => clip.sourceCandidateKey).filter(Boolean));
    for (const candidate of source.candidates.filter(item => item.selected)) {
      const clipId = `ai_${source.id}_${candidate.id}`;
      const sourceCandidateKey = `${source.id}:${candidate.id}`;
      if (ids.has(clipId) || importedCandidates.has(sourceCandidateKey)) continue;
      const startMs = Math.round(candidate.start * 1000);
      const endMs = Math.round(candidate.end * 1000);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs > asset.metadata.durationMs) {
        throw new Error(`Invalid timing for “${candidate.title}”. Adjust the clip boundaries before importing.`);
      }
      const clip: Clip = { id: clipId, sourceCandidateKey, projectId: id, mediaAssetId: mediaId,
        name: candidate.customTitle || candidate.title, startMs, endMs, durationMs: endMs - startMs,
        orderIndex: result.clips.length, notes: candidate.explanation,
        createdAt: source.updatedAt, updatedAt: source.updatedAt };
      result.clips.push(clip);
      ids.add(clipId);
    }
  }
  return result;
}

export function studioProjectUrl(projectId: string, tab = 'ai'): string {
  return `/clipping-studio?${new URLSearchParams({ project: projectId, tab })}`;
}
