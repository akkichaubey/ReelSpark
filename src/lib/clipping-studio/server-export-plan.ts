import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { probeVideo } from '../ffmpeg';
import { canReadMedia } from '../media-access';
import { restorePrivateMedia } from '../cloudflare/private-media';
import { clippingProjectAccess } from '../media-api-access';
import { assertSafePath } from '../storage';
import { buildSingleClipExportFfmpegArgs } from './export-planner';
import type { Clip, MediaAsset } from './contracts';

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const settings = z.object({
  outputFormat: z.enum(['mp4', 'mov', 'webm', 'mp3', 'wav']).default('mp4'),
  outputType: z.enum(['video_and_audio', 'video_only', 'audio_only']).default('video_and_audio'),
  qualityProfile: z.enum(['source', 'high', 'medium', 'fast']).default('high'),
  targetResolution: z.enum(['source', '1080p', '720p', '4k']).default('source'),
  normalizeAudio: z.boolean().default(false),
}).strict();
export const ServerExportRequest = z.object({
  jobId: identifier, projectId: identifier,
  jobType: z.enum(['single_clip', 'merge_recipe']), targetId: identifier,
  sources: z.array(z.object({
    localPath: z.string().min(1).max(4096),
    startMs: z.number().finite().min(0), endMs: z.number().finite().positive(),
    clipId: identifier,
    sourceAssetId: identifier.optional(),
    transition: z.enum(['none', 'cut', 'crossfade']).default('none'),
  }).strict()).min(1).max(50),
  filename: z.string().max(160).optional(),
  outputSettings: settings,
}).strict();

export class ExportPlanError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function createServerExportPlan(userId: string, body: unknown, probe = probeVideo) {
  const parsed = ServerExportRequest.safeParse(body);
  if (!parsed.success) throw new ExportPlanError('Invalid export options. Raw commands and custom output paths are not accepted.');
  const request = parsed.data;
  for (const source of request.sources) {
    if (!(await canReadMedia(userId, source.localPath))) await restorePrivateMedia(userId, source.localPath);
  }
  const projectDir = await clippingProjectAccess(userId, request.projectId);
  if (!projectDir) throw new ExportPlanError('Project not found', 404);
  if (request.jobType === 'single_clip' && request.sources.length !== 1) throw new ExportPlanError('Single clip requires one source');
  const outputSettings = request.outputSettings;
  const audioOnly = outputSettings.outputType === 'audio_only' || ['mp3', 'wav'].includes(outputSettings.outputFormat);
  if (audioOnly && outputSettings.outputType === 'video_only') throw new ExportPlanError('Audio format cannot use video-only output');
  const sources = [];
  let totalDurationMs = 0;
  for (const source of request.sources) {
    if (source.transition === 'crossfade') throw new ExportPlanError('Crossfade export is not implemented; use cut or none');
    if (source.endMs <= source.startMs || !(await canReadMedia(userId, source.localPath))) throw new ExportPlanError('Media not found or invalid clip boundaries', 404);
    const localPath = await fs.realpath(source.localPath);
    if (!/\.(mp4|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg|flac)$/i.test(localPath)) throw new ExportPlanError('Unsupported source media');
    const meta = await probe(localPath);
    if (!Number.isFinite(meta.duration) || source.endMs > meta.duration * 1000 + 50) throw new ExportPlanError('Clip exceeds source duration');
    if (!audioOnly && meta.aspectRatio === 'Audio') throw new ExportPlanError('Video output requires video sources');
    if (audioOnly && !meta.hasAudio) throw new ExportPlanError('Source has no audio');
    totalDurationMs += source.endMs - source.startMs;
    if (totalDurationMs > 3_600_000) throw new ExportPlanError('Export duration exceeds one hour');
    sources.push({ ...source, localPath, meta });
  }
  // A unique server-created directory prevents traversal, output overwrite and collisions.
  const exportsDir = path.join(projectDir, 'exports');
  await fs.mkdir(exportsDir, { recursive: true });
  assertSafePath(await fs.realpath(exportsDir), projectDir);
  const directory = await fs.mkdtemp(path.join(exportsDir, 'export-'));
  const filename = (request.filename || request.targetId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || randomUUID();
  const outputPath = path.join(/*turbopackIgnore: true*/ directory, `${filename}.${outputSettings.outputFormat}`);
  let args: string[];
  if (request.jobType === 'single_clip') {
    const source = sources[0];
    args = buildSingleClipExportFfmpegArgs({
      clip: { startMs: source.startMs, endMs: source.endMs } as Clip,
      mediaAsset: { localPath: source.localPath } as MediaAsset,
      ...outputSettings, outputPath,
    });
  } else {
    const inputs = sources.flatMap(source => ['-ss', (source.startMs / 1000).toFixed(3), '-t', ((source.endMs - source.startMs) / 1000).toFixed(3), '-i', source.localPath]);
    const chains: string[] = [];
    const videoOnly = outputSettings.outputType === 'video_only';
    const first = sources[0].meta;
    const resolution = outputSettings.targetResolution;
    const [width, height] = resolution === '4k' ? [3840, 2160] : resolution === '1080p' ? [1920, 1080] : resolution === '720p' ? [1280, 720] : [Math.max(2, Math.floor((first.width || 1920) / 2) * 2), Math.max(2, Math.floor((first.height || 1080) / 2) * 2)];
    sources.forEach((source, index) => {
      if (!audioOnly) chains.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,setpts=PTS-STARTPTS[v${index}]`);
      if (!videoOnly) chains.push(source.meta.hasAudio
        ? `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${((source.endMs - source.startMs) / 1000).toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`);
    });
    const labels = sources.map((_, i) => `${audioOnly ? '' : `[v${i}]`}${videoOnly ? '' : `[a${i}]`}`).join('');
    chains.push(`${labels}concat=n=${sources.length}:v=${audioOnly ? 0 : 1}:a=${videoOnly ? 0 : 1}${audioOnly ? '' : '[outv]'}${videoOnly ? '' : '[outa]'}`);
    if (!videoOnly && outputSettings.normalizeAudio) chains.push('[outa]loudnorm=I=-16:TP=-1.5:LRA=11[normalized]');
    args = ['-y', ...inputs, '-filter_complex', chains.join(';')];
    if (!audioOnly) args.push('-map', '[outv]', '-c:v', outputSettings.outputFormat === 'webm' ? 'libvpx-vp9' : 'libx264', '-crf', outputSettings.qualityProfile === 'high' ? '18' : outputSettings.qualityProfile === 'medium' ? '23' : '28');
    if (!audioOnly && outputSettings.outputFormat === 'webm') args.push('-b:v', '0');
    if (!videoOnly) args.push('-map', outputSettings.normalizeAudio ? '[normalized]' : '[outa]', '-c:a', outputSettings.outputFormat === 'mp3' ? 'libmp3lame' : outputSettings.outputFormat === 'wav' ? 'pcm_s16le' : outputSettings.outputFormat === 'webm' ? 'libopus' : 'aac');
    args.push(outputPath);
  }
  return { ...request, outputPath, args, totalDurationMs, sourceMappings: sources.map((source, index) => ({
    id: `src_${request.jobId}_${index}`, exportJobId: request.jobId, clipId: source.clipId,
    sourceAssetId: source.sourceAssetId || source.clipId, startMs: source.startMs, endMs: source.endMs, sequenceIndex: index,
  })) };
}
