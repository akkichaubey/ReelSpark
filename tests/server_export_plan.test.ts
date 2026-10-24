import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { APP_CONFIG } from '../src/lib/config';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { createServerExportPlan } from '../src/lib/clipping-studio/server-export-plan';
import { getFfmpegBinary } from '../src/lib/clipping-studio/export-engine';
import { probeVideo } from '../src/lib/ffmpeg';
import type { VideoMetadata } from '../src/lib/types';

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-export-plan-'));
  const original = APP_CONFIG.storageRoot;
  APP_CONFIG.storageRoot = root;
  try {
    const project = await clippingProjectAccess('alice', 'project', true);
    assert.ok(project);
    const file = path.join(project, 'source.mp4');
    await fs.writeFile(file, 'fixture');
    const probe = async (): Promise<VideoMetadata> => ({ duration: 2, width: 160, height: 90, aspectRatio: '16:9', fps: 30, format: 'mp4', sizeBytes: 7, hasAudio: true });
    const body = {
      jobId: 'job', projectId: 'project', targetId: 'clip', jobType: 'single_clip',
      sources: [{ localPath: file, startMs: 0, endMs: 500, clipId: 'clip' }],
      filename: '../../unsafe file', outputSettings: { outputFormat: 'mp4', qualityProfile: 'fast' },
    };
    const single = await createServerExportPlan('alice', body, probe);
    assert.ok(single.outputPath.startsWith(path.join(project, 'exports') + path.sep));
    assert.equal(single.args.at(-1), single.outputPath);
    assert.equal(single.totalDurationMs, 500);
    assert.notEqual((await createServerExportPlan('alice', body, probe)).outputPath, single.outputPath);
    await assert.rejects(createServerExportPlan('bob', body, probe), /Project not found/);
    await assert.rejects(createServerExportPlan('alice', { ...body, args: ['-i', 'secret'] }, probe), /Invalid export options/);
    await assert.rejects(createServerExportPlan('alice', { ...body, outputPath: '/tmp/overwrite' }, probe), /Invalid export options/);
    await assert.rejects(createServerExportPlan('alice', { ...body, sources: [{ ...body.sources[0], endMs: 3000 }] }, probe), /exceeds source/);
    await assert.rejects(createServerExportPlan('alice', { ...body, outputSettings: { outputFormat: 'evil' } }, probe), /Invalid export options/);
    await assert.rejects(createServerExportPlan('alice', { ...body, sources: [{ ...body.sources[0], transition: 'crossfade' }] }, probe), /Crossfade export is not implemented/);
    await assert.rejects(createServerExportPlan('alice', { ...body, sources: [{ ...body.sources[0], localPath: 'https://attacker.example/input' }] }, probe), /Media not found/);
    const merged = await createServerExportPlan('alice', { ...body, jobType: 'merge_recipe', sources: [...body.sources, ...body.sources] }, probe);
    assert.equal(merged.totalDurationMs, 1000);
    assert.ok(merged.args.some(arg => arg.includes('concat=n=2')));
    const audio = await createServerExportPlan('alice', { ...body, jobType: 'merge_recipe', sources: [...body.sources, ...body.sources], outputSettings: { outputFormat: 'mp3', normalizeAudio: true } }, probe);
    assert.ok(audio.args.some(arg => arg.includes('v=0:a=1')));
    console.log('PASS: owned source/server output, strict schema, raw command/path rejection, duration limits, single/video/audio merge planning');

    if (process.argv.includes('--real')) {
      const run = promisify(execFile);
      const ffmpeg = getFfmpegBinary();
      await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file], { timeout: 30000, windowsHide: true });
      for (const jobType of ['single_clip', 'merge_recipe']) {
        const plan = await createServerExportPlan('alice', { ...body, jobType, sources: jobType === 'single_clip' ? body.sources : [...body.sources, ...body.sources] });
        await run(ffmpeg, plan.args, { timeout: 30000, windowsHide: true });
        const result = await probeVideo(plan.outputPath);
        assert.ok(result.sizeBytes > 0 && result.hasAudio);
        assert.ok(Math.abs(result.duration - plan.totalDurationMs / 1000) < 0.2);
      }
      const audioPlan = await createServerExportPlan('alice', {
        ...body, jobType: 'merge_recipe', sources: [...body.sources, ...body.sources],
        outputSettings: { outputFormat: 'mp3', normalizeAudio: true },
      });
      await run(ffmpeg, audioPlan.args, { timeout: 30000, windowsHide: true });
      const audioResult = await probeVideo(audioPlan.outputPath);
      assert.equal(audioResult.aspectRatio, 'Audio');
      assert.ok(audioResult.hasAudio && Math.abs(audioResult.duration - 1) < 0.2);
      console.log('PASS: real local FFmpeg single-clip, two-segment video merge and normalized MP3 merge with duration verification');
    }
  } finally {
    APP_CONFIG.storageRoot = original;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
