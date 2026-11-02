import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { recordMediaOwner } from '../src/lib/media-access';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { commitTimeline, compileTimeline, createTimelineClip, createTimelineTrack, type TimelineAsset } from '../src/lib/timeline/model';
import { serveTimelineAssets } from '../src/lib/timeline/render-assets';
import { renderRemotionReelVideo } from '../src/lib/caption-maker/remotion-renderer';
import { probeVideo } from '../src/lib/ffmpeg';

const execute = promisify(execFile);
async function main() {
  const directory = path.join(APP_CONFIG.storageRoot, `qa_advanced_render_${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true }); await recordMediaOwner(directory, 'qa-advanced-render');
  const ffmpeg = getFfmpegPath(), red = path.join(directory, 'red.mp4'), tone = path.join(directory, 'tone.wav');
  await execute(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', red], { windowsHide: true });
  await execute(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', tone], { windowsHide: true });
  const server = await serveTimelineAssets(new Map([['red', red], ['tone', tone]]));
  try {
    const project = createEmptyCaptionProject('QA advanced render only'); project.outputSettings = { ...project.outputSettings, width: 320, height: 180, fps: 25 };
    project.autoSfxEnabled = false;
    const video = createTimelineTrack('video'), voice = { ...createTimelineTrack('audio'), solo: true }, bed = createTimelineTrack('music');
    const assets: TimelineAsset[] = [
      { id: 'red', fileUrl: server.url('red'), fileName: 'red.mp4', mediaType: 'video', durationMs: 2000, hasAudio: false },
      { id: 'tone', fileUrl: server.url('tone'), fileName: 'tone.wav', mediaType: 'audio', durationMs: 2000, hasAudio: true },
    ];
    const key = (timeMs: number, value: number) => ({ timeMs, value, easing: 'linear' as const });
    project.timeline = commitTimeline({ version: 1, enabled: true, fps: 25, tracks: [video, voice, bed], assets, captionSources: {}, markers: [], clips: [
      { ...createTimelineClip(video, assets[0], 0, 2000), motion: { channels: { x: [key(0, 0), key(1000, 50), key(2000, 0)], opacity: [key(0, 0), key(1000, 100)], saturation: [key(0, 100), key(1000, 100), key(1500, 0)] } } },
      { ...createTimelineClip(voice, assets[1], 0, 2000), audioKeyframes: [{ timeMs: 0, gain: 0 }, { timeMs: 500, gain: 1 }, { timeMs: 1000, gain: 1 }, { timeMs: 1500, gain: 0 }, { timeMs: 2000, gain: 0 }] },
      createTimelineClip(bed, assets[1], 0, 2000),
    ] });
    const output = path.join(directory, 'advanced.mp4');
    process.env.CHROME_PATH ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    await renderRemotionReelVideo({ timelinePlan: compileTimeline(project), outputPath: output, groups: [], words: [], style: project.captionStyle, outputSettings: project.outputSettings });
    const meta = await probeVideo(output); assert.ok(meta.hasAudio && Math.abs(meta.duration - 2) < 0.05);
    async function pixel(time: number, x: number) {
      const result = await execute(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', output, '-frames:v', '1', '-vf', `crop=2:2:${x}:20`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', windowsHide: true });
      return [...result.stdout.subarray(0, 3)];
    }
    const early = await pixel(0.2, 250), strong = await pixel(0.8, 250), shifted = await pixel(1, 10), late = await pixel(1.76, 250);
    assert.ok(strong[0] > early[0] * 2, `Opacity keyframes must affect pixels: ${early} → ${strong}`);
    assert.ok(shifted.every(v => v < 15), `Translation must expose black background: ${shifted}`);
    assert.ok(Math.abs(late[0] - late[1]) < 10 && Math.abs(late[1] - late[2]) < 10 && late[0] > 40, `Saturation effect keyframes must render grayscale: ${late}`);
    const samples = (await execute(ffmpeg, ['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', windowsHide: true })).stdout;
    function rms(start: number, end: number) { let sum = 0, count = 0; for (let i = Math.floor(start * 8000) * 2; i < Math.min(samples.length, end * 8000 * 2); i += 2) { sum += samples.readInt16LE(i) ** 2; count++; } return Math.sqrt(sum / Math.max(1, count)); }
    assert.ok(rms(0.65, 0.85) > rms(1.65, 1.85) * 5, 'Automation must silence the solo voice while the non-solo music stays excluded');
    await fs.mkdir('storage/qa-2026-11-01', { recursive: true }); await fs.copyFile(output, 'storage/qa-2026-11-01/advanced-render.mp4');
    console.log(JSON.stringify({ duration: meta.duration, pixels: { early, strong, shifted, late }, rms: { audible: rms(0.65, 0.85), quiet: rms(1.65, 1.85) } }));
    console.log('PASS: actual MP4 motion/opacity/effect pixels, audio automation/solo samples and exact shared-renderer timebase');
  } finally { await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
