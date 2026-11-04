import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFfmpegPath, getFfprobePath } from '../src/lib/config';
import { mergeThumbnailIntoVideo } from '../src/lib/caption-maker/thumbnail-merger';
import { THUMBNAIL_COVER_SECONDS, thumbnailCoverFrameSeconds } from '../src/lib/caption-maker/thumbnail-cover';

const execute = promisify(execFile);
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-cover-'));
  const ffmpeg = getFfmpegPath(), cover = path.join(directory, 'green.png');
  await execute(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90', '-frames:v', '1', '-threads', '1', cover], { windowsHide: true });
  const audioHash = async (file: string) => (await execute(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-hash', 'SHA256', '-'], { windowsHide: true })).stdout.trim();
  const probe = async (file: string) => JSON.parse((await execute(getFfprobePath(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true })).stdout);
  const pixel = async (file: string, frame: number) => {
    const { stdout } = await execute(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', `select=eq(n\\,${frame}),scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', windowsHide: true });
    return [...stdout.subarray(0, 3)];
  };
  for (const fps of [25, 60]) {
    const source = path.join(directory, `source-${fps}.mp4`);
    await execute(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=c=red:s=160x90:r=${fps}:d=2`, '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source], { windowsHide: true });
    const original = await probe(source), originalHash = await audioHash(source);
    for (const mode of ['intro_hook', 'intro_and_poster', 'poster_only'] as const) {
      const output = path.join(directory, `${fps}-${mode}.mp4`);
      await mergeThumbnailIntoVideo({ videoPath: source, thumbnailPath: cover, outputPath: output, mergeMode: mode, introDuration: THUMBNAIL_COVER_SECONDS, width: 160, height: 90 });
      const result = await probe(output);
      assert.ok(Math.abs(Number(result.format.duration) - Number(original.format.duration)) < 0.001, 'No duration shift');
      assert.equal(result.streams[0].nb_frames, original.streams[0].nb_frames, 'No extra playable frames');
      assert.equal(result.streams[0].start_time, original.streams[0].start_time);
      assert.equal(result.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio').start_time,
        original.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio').start_time, 'Audio start time unchanged');
      assert.equal(result.streams.filter((stream: { disposition?: { attached_pic?: number } }) => stream.disposition?.attached_pic === 1).length,
        mode === 'intro_hook' ? 0 : 1, 'Container artwork matches selected strategy');
      assert.equal(await audioHash(output), originalHash, 'Audio packets unchanged');
      const first = await pixel(output, 0), next = await pixel(output, 1);
      assert.ok(mode === 'poster_only' ? first[0] > 200 && first[1] < 20 : first[1] > 200 && first[0] < 20, 'First frame matches selected export strategy');
      assert.ok(next[0] > 200 && next[1] < 20, 'Video resumes on the very next frame');
      console.log(`PASS ${fps} FPS ${mode}: ${result.streams[0].nb_frames} frames, unchanged audio/duration, first=${first}, next=${next}`);
    }
    const first = await pixel(source, 0);
    assert.ok(first[0] > 200 && first[1] < 20, 'Without-thumbnail source remains unchanged');
    assert.equal(thumbnailCoverFrameSeconds(fps), 1 / fps);
  }
  console.log(`PASS cover media checks. QA-only artifacts: ${directory}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
