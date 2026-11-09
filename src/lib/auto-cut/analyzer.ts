import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFfmpegPath } from '../config';
import { probeVideo } from '../ffmpeg';
import type { AutoCutClipCandidate, AutoCutSettings, CookingActivity, SceneCut } from './types';

const run = promisify(execFile);
const options = (signal?: AbortSignal) => ({ signal, timeout: 600_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });

/** FFmpeg scene-change measurements, not object/action recognition. */
export async function detectSceneCuts(videoFilePath: string, threshold = 0.28, maxScenes = 80, signal?: AbortSignal): Promise<SceneCut[]> {
  const { stderr } = await run(getFfmpegPath(), ['-hide_banner', '-i', videoFilePath, '-an', '-vf',
    `select='gt(scene,${threshold})',metadata=print`, '-f', 'null', '-'], options(signal));
  const cuts: SceneCut[] = [];
  let time: number | undefined;
  for (const line of stderr.split(/\r?\n/)) {
    const pts = line.match(/pts_time:\s*(\d+(?:\.\d+)?)/);
    if (pts) time = Number(pts[1]);
    const score = line.match(/lavfi\.scene_score=(\d+(?:\.\d+)?)/);
    if (score && time !== undefined) {
      if (!cuts.length || time - cuts[cuts.length - 1].timestampSec >= 0.8) cuts.push({ timestampSec: time, score: Number(score[1]) });
      time = undefined;
      if (cuts.length >= maxScenes) break;
    }
  }
  return cuts;
}

export async function analyzeMediaForAutoCut(videoFilePath: string, settings: AutoCutSettings, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const meta = await probeVideo(videoFilePath);
  if (!Number.isFinite(meta.duration) || meta.duration <= 0 || meta.duration > 14400) throw new Error('Choose valid media up to four hours long.');
  const totalDurationMs = Math.floor(meta.duration * 1000);
  const sceneCuts = meta.width > 0 ? await detectSceneCuts(videoFilePath, settings.intensity === 'aggressive' ? 0.18 : settings.intensity === 'minimal' ? 0.4 : 0.28, 500, signal) : [];
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
        visualActionScore, audioScore, selected: true, speedMultiplier: 1, transitionToNext: settings.transition });
    }
  }
  return { totalDurationMs, candidates, hasAudio: meta.hasAudio, hasVideo: meta.width > 0, cookingDetected: false, detectedActivities: [] as CookingActivity[],
    speechDetected: false, sceneCutCount: sceneCuts.length, silenceCount: silences.length };
}

export async function extractFrameBase64(videoFilePath: string, timestampSec: number, width = 320, signal?: AbortSignal): Promise<string | null> {
  const { stdout } = await run(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, timestampSec).toFixed(3),
    '-i', videoFilePath, '-vframes', '1', '-vf', `scale=${width}:-1`, '-q:v', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
    { ...options(signal), timeout: 30_000, encoding: 'buffer' });
  return stdout.length ? `data:image/jpeg;base64,${stdout.toString('base64')}` : null;
}
