import { z } from 'zod';
import type { AutoCutClipCandidate } from './types';
import type { MediaAsset } from '../clipping-studio/contracts';
import { scoreAutoCutQuality } from './quality';

export const CameraSyncSchema = z.record(z.string(), z.object({
  offsetMs: z.number().int().min(-14400000).max(14400000),
  confidence: z.number().min(0).max(100),
  method: z.enum(['waveform', 'manual']),
  driftMs: z.number().int().optional(),
}));
export type CameraSync = z.infer<typeof CameraSyncSchema>;

// Project time = source time + offset. Search signed lags on a 20 ms grid.
export function correlateCameraAudio(reference: number[], alternate: number[], maxLag = 9000) {
  const stride = 5;
  const coarse: { lag: number; score: number }[] = [];
  const scoreAt = (lag: number, step: number) => {
    const start = Math.max(1, lag + 1), end = Math.min(reference.length, alternate.length + lag);
    if (end - start < 300) return 0;
    let cross = 0, energyA = 0, energyB = 0, peaks = 0;
    for (let i = start; i < end; i += step) {
      const a = reference[i] - reference[i - 1], b = alternate[i - lag] - alternate[i - lag - 1];
      if (Math.abs(a) > 2 && Math.abs(b) > 2) peaks++;
      cross += a * b; energyA += a * a; energyB += b * b;
    }
    return peaks >= Math.ceil(20 / step) && energyA && energyB ? cross / Math.sqrt(energyA * energyB) : 0;
  };
  // Evaluate each lag against a sparse sample so arbitrary offsets are not lost.
  for (let lag = -Math.min(maxLag, alternate.length - 300); lag <= Math.min(maxLag, reference.length - 300); lag++) {
    coarse.push({ lag, score: scoreAt(lag, stride) });
  }
  const finalists = coarse.sort((a, b) => b.score - a.score).slice(0, 24).map(item => ({ ...item, score: scoreAt(item.lag, 1) }))
    .sort((a, b) => b.score - a.score);
  const best = finalists[0];
  const rival = finalists.find(item => Math.abs(item.lag - best.lag) > 5);
  if (!best || best.score < 0.76 || (rival && best.score - rival.score < 0.09)) return undefined;
  return { offsetMs: best.lag * 20, confidence: Math.round(best.score * 100), method: 'waveform' as const };
}

export function switchCameraRange(clip: AutoCutClipCandidate, camera: MediaAsset, sync: CameraSync, switchOffsetMs: number) {
  const current = sync[clip.sourceVideoId ?? ''], next = sync[camera.id];
  if (clip.locked || !current || !next || Math.abs(current.driftMs ?? 0) > 100 || Math.abs(next.driftMs ?? 0) > 100) {
    throw new Error('Unlock the shot and verify both camera offsets before switching.');
  }
  if (!Number.isSafeInteger(switchOffsetMs) || switchOffsetMs < 0 || (switchOffsetMs > 0 && switchOffsetMs < 100) ||
      clip.durationMs - switchOffsetMs < 100) throw new Error('Leave at least 0.1 seconds in each part of the shot.');
  const sourceStart = clip.startMs + current.offsetMs + switchOffsetMs - next.offsetMs;
  const durationMs = clip.durationMs - switchOffsetMs;
  if (sourceStart < 0 || sourceStart + durationMs > camera.metadata.durationMs) throw new Error('That camera does not cover this timeline range.');
  const replacement = { ...clip, id: clip.id + ':camera:' + camera.id, sourceVideoId: camera.id, category: camera.filename,
    startMs: sourceStart, endMs: sourceStart + durationMs, durationMs, transcriptWords: [], thumbnailBase64: undefined,
    transitionBlack: undefined, qualityMeasurements: undefined, evidenceFrames: undefined };
  return switchOffsetMs ? [{ ...clip, endMs: clip.startMs + switchOffsetMs, durationMs: switchOffsetMs }, replacement] : [replacement];
}

export function recommendCamera(clip: AutoCutClipCandidate, assets: MediaAsset[], evidence: AutoCutClipCandidate[], sync: CameraSync) {
  const base = scoreAutoCutQuality(clip, { mode: 'cinematic' }).total;
  if (base === undefined) return undefined;
  return assets.flatMap(asset => {
    if (asset.id === clip.sourceVideoId) return [];
    try {
      const [replacement] = switchCameraRange(clip, asset, sync, 0);
      const window = evidence.find(item => item.sourceVideoId === asset.id && item.startMs <= replacement.startMs && item.endMs >= replacement.endMs &&
        item.transitionShot !== 'black' && !item.transitionBlack?.some(range => range.startMs < replacement.endMs && range.endMs > replacement.startMs));
      if (!window) return [];
      const score = scoreAutoCutQuality(window, { mode: 'cinematic' }).total;
      return score !== undefined && score >= base + 8 ? [{ asset, score, framing: window.cameraFraming }] : [];
    } catch { return []; }
  }).sort((a, b) => b.score - a.score)[0];
}
