import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFfmpegPath } from '../config';
import { probeVideo } from '../ffmpeg';
import type { AutoCutClipCandidate, AutoCutSettings, CookingActivity, SceneCut } from './types';

const run = promisify(execFile);
const options = (signal?: AbortSignal) => ({ signal, timeout: 600_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });

/** FFmpeg scene-change measurements, not object/action recognition. */
export async function detectSceneCuts(videoFilePath: string, threshold = 0.28, maxScenes = 80, signal?: AbortSignal, durationMs?: number): Promise<SceneCut[]> {
  const cuts: SceneCut[] = [];
  const chunkMs = 120_000;
  for (let offset = 0; offset < (durationMs ?? 1); offset += chunkMs) {
    signal?.throwIfAborted();
    // Overlap by one second so a cut at the chunk boundary has a preceding frame.
    const start = Math.max(0, offset - 1000);
    const { stderr } = await run(getFfmpegPath(), ['-hide_banner',
      ...(start ? ['-ss', String(start / 1000)] : []),
      ...(durationMs ? ['-t', String((Math.min(durationMs, offset + chunkMs) - start) / 1000)] : []),
      '-i', videoFilePath, '-an', '-vf', `select='gt(scene,${threshold})',metadata=print`, '-f', 'null', '-'], options(signal));
    let time: number | undefined;
    for (const line of stderr.split(/\r?\n/)) {
      const pts = line.match(/pts_time:\s*(\d+(?:\.\d+)?)/);
      if (pts) time = Number(pts[1]) + start / 1000;
      const score = line.match(/lavfi\.scene_score=(\d+(?:\.\d+)?)/);
      if (score && time !== undefined) {
        if (time >= offset / 1000 && (!cuts.length || time - cuts[cuts.length - 1].timestampSec >= 0.8)) {
          cuts.push({ timestampSec: time, score: Number(score[1]) });
        }
        time = undefined;
      }
    }
  }
  if (cuts.length <= maxScenes) return cuts;
  if (maxScenes < 2) return cuts.slice(0, maxScenes);
  return Array.from({ length: maxScenes }, (_, index) => cuts[Math.round(index * (cuts.length - 1) / (maxScenes - 1))]);
}

type VisualChunk = { intervals: { startMs: number; endMs: number }[]; gradual: SceneCut[]; motionMs: number[] };
type VisualCheckpoint = {
  read: (offset: number) => Promise<VisualChunk | undefined>;
  write: (offset: number, result: VisualChunk) => Promise<void>;
  onProgress?: (processedMs: number, totalMs: number) => Promise<void>;
};

export async function detectVisualIntervals(file: string, durationMs: number, signal?: AbortSignal, checkpoint?: VisualCheckpoint) {
  const intervals: { startMs: number; endMs: number }[] = [];
  const gradual: SceneCut[] = [];
  const motionMs: number[] = [];
  const chunkMs = 120_000;
  for (let offset = 0; offset < durationMs; offset += chunkMs) {
    signal?.throwIfAborted();
    const length = Math.min(chunkMs, durationMs - offset);
    let chunk = await checkpoint?.read(offset);
    if (!chunk) {
      const { stdout, stderr: diagnostics } = await run(getFfmpegPath(), ['-hide_banner', '-ss', String(offset / 1000),
        '-i', file, '-t', String(length / 1000), '-an', '-vf',
        'blackdetect=d=0.12:pic_th=0.98:pix_th=0.10,fps=12,scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG,format=gray',
        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ...options(signal), encoding: 'buffer' });
      const stderr = diagnostics.toString();
      chunk = { intervals: [], gradual: [], motionMs: [] };
      for (const match of stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) {
        const startMs = offset + Math.round(Number(match[1]) * 1000);
        const endMs = Math.min(offset + length, offset + Math.round(Number(match[2]) * 1000));
        if (startMs < endMs) chunk.intervals.push({ startMs, endMs });
      }
      const samples = [...stderr.matchAll(/pts_time:([\d.]+)[^\r\n]*\r?\n[^\r\n]*lavfi\.signalstats\.YAVG=([\d.]+)/g)]
        .map(match => ({ seconds: Number(match[1]), luma: Number(match[2]) }));
      for (let index = 0; index + 6 < samples.length; index++) {
        const window = samples.slice(index, index + 7);
        const changes = window.slice(1).map((sample, i) => sample.luma - window[i].luma);
        const change = window[6].luma - window[0].luma;
        if (Math.abs(change) < 26 || changes.some(step => Math.sign(change) * step < 0.6 || Math.abs(step) > 19)) continue;
        const fade = Math.min(window[0].luma, window[6].luma) <= 30;
        // Monotonic brightness alone cannot distinguish a dissolve from exposure changes.
        if (!fade) continue;
        const timestampSec = offset / 1000 + window[3].seconds;
        if (timestampSec * 1000 < durationMs) chunk.gradual.push({ timestampSec, score: 0.65, kind: 'fade' });
        index += 11;
      }
      const frameBytes = 64 * 36;
      const frames = Math.floor(stdout.length / frameBytes);
      for (let index = 1; index < frames; index++) {
        const previous = (index - 1) * frameBytes;
        const current = index * frameBytes;
        let distance = 0;
        for (let pixel = 0; pixel < frameBytes; pixel++) distance += Math.abs(stdout[current + pixel] - stdout[previous + pixel]);
        if (distance / frameBytes >= 8) chunk.motionMs.push(offset + Math.round(index * 1000 / 12));
      }
      for (let index = 0; index + 6 < frames; index++) {
        const timestampSec = offset / 1000 + (index + 3) / 12;
        if (chunk.gradual.some(cut => Math.abs(cut.timestampSec - timestampSec) < 0.75)) continue;
        if (matchesDissolve(stdout, frameBytes, index)) {
          chunk.gradual.push({ timestampSec, score: 0.7, kind: 'dissolve' });
          index += 8;
        }
      }
      signal?.throwIfAborted();
      await checkpoint?.write(offset, chunk);
    }
    gradual.push(...chunk.gradual);
    motionMs.push(...chunk.motionMs);
    for (const { startMs, endMs } of chunk.intervals) {
      const previous = intervals.at(-1);
      if (previous && startMs - previous.endMs <= 100) previous.endMs = Math.max(previous.endMs, endMs);
      else intervals.push({ startMs, endMs });
    }
    await checkpoint?.onProgress?.(offset + length, durationMs);
  }
  return { intervals, gradual, motionMs };
}

function matchesDissolve(pixels: Buffer, frameBytes: number, index: number) {
  const start = index * frameBytes;
  const end = (index + 6) * frameBytes;
  let energy = 0;
  let change = 0;
  for (let pixel = 0; pixel < frameBytes; pixel++) {
    const delta = pixels[end + pixel] - pixels[start + pixel];
    energy += delta * delta;
    change += Math.abs(delta);
  }
  if (change / frameBytes < 19) return false;
  let previousMix = 0;
  for (const frame of [1, 3, 5]) {
    const position = (index + frame) * frameBytes;
    let projection = 0;
    let residual = 0;
    for (let pixel = 0; pixel < frameBytes; pixel++) {
      projection += (pixels[position + pixel] - pixels[start + pixel]) * (pixels[end + pixel] - pixels[start + pixel]);
    }
    const mix = projection / energy;
    if (mix <= previousMix + 0.08 || mix >= 0.94) return false;
    for (let pixel = 0; pixel < frameBytes; pixel++) {
      residual += Math.abs(pixels[position + pixel] - pixels[start + pixel] -
        mix * (pixels[end + pixel] - pixels[start + pixel]));
    }
    if (residual / change > 0.14) return false;
    previousMix = mix;
  }
  return previousMix > 0.65;
}

export async function analyzeMediaForAutoCut(videoFilePath: string, settings: AutoCutSettings, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const meta = await probeVideo(videoFilePath);
  if (!Number.isFinite(meta.duration) || meta.duration <= 0 || meta.duration > 14400) throw new Error('Choose valid media up to four hours long.');
  const totalDurationMs = Math.floor(meta.duration * 1000);
  const sceneCuts = meta.width > 0 ? await detectSceneCuts(videoFilePath, settings.intensity === 'aggressive' ? 0.18 : settings.intensity === 'minimal' ? 0.4 : 0.28, 500, signal, totalDurationMs) : [];
  const silences: { start: number; end: number }[] = [];
  if (meta.hasAudio) {
    const minimum = settings.silenceRemoval === 'light' ? 1.5 : settings.silenceRemoval === 'aggressive' ? 0.3 : 0.6;
    const { stderr } = await run(getFfmpegPath(), ['-hide_banner', '-i', videoFilePath, '-map', '0:a:0', '-vn', '-af',
      `silencedetect=noise=-28dB:d=${minimum}`, '-f', 'null', '-'], options(signal));
    let start: number | undefined;
    for (const line of stderr.split(/\r?\n/)) {
      const s = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
      if (s) start = Math.max(0, Number(s[1]));
      const e = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/);
      if (e && start !== undefined) { silences.push({ start, end: Math.min(meta.duration, Number(e[1])) }); start = undefined; }
    }
    if (start !== undefined) silences.push({ start, end: meta.duration });
  }
  signal?.throwIfAborted();
  const boundaries = new Set([0, totalDurationMs]);
  for (const cut of sceneCuts) boundaries.add(Math.max(0, Math.min(totalDurationMs, Math.round(cut.timestampSec * 1000))));
  for (const silence of silences) { boundaries.add(Math.round(silence.start * 1000)); boundaries.add(Math.min(totalDurationMs, Math.round(silence.end * 1000))); }
  const points = [...boundaries].sort((a, b) => a - b);
  const candidates: AutoCutClipCandidate[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    const silent = silences.some(s => (start + end) / 2000 >= s.start && (start + end) / 2000 <= s.end);
    const preserveSilentVisuals = meta.width > 0 && (settings.mode === 'cooking_recipe' || settings.mode === 'cinematic' || settings.sceneSelection === 'visual' || (settings.analysisMethod === 'semantic' && settings.mode !== 'podcast'));
    if (silent && settings.silenceRemoval !== 'disabled' && !preserveSilentVisuals) continue;
    const baseShot = settings.mode === 'fast_paced' || settings.pacing === 'fast' ? 3000 : settings.pacing === 'slow' || settings.mode === 'cinematic' ? 8000 : 5000;
    const shot = Math.round(baseShot * (settings.intensity === 'minimal' ? 1.5 : settings.intensity === 'aggressive' ? 0.65 : 1));
    for (let cursor = start; cursor < end; cursor += shot) {
      const endMs = Math.min(end, cursor + shot);
      if (endMs - cursor < 200) continue;
      const cut = sceneCuts.find(c => Math.abs(c.timestampSec * 1000 - cursor) < 500);
      const visualActionScore = cut ? Math.min(100, Math.round(cut.score * 100)) : 0;
      const audioScore = meta.hasAudio && !silent ? 70 : 0;
      const weight = settings.sceneSelection === 'visual' ? 0.85 : settings.sceneSelection === 'speech' ? 0.15 : 0.5;
      const score = Math.round(visualActionScore * weight + audioScore * (1 - weight));
      candidates.push({ id: `autocut_${cursor}_${endMs}`, startMs: cursor, endMs, durationMs: endMs - cursor,
        score, confidence: 0, reason: `${cut ? 'Measured scene change' : 'Continuous source footage'}; ${meta.hasAudio ? silent ? 'silent audio' : 'audio activity (speech not verified)' : 'no audio track'}.`,
        category: settings.mode === 'cooking_recipe' ? 'Recipe sequence — review step' : 'Scene / audio estimate',
        visualActionScore, audioScore, measuredSilence: !meta.hasAudio || silent, selected: true, speedMultiplier: 1, transitionToNext: settings.transition });
    }
  }
  return { totalDurationMs, candidates, hasAudio: meta.hasAudio, hasVideo: meta.width > 0, cookingDetected: false, detectedActivities: [] as CookingActivity[],
    speechDetected: false, sceneCutCount: sceneCuts.length, silenceCount: silences.length, sceneCuts };
}

export async function extractFrameBase64(videoFilePath: string, timestampSec: number, width = 320, signal?: AbortSignal): Promise<string | null> {
  const { stdout } = await run(getFfmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', Math.max(0, timestampSec).toFixed(3),
    '-i', videoFilePath, '-vframes', '1', '-vf', `scale=${width}:-1`, '-q:v', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
    { ...options(signal), timeout: 30_000, encoding: 'buffer' });
  return stdout.length ? `data:image/jpeg;base64,${stdout.toString('base64')}` : null;
}
