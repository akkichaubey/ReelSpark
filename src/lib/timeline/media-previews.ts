import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { APP_CONFIG, getFfmpegPath } from "../config";
import { assertSafePath } from "../storage";
import { mediaUserNamespace, recordMediaOwner } from "../media-access";
import { resolveTimelineAsset } from "./render-assets";
import { probeVideo } from "../ffmpeg";
import { thumbnailSampleTimes } from './thumbnails';
import { registerStorageTask } from "../storage-runtime";

const execute = promisify(execFile);
export interface TimelineMediaPreview {
  durationMs: number;
  peaks: number[];
  thumbnails: string[];
  hasAudio: boolean;
  thumbnailTimesMs?: number[];
}
const pending = new Map<string, Promise<TimelineMediaPreview>>();

/** Stream PCM into fixed-size peak buckets. A long video is never buffered in browser or Node memory. */
export async function extractWaveform(
  filename: string,
  durationSeconds: number,
  signal?: AbortSignal,
): Promise<number[]> {
  const bucketCount = Math.max(
    64,
    Math.min(2048, Math.ceil(durationSeconds * 20)),
  );
  const peaks = new Array<number>(bucketCount).fill(0);
  const samplesPerBucket = Math.max(
    1,
    Math.ceil((durationSeconds * 8000) / bucketCount),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      getFfmpegPath(),
      [
        "-v",
        "error",
        "-i",
        filename,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { windowsHide: true, signal },
    );
    let sample = 0;
    let tail: Buffer | undefined;
    let errorText = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const data = tail ? Buffer.concat([tail, chunk]) : chunk;
      const size = data.length - (data.length % 2);
      for (let offset = 0; offset < size; offset += 2) {
        const index = Math.min(
          bucketCount - 1,
          Math.floor(sample++ / samplesPerBucket),
        );
        peaks[index] = Math.max(
          peaks[index],
          Math.abs(data.readInt16LE(offset)) / 32768,
        );
      }
      tail = size < data.length ? Buffer.from(data.subarray(size)) : undefined;
    });
    child.stderr.on("data", (chunk) => {
      if (errorText.length < 2000) errorText += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(peaks.map((peak) => Math.round(peak * 10000) / 10000))
        : reject(new Error(errorText || "Waveform generation failed")),
    );
  });
}

export async function timelineMediaPreview(
  owner: string,
  url: string,
  origin: string,
  signal?: AbortSignal,
): Promise<TimelineMediaPreview> {
  const source = await resolveTimelineAsset(owner, url, origin);
  const stat = await fs.stat(source);
  const key = createHash("sha256")
    .update(`${owner}:${source}:${stat.size}:${stat.mtimeMs}:v2`)
    .digest("hex");
  const directory = assertSafePath(
    path.join(
      APP_CONFIG.storageRoot,
      "caption-maker",
      `asset_preview_${mediaUserNamespace(owner).slice(0, 16)}_${key.slice(0, 24)}`,
    ),
  );
  const cache = path.join(directory, "preview.json");
  try {
    return JSON.parse(await fs.readFile(cache, "utf8")) as TimelineMediaPreview;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (pending.has(key)) return pending.get(key)!;
  const generation = (async () => {
    await recordMediaOwner(directory, owner);
    assertSafePath(
      await fs.realpath(directory),
      await fs.realpath(APP_CONFIG.storageRoot),
    );
    const done = registerStorageTask({
      id: `preview_${randomUUID()}`,
      ownerId: owner,
      kind: "transcode",
      paths: [source, directory],
    });
    try {
      const metadata = await probeVideo(source);
      if (
        !Number.isFinite(metadata.duration) ||
        metadata.duration <= 0 ||
        metadata.duration > 14_400
      )
        throw new Error("Preview media duration is unsupported.");
      const peaks = metadata.hasAudio
        ? await extractWaveform(source, metadata.duration, signal)
        : [];
      const thumbnails: string[] = [];
      const thumbnailTimesMs = metadata.videoCodec && metadata.width && metadata.height ? thumbnailSampleTimes(Math.round(metadata.duration * 1000)) : [];
      if (metadata.videoCodec && metadata.width && metadata.height)
        for (let index = 0; index < thumbnailTimesMs.length; index++) {
          const sampleTime = thumbnailTimesMs[index] / 1000;
          const target = path.join(directory, `frame_${index}.jpg`);
          await execute(
            getFfmpegPath(),
            [
              "-v",
              "error",
              "-y",
              "-ss",
              String(sampleTime),
              "-i",
              source,
              "-frames:v",
              "1",
              "-vf",
              "scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2",
              "-an",
              target,
            ],
            { windowsHide: true, signal },
          );
          thumbnails.push(
            `/api/files/${path.relative(APP_CONFIG.storageRoot, target).split(path.sep).join("/")}`,
          );
        }
      const result = {
        durationMs: Math.round(metadata.duration * 1000),
        peaks,
        thumbnails,
        hasAudio: metadata.hasAudio,
        thumbnailTimesMs,
      };
      const temporary = `${cache}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(result));
        await fs.rename(temporary, cache);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return result;
    } finally {
      done();
    }
  })();
  pending.set(key, generation);
  try {
    return await generation;
  } finally {
    if (pending.get(key) === generation) pending.delete(key);
  }
}
