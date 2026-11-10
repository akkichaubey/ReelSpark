import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { clippingProjectAccess, requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { assertSafePath } from '@/lib/storage';
import { APP_CONFIG, getFfmpegPath } from '@/lib/config';
import { correlateCameraAudio, type CameraSync } from '@/lib/auto-cut/multicamera';

const run = promisify(execFile);
export const runtime = 'nodejs';
const source = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/), filePath: z.string().min(1).max(4096), durationMs: z.number().int().positive().max(14400000) });

async function waveform(file: string, startMs: number, seconds: number, signal: AbortSignal) {
  const { stdout } = await run(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', String(startMs / 1000), '-i', file,
    '-map', '0:a:0', '-t', String(seconds), '-ac', '1', '-ar', '1000', '-f', 's16le', '-'],
  { encoding: 'buffer', maxBuffer: 512000, signal, timeout: 45000, windowsHide: true });
  const bins: number[] = [];
  for (let offset = 0; offset + 40 <= stdout.length; offset += 40) {
    let energy = 0;
    for (let i = offset; i < offset + 40; i += 2) energy += stdout.readInt16LE(i) ** 2;
    bins.push(Math.max(-80, 10 * Math.log10(energy / (20 * 32768 ** 2))));
  }
  return bins;
}

export async function POST(req: Request) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const body = z.object({ projectId: z.string().min(1), reference: source, cameras: z.array(source).min(1).max(3) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid camera sync request.' }, { status: 400 });
  const { projectId, reference, cameras } = body.data;
  const directory = await clippingProjectAccess(access.user.id, projectId);
  if (!directory) return NextResponse.json({ error: 'Project unavailable.' }, { status: 404 });
  const authorized = async (input: z.infer<typeof source>) => {
    const file = assertSafePath(path.resolve(APP_CONFIG.storageRoot, input.filePath), directory);
    if (!(await canReadMedia(access.user.id, file)) && !(await restorePrivateMedia(access.user.id, file))) throw new Error('Camera unavailable.');
    return file;
  };
  let referenceFile: string, referenceBins: number[];
  try {
    referenceFile = await authorized(reference);
    referenceBins = await waveform(referenceFile, 0, 180, req.signal);
  } catch {
    return NextResponse.json({ error: 'The reference camera has no readable audio. Set sync points manually or use separate takes.' }, { status: 422 });
  }
  const sync: CameraSync = { [reference.id]: { offsetMs: 0, confidence: 100, method: 'manual' } };
  const unavailable: string[] = [];
  for (const camera of cameras) {
    if (camera.id === reference.id) continue;
    req.signal.throwIfAborted();
    try {
      const file = await authorized(camera);
      const result = correlateCameraAudio(referenceBins, await waveform(file, 0, 180, req.signal));
      if (!result) { unavailable.push(camera.id); continue; }
      const later = Math.floor(Math.min(reference.durationMs, camera.durationMs + result.offsetMs) * 0.7);
      if (later >= 180000 && later - result.offsetMs >= 0) {
        try {
          const drift = correlateCameraAudio(await waveform(referenceFile, later, 25, req.signal),
            await waveform(file, later - result.offsetMs, 25, req.signal), 50);
          if (drift) sync[camera.id] = { ...result, driftMs: drift.offsetMs };
        } catch { req.signal.throwIfAborted(); }
      }
      sync[camera.id] ??= result;
    } catch { req.signal.throwIfAborted(); unavailable.push(camera.id); }
  }
  return NextResponse.json({ sync, unavailable }, { headers: { 'Cache-Control': 'private, no-store' } });
}
