import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { clippingProjectAccess, requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia, mediaUserNamespace } from '@/lib/media-access';
import { backupPrivateMedia, restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { APP_CONFIG, getFfmpegPath, getFfprobePath } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';
import { probeVideo } from '@/lib/ffmpeg';
import { rampTimeRatio, STORY_FPS } from '@/lib/auto-cut/story-ramp';
import { rampTimestampExpression } from '@/lib/auto-cut/story-ramp-render';

const run = promisify(execFile);
export const runtime = 'nodejs';
const input = z.object({
  projectId: z.string().min(1).max(160),
  filePath: z.string().min(1).max(4096),
  ranges: z.array(z.object({
    id: z.string().min(1).max(200), startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(), outputFrames: z.number().int().positive().max(3600),
    cap: z.number().min(1.01).max(4),
  })).min(1).max(4),
});

export async function POST(req: Request) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid speed-ramp request.' }, { status: 400 });
  const { projectId, filePath, ranges } = parsed.data;
  if (!(await clippingProjectAccess(access.user.id, projectId))) return NextResponse.json({ error: 'Project unavailable.' }, { status: 404 });
  try {
    const file = assertSafePath(path.resolve(APP_CONFIG.storageRoot, filePath), APP_CONFIG.storageRoot);
    if (!(await canReadMedia(access.user.id, file)) && !(await restorePrivateMedia(access.user.id, file))) {
      return NextResponse.json({ error: 'Source unavailable.' }, { status: 404 });
    }
    const media = await probeVideo(file);
    if (!media.width || media.aspectRatio === 'Audio') throw new Error('Speed ramps require video footage.');
    const stat = await fs.stat(file);
    const directory = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'trimmed', mediaUserNamespace(access.user.id));
    await fs.mkdir(directory, { recursive: true });
    assertSafePath(await fs.realpath(directory), await fs.realpath(APP_CONFIG.storageRoot));
    const options = { signal: req.signal, timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true };
    const result = [];
    for (const range of ranges) {
      req.signal.throwIfAborted();
      const seconds = (range.endMs - range.startMs) / 1000;
      if (seconds <= 0 || seconds > 120 || range.endMs > Math.round(media.duration * 1000) ||
          range.outputFrames >= Math.floor(seconds * STORY_FPS) ||
          range.outputFrames < Math.ceil(Math.floor(seconds * STORY_FPS) * rampTimeRatio(range.cap) - 1e-9)) {
        throw new Error('A speed ramp exceeds the source range or safe speed limit.');
      }
      const key = createHash('sha256').update(JSON.stringify([1, file, stat.size, stat.mtimeMs, stat.ctimeMs,
        range.startMs, range.endMs, range.outputFrames, range.cap])).digest('hex');
      const output = path.join(directory, 'story-' + key + '.mp4');
      if (!(await canReadMedia(access.user.id, output)) && !(await restorePrivateMedia(access.user.id, output))) {
        if (media.hasAudio) {
          const { stderr } = await run(getFfmpegPath(), ['-hide_banner', '-ss', String(range.startMs / 1000), '-t', String(seconds),
            '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-vn', '-f', 'null', '-'], options);
          const peak = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
          if (!peak || Number(peak[1]) > -40) throw new Error('A proposed ramp contains audible sound. Lock this scene at 1× and rebuild.');
        }
        const temporary = path.join(directory, randomUUID() + '.mp4');
        try {
          const curve = rampTimestampExpression(seconds, range.outputFrames, range.cap).replaceAll(',', '\\,');
          await run(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', String(range.startMs / 1000), '-t', String(seconds),
            '-i', file, '-map', '0:v:0', '-an', '-vf',
            'setpts=PTS-STARTPTS,setpts=' + curve + ',fps=30,tpad=stop_mode=clone:stop_duration=0.067,format=yuv420p',
            '-frames:v', String(range.outputFrames), '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-movflags', '+faststart', temporary], options);
          const { stdout } = await run(getFfprobePath(), ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
            '-show_entries', 'stream=nb_read_frames', '-of', 'json', temporary], options);
          if (Number(JSON.parse(stdout).streams?.[0]?.nb_read_frames) !== range.outputFrames) throw new Error('Speed ramp frame count could not be verified.');
          await fs.rename(temporary, output);
          try { await backupPrivateMedia(access.user.id, output); }
          catch (error) { await fs.unlink(output).catch(() => {}); throw error; }
        } finally { await fs.unlink(temporary).catch(() => {}); }
      }
      result.push({ id: range.id, url: '/api/files/' + path.relative(APP_CONFIG.storageRoot, output).split(path.sep).join('/'),
        durationMs: Math.ceil(range.outputFrames * 1000 / STORY_FPS) });
    }
    return NextResponse.json({ assets: result });
  } catch (error) {
    if (req.signal.aborted) return NextResponse.json({ error: 'Speed ramp cancelled.' }, { status: 499 });
    const message = error instanceof Error && !('cmd' in error) ? error.message : 'Speed ramp rendering failed. Try again or use 1×.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
