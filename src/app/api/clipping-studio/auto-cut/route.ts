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
import {
  analyzeMediaForAutoCut,
  extractFrameBase64,
} from '@/lib/auto-cut/analyzer';
import { optimizeDurationAndAssemble } from '@/lib/auto-cut/optimizer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;

    const parsed = z.object({
      filePath: z.string().min(1).max(4096).optional(),
      projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
      mediaAssetId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).optional(),
      settings: AutoCutSettingsSchema.default(() => AutoCutSettingsSchema.parse({})),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid Auto Cut request or settings' }, { status: 400 });
    const { filePath, projectId, mediaAssetId, settings } = parsed.data;
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

    // Run AI analysis
    const analysis = await analyzeMediaForAutoCut(targetFilePath, settings, req.signal);
    let method = 'scene-and-audio-heuristics';
    let warning = 'Scene and audio activity estimates; cooking actions and spoken meaning have not been recognized.';
    let provider: string | undefined;
    if (settings.analysisMethod === 'semantic') {
      const stat = await fs.promises.stat(/*turbopackIgnore: true*/ targetFilePath);
      const identity = semanticProviderIdentity();
      const key = createHash('sha256').update(JSON.stringify({ version: 1, file: targetFilePath, size: stat.size, modified: stat.mtimeMs, settings, identity })).digest('hex');
      const cacheDir = assertSafePath(path.join(directory, '.autocut-cache'), directory);
      const cacheFile = path.join(cacheDir, key + '.json');
      const cacheSchema = z.object({ candidates: z.array(AutoCutClipCandidateSchema), warning: z.string(), provider: z.string(), model: z.string(), sampledWindows: z.number(), totalWindows: z.number(), speechAuthorizationFailed: z.boolean().optional() });
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
        if (!semantic.speechAuthorizationFailed && entries.length < 20) await fs.promises.writeFile(cacheFile, JSON.stringify(semantic), { flag: 'wx' }).catch(() => {});
      }
      analysis.candidates = semantic.candidates;
      analysis.cookingDetected = semantic.candidates.some(c => c.cookingActivity && c.cookingActivity !== 'other');
      analysis.detectedActivities = [...new Set(semantic.candidates.flatMap(c=>c.cookingActivity ? [c.cookingActivity] : []))];
      analysis.speechDetected = semantic.candidates.some(c => c.transcriptWords?.length);
      method = 'multimodal-ai'; warning = semantic.warning; provider = semantic.provider + '/' + semantic.model;
    }

    // Run Duration Optimizer and Assembly
    const { assembledClips, totalDurationMs, targetDurationMs } =
      optimizeDurationAndAssemble(analysis.candidates, settings);

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
        candidates: analysis.candidates,
        method, warning, provider,
      },
      assembledClips,
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
