import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { getFfmpegPath } from '../config';
import type { AutoCutClipCandidate } from './types';
import { QUALITY_VERSION, QualityMeasurementsSchema, type QualityMeasurements } from './quality';
import { measureQualityFrame, qualityFrameSize, reduceFingerprintFrame } from './quality-measurements';

const run = promisify(execFile);
const edge = 24;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const cachedSource = z.object({ hash: digest });
const frameHash = z.string().regex(/^[a-f0-9]{16}$/);

async function cached<T>(file: string, schema: z.ZodType<T>, build: () => Promise<T>): Promise<T> {
  try {
    return schema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch { /* Recompute missing or invalid cache entries. */ }
  const result = await build();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(result), { flag: 'wx' });
  } catch { /* Analysis can still use the freshly measured evidence. */ }
  return result;
}

function fingerprint(pixels: Buffer, inset: number) {
  const width = edge - 2 * inset;
  let bits = 0, contrast = 0;
  const rows: string[] = [];
  for (let y = 0; y < 8; y++) {
    const row = (inset + Math.round(y * (width - 1) / 7)) * edge + inset;
    for (let x = 0; x < 8; x++) {
      const delta = pixels[row + Math.round(x * (width - 1) / 8)] -
        pixels[row + Math.round((x + 1) * (width - 1) / 8)];
      bits = (bits << 1) | Number(delta > 0);
      contrast += Math.abs(delta);
    }
    rows.push(bits.toString(16).padStart(2, '0'));
    bits = 0;
  }
  return contrast >= 160 ? rows.join('') : null;
}

export async function fingerprintDuplicateScenes(file: string, cacheDir: string, clips: AutoCutClipCandidate[],
  media: { hasVideo: boolean; hasAudio: boolean }, signal?: AbortSignal) {
  const stat = await fs.stat(file);
  const fileKey = createHash('sha256').update(JSON.stringify([file, stat.size, stat.mtimeMs, stat.ctimeMs])).digest('hex');
  const { hash } = await cached(path.join(cacheDir, 'duplicates-v1', fileKey + '.json'), cachedSource, async () => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
    return { hash: hash.digest('hex') };
  });
  const indexes = Array.from({ length: Math.min(clips.length, 48) }, (_, index) =>
    Math.round(index * (clips.length - 1) / Math.max(1, Math.min(clips.length, 48) - 1)));
  const sampled = new Set(indexes);
  const result: AutoCutClipCandidate[] = [];
  for (const [index, clip] of clips.entries()) {
    signal?.throwIfAborted();
    let frames: string[][] | undefined;
    const qualityMeasurements: QualityMeasurements = { version: QUALITY_VERSION, frames: [] };
    const eligible = media.hasVideo && sampled.has(index);
    if (eligible && clip.durationMs >= 350) {
      const key = createHash('sha256').update(JSON.stringify([hash, clip.startMs, clip.endMs])).digest('hex');
      const cacheFile = path.join(cacheDir, 'duplicates-v1', key + `-frames-motion-v1-quality-v${QUALITY_VERSION}.json`);
      const sampledFrames = await cached(cacheFile, z.object({ hashes: z.array(z.array(frameHash).max(2)).length(3),
        measurements: QualityMeasurementsSchema.shape.frames }), async () => {
        const samples: string[][] = [];
        const measurements: QualityMeasurements['frames'] = [];
        for (const fraction of [0.2, 0.5, 0.8]) {
          const timeMs = Math.floor(clip.startMs + clip.durationMs * fraction);
          const { stdout } = await run(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', (timeMs / 1000).toFixed(3), '-i', file,
            '-map', '0:v:0', '-frames:v', '2', '-vf', `fps=12,scale=${qualityFrameSize}:${qualityFrameSize}:flags=area,format=gray`, '-threads', '1', '-f', 'rawvideo', '-'],
          { encoding: 'buffer', signal, timeout: 15000, maxBuffer: 16384, windowsHide: true });
          const bytes = qualityFrameSize ** 2;
          if (stdout.length < bytes) { samples.push([]); continue; }
          const first = stdout.subarray(0, bytes);
          const next = stdout.length >= 2 * bytes && timeMs + 84 < clip.endMs ? stdout.subarray(bytes, 2 * bytes) : undefined;
          measurements.push(measureQualityFrame(first, timeMs, next));
          const reduced = reduceFingerprintFrame(first);
          samples.push([...new Set([fingerprint(reduced, 0), fingerprint(reduced, 2)].filter((value): value is string => value !== null))]);
        }
        return { hashes: samples, measurements };
      }).catch(() => { signal?.throwIfAborted(); return undefined; });
      frames = sampledFrames?.hashes;
      qualityMeasurements.frames = sampledFrames?.measurements ?? [];
    }
    let audio: number[] | undefined;
    if (sampled.has(index) && media.hasAudio && clip.durationMs >= 350) {
      const key = `${hash}-${clip.startMs}-${clip.endMs}-audio-quality-v${QUALITY_VERSION}.json`;
      const signalEvidence = await cached(path.join(cacheDir, 'duplicates-v1', key), z.object({
        levels: z.array(z.number().int().min(-120).max(0)).max(60), measurement: QualityMeasurementsSchema.shape.audio,
      }), async () => {
        const { stdout } = await run(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', (clip.startMs / 1000).toFixed(3), '-i', file,
          '-map', '0:a:0', '-t', String(Math.min(3, clip.durationMs / 1000)), '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
        { encoding: 'buffer', signal, timeout: 15000, maxBuffer: 65536, windowsHide: true });
        const levels: number[] = [];
        let totalEnergy = 0, clipped = 0;
        for (let offset = 0; offset + 800 <= stdout.length && levels.length < 60; offset += 800) {
          let energy = 0;
          for (let i = offset; i < offset + 800; i += 2) {
            const sample = stdout.readInt16LE(i) / 32768;
            if (Math.abs(sample) >= 0.99) clipped++;
            energy += sample ** 2;
          }
          totalEnergy += energy;
          levels.push(Math.max(-120, Math.round(10 * Math.log10(energy / 400))));
        }
        const count = levels.length * 400;
        return { levels, measurement: count ? { rmsDb: Math.max(-120, Math.round(10 * Math.log10(totalEnergy / count))),
          clipped: clipped / count, startMs: clip.startMs, endMs: clip.startMs + levels.length * 50 } : undefined };
      }).catch(() => { signal?.throwIfAborted(); return undefined; });
      audio = signalEvidence?.levels;
      qualityMeasurements.audio = signalEvidence?.measurement;
    }
    result.push({ ...clip, duplicateEvidence: { contentHash: hash, frames, audio }, qualityMeasurements });
  }
  return result;
}
