import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { analyzeSemanticMoments, semanticProviderIdentity } from '@/lib/auto-cut/semantic';
import { canReadMedia } from '@/lib/media-access';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';
import { AutoCutSettingsSchema, AutoCutClipCandidateSchema } from '@/lib/auto-cut/types';
import { buildAutoCutScenes } from '@/lib/auto-cut/scenes';
import { buildSpeechMoments, speechClip } from '@/lib/auto-cut/speech';
import {
  analyzeMediaForAutoCut,
  detectVisualIntervals,
  extractFrameBase64,
} from '@/lib/auto-cut/analyzer';
import { optimizeDurationAndAssemble } from '@/lib/auto-cut/optimizer';
import { fingerprintDuplicateScenes } from '@/lib/auto-cut/duplicate-fingerprints';
import { annotateTransitionScenes } from '@/lib/auto-cut/natural-transitions';

export const runtime = 'nodejs';

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const progressSchema = z.object({ jobId: idSchema, message: z.string().max(200) });

export async function GET(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const project = idSchema.safeParse(req.nextUrl.searchParams.get('projectId'));
  const job = idSchema.safeParse(req.nextUrl.searchParams.get('jobId'));
  if (!project.success || !job.success) return NextResponse.json({ error: 'Invalid analysis status request' }, { status: 400 });
  const directory = await clippingProjectAccess(access.user.id, project.data);
  if (!directory) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  let progress: z.infer<typeof progressSchema> | null = null;
  try {
    const stored = progressSchema.parse(JSON.parse(await fs.promises.readFile(path.join(directory, '.autocut-progress.json'), 'utf8')));
    if (stored.jobId === job.data) progress = stored;
  } catch { /* The analysis may still be starting. */ }
  return NextResponse.json({ progress }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;

    const parsed = z.object({
      filePath: z.string().min(1).max(4096).optional(),
      projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
      mediaAssetId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).optional(),
      jobId: idSchema.optional(),
      settings: AutoCutSettingsSchema.default(() => AutoCutSettingsSchema.parse({})),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid Auto Cut request or settings' }, { status: 400 });
    const { filePath, projectId, mediaAssetId, settings, jobId } = parsed.data;
    const directory = await clippingProjectAccess(access.user.id, projectId);
    if (!directory) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    let targetFilePath = '';
    if (filePath) {
      try {
        targetFilePath = assertSafePath(path.isAbsolute(filePath) ? filePath : path.join(APP_CONFIG.storageRoot, filePath), APP_CONFIG.storageRoot);
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid media path' }, { status: 400 });
      }
    } else {
      const mediaDir = path.join(directory, 'media');
      const files = await fs.promises.readdir(mediaDir).catch(() => [] as string[]);
      const match = files.find(f => !f.startsWith('.') && (!mediaAssetId || f.includes(mediaAssetId)));
      if (match) targetFilePath = assertSafePath(path.join(mediaDir, match), directory);
    }
    if (targetFilePath && !fs.existsSync(/*turbopackIgnore: true*/ targetFilePath)) await restorePrivateMedia(access.user.id, targetFilePath);
    if (!targetFilePath || !(await canReadMedia(access.user.id, targetFilePath))) {
      return NextResponse.json({ success: false, error: 'Media not found or unavailable for this account' }, { status: 404 });
    }
    req.signal.throwIfAborted();
    const reportProgress = async (message: string) => {
      if (!jobId || req.signal.aborted) return;
      await fs.promises.writeFile(path.join(directory, '.autocut-progress.json'), JSON.stringify({ jobId, message })).catch(() => {});
    };

    // Run AI analysis
    await reportProgress('Measuring source cuts and audio activity…');
    const analysis = await analyzeMediaForAutoCut(targetFilePath, settings, req.signal);
    const stat = await fs.promises.stat(/*turbopackIgnore: true*/ targetFilePath);
    const sourceVideoId = mediaAssetId || createHash('sha256').update(targetFilePath).digest('hex');
    const identity = semanticProviderIdentity();
    const key = createHash('sha256').update(JSON.stringify({ version: 9, file: targetFilePath, size: stat.size, modified: stat.mtimeMs,
      settings: { ...settings, quality: undefined }, identity })).digest('hex');
    const cacheDir = assertSafePath(path.join(directory, '.autocut-cache'), directory);
    const visualDir = path.join(cacheDir, key + '-visual');
    const visualChunkSchema = z.object({
      intervals: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() })),
      gradual: z.array(z.object({ timestampSec: z.number().nonnegative(), score: z.number().min(0).max(1), kind: z.enum(['fade', 'dissolve']) })),
      motionMs: z.array(z.number().int().nonnegative()),
    });
    const visual = analysis.hasVideo ? await detectVisualIntervals(targetFilePath, analysis.totalDurationMs, req.signal, {
      async read(offset) {
        try {
          const chunk = visualChunkSchema.parse(JSON.parse(await fs.promises.readFile(path.join(visualDir, `${offset}.json`), 'utf8')));
          const end = Math.min(offset + 120_000, analysis.totalDurationMs);
          if (chunk.intervals.some(interval => interval.startMs < offset || interval.endMs > end || interval.startMs >= interval.endMs) ||
            chunk.gradual.some(cut => cut.timestampSec * 1000 < offset || cut.timestampSec * 1000 >= end) ||
            chunk.motionMs.some(time => time < offset || time > end)) return undefined;
          return chunk;
        } catch { return undefined; }
      },
      async write(offset, chunk) {
        try {
          await fs.promises.mkdir(visualDir, { recursive: true });
          await fs.promises.writeFile(path.join(visualDir, `${offset}.json`), JSON.stringify(chunk), { flag: 'wx' });
        } catch { /* A cache failure must not discard measured evidence. */ }
      },
      async onProgress(processedMs, totalMs) {
        await reportProgress(`Scanning motion and transitions · ${Math.round(processedMs / totalMs * 100)}%`);
      },
    }) : { intervals: [], gradual: [], motionMs: [] };
    let motionIndex = 0;
    for (const candidate of analysis.candidates) {
      while (motionIndex < visual.motionMs.length && visual.motionMs[motionIndex] < candidate.startMs) motionIndex++;
      const samples = motionIndex;
      while (motionIndex < visual.motionMs.length && visual.motionMs[motionIndex] < candidate.endMs) motionIndex++;
      if (motionIndex - samples >= 3) candidate.visualActionScore = Math.max(18, candidate.visualActionScore);
    }
    let method = 'scene-and-audio-heuristics';
    let warning = 'Scene and audio activity estimates; cooking actions and spoken meaning have not been recognized.';
    let provider: string | undefined;
    if (settings.analysisMethod === 'semantic') {
      await reportProgress('Reviewing sampled scenes with the vision provider…');
      const cacheFile = path.join(cacheDir, key + '.json');
      const cacheSchema = z.object({ candidates: z.array(AutoCutClipCandidateSchema), warning: z.string(), provider: z.string(), model: z.string(), sampledWindows: z.number(), totalWindows: z.number(), speechAuthorizationFailed: z.boolean().optional(), partialSpeech: z.boolean().optional() });
      let semantic: z.infer<typeof cacheSchema> | undefined;
      try {
        const cached = cacheSchema.parse(JSON.parse(await fs.promises.readFile(/*turbopackIgnore: true*/ cacheFile, 'utf8')));
        if (cached.candidates.length === Math.min(96, analysis.candidates.length) && new Set(cached.candidates.map(c => c.id)).size === cached.candidates.length && cached.candidates.every(c => c.analysisMethod === 'semantic' && c.durationMs === c.endMs - c.startMs && (c.transcriptWords || []).every(w => w.startMs >= c.startMs && w.endMs <= c.endMs && w.endMs > w.startMs) && analysis.candidates.some(original => original.id === c.id && original.startMs === c.startMs && original.endMs === c.endMs))) semantic = cached;
      } catch { /* Missing/invalid cache never substitutes invented analysis. */ }
      if (!semantic) {
        semantic = await analyzeSemanticMoments(targetFilePath, analysis.candidates, settings, { hasVideo: analysis.hasVideo, hasAudio: analysis.hasAudio }, req.signal);
        req.signal.throwIfAborted();
        await fs.promises.mkdir(cacheDir, { recursive: true });
        // Bound cache growth without deleting original media or saved versions.
        const entries = await fs.promises.readdir(/*turbopackIgnore: true*/ cacheDir);
        if (!semantic.speechAuthorizationFailed && !semantic.partialSpeech && entries.length < 20) await fs.promises.writeFile(cacheFile, JSON.stringify(semantic), { flag: 'wx' }).catch(() => {});
      }
      analysis.candidates = semantic.candidates;
      analysis.cookingDetected = semantic.candidates.some(c => c.cookingActivity && c.cookingActivity !== 'other');
      analysis.detectedActivities = [...new Set(semantic.candidates.flatMap(c=>c.cookingActivity ? [c.cookingActivity] : []))];
      analysis.speechDetected = semantic.candidates.some(c => c.transcriptWords?.length);
      method = 'multimodal-ai'; warning = semantic.warning; provider = semantic.provider + '/' + semantic.model;
    }

    await reportProgress('Measuring shot quality and checking for repeated footage…');
    const fingerprinted = await fingerprintDuplicateScenes(targetFilePath, cacheDir, analysis.candidates, analysis, req.signal)
      .catch(() => { req.signal.throwIfAborted(); return analysis.candidates; });
    analysis.candidates = fingerprinted;
    // Run Duration Optimizer and Assembly
    await reportProgress('Assembling the scene list and reel draft…');
    const visibleCandidates = analysis.candidates.filter(candidate => !visual.intervals.some(interval =>
      candidate.startMs >= interval.startMs && candidate.endMs <= interval.endMs));
    const speechHighlights = settings.mode === 'podcast' ? buildSpeechMoments(visibleCandidates)
      .filter(moment => moment.complete && !moment.repeat).map(moment => speechClip(moment)) : [];
    const { assembledClips, totalDurationMs, targetDurationMs } = optimizeDurationAndAssemble(
      speechHighlights.length ? speechHighlights : visibleCandidates, settings);
    const cuts = analysis.sceneCuts.filter(cut => !visual.gradual.some(gradual => Math.abs(gradual.timestampSec - cut.timestampSec) < 0.5));
    const scenes = buildAutoCutScenes(sourceVideoId, analysis.totalDurationMs, [...cuts, ...visual.gradual], visual.intervals, analysis.candidates, visual.motionMs);

    // Generate thumbnails for assembled clips
    for (const clip of assembledClips.slice(0, 12)) {
      req.signal.throwIfAborted();
      try {
        const midSec = (clip.startMs + clip.durationMs * 0.4) / 1000;
        const thumb = await extractFrameBase64(targetFilePath, midSec, 280, req.signal);
        if (thumb) {
          clip.thumbnailBase64 = thumb;
        }
      } catch {
        // Thumbnail generation is non-blocking
      }
    }

    // Also populate thumbnail on remaining unselected candidates if <= 12
    for (const candidate of analysis.candidates.slice(0, 12)) {
      req.signal.throwIfAborted();
      if (!candidate.thumbnailBase64) {
        const matching = assembledClips.find((c) => c.id === candidate.id);
        if (matching?.thumbnailBase64) {
          candidate.thumbnailBase64 = matching.thumbnailBase64;
        } else {
          try {
            const midSec = (candidate.startMs + candidate.durationMs * 0.4) / 1000;
            const thumb = await extractFrameBase64(targetFilePath, midSec, 280, req.signal);
            if (thumb) candidate.thumbnailBase64 = thumb;
          } catch {}
        }
      }
    }

    req.signal.throwIfAborted();
    for (const scene of scenes.slice(0, 12)) {
      req.signal.throwIfAborted();
      if (!analysis.hasVideo) break;
      const time = scene.evidenceFrames[0] ?? Math.floor((scene.startMs + scene.endMs) / 2);
      scene.thumbnail = (await extractFrameBase64(targetFilePath, time / 1000, 160, req.signal).catch(() => null)) ?? undefined;
    }
    req.signal.throwIfAborted();
    return NextResponse.json({
      success: true,
      analysis: {
        mode: settings.mode,
        totalSourceDurationMs: analysis.totalDurationMs,
        targetDurationMs,
        assembledDurationMs: totalDurationMs,
        cookingDetected: analysis.cookingDetected,
        detectedActivities: analysis.detectedActivities,
        speechDetected: analysis.speechDetected,
        sceneCutCount: analysis.sceneCutCount,
        silenceCount: analysis.silenceCount,
        candidates: annotateTransitionScenes(analysis.candidates, scenes),
        scenes,
        method, warning, provider,
      },
      assembledClips: annotateTransitionScenes(assembledClips, scenes),
      totalDurationMs,
      targetDurationMs,
    });
  } catch (err: unknown) {
    if (req.signal.aborted) return NextResponse.json({ success: false, error: 'Analysis cancelled' }, { status: 499 });
    console.error('[AutoCut API Error]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Auto Cut analysis failed unexpectedly',
      },
      { status: 500 }
    );
  }
}
