'use strict';

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getFfmpegPath } from '../config';
import { commitStorageFile, createStorageStagingPath, removeStorageFile } from '../storage-files';

export type ThumbnailMergeMode = 'intro_and_poster' | 'intro_hook' | 'poster_only';

export interface MergeThumbnailOptions {
  videoPath: string;
  thumbnailPath: string;
  outputPath?: string;
  mergeMode?: ThumbnailMergeMode;
  introDuration?: number; // in seconds, default 1.0
  width?: number; // target video width
  height?: number; // target video height
  signal?: AbortSignal;
}

/**
 * Saves a base64 Data URL (PNG or JPEG) to a file on disk.
 */
export async function saveBase64Image(dataUrl: string, outputPath: string): Promise<string> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
}

/**
 * Merges a thumbnail cover image into an MP4 video using FFmpeg.
 *
 * Supported merge modes:
 * - 'intro_and_poster': Displays thumbnail as the opening hook (first 0.8s - 1.5s) AND attaches as MP4 container cover art (attached_pic).
 * - 'intro_hook': Overlays thumbnail as opening hook for specified duration without modifying MP4 metadata tracks.
 * - 'poster_only': Attaches thumbnail as MP4 cover art (attached_pic) via stream copy without altering video stream or duration.
 */
export async function mergeThumbnailIntoVideo(
  options: MergeThumbnailOptions
): Promise<{ outputPath: string }> {
  const {
    videoPath,
    thumbnailPath,
    outputPath: customOutputPath,
    mergeMode = 'intro_and_poster',
    introDuration = 0.000001,
    width = 1080,
    height = 1920,
    signal,
  } = options;
  if (signal?.aborted) throw new Error('Thumbnail merge cancelled.');

  const ffmpeg = getFfmpegPath();

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Source video not found at ${videoPath}`);
  }
  if (!fs.existsSync(thumbnailPath)) {
    throw new Error(`Thumbnail image not found at ${thumbnailPath}`);
  }

  const targetOutputPath = customOutputPath || videoPath;
  const tempOutput = createStorageStagingPath(targetOutputPath, 'partial');

  let args: string[] = [];

  if (mergeMode === 'poster_only') {
    // Fast stream-copy attached_pic without re-encoding
    args = [
      '-y',
      '-i', videoPath,
      '-i', thumbnailPath,
      '-map', '0',
      '-map', '1',
      '-c', 'copy',
      '-disposition:v:1', 'attached_pic',
      '-metadata:s:v:1', 'title=Thumbnail',
      tempOutput,
    ];
  } else if (mergeMode === 'intro_hook') {
    // Overlays thumbnail on frame 0 (or up to duration seconds), disappearing immediately when playback begins
    const duration = Math.max(0.000001, Math.min(5.0, introDuration));
    const overlayEnable =
      duration <= 0.05
        ? "enable='eq(n,0)'"
        : `enable='lte(t,${duration.toFixed(4)})'`;

    args = [
      '-y',
      '-i', videoPath,
      '-i', thumbnailPath,
      '-filter_complex',
      `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[thumb];[0:v][thumb]overlay=0:0:${overlayEnable}[outv]`,
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      tempOutput,
    ];
  } else {
    // Default: 'intro_and_poster' (Frame 0 instant cover for 0.000001s + MP4 container attached_pic)
    const duration = Math.max(0.000001, Math.min(5.0, introDuration));
    const overlayEnable =
      duration <= 0.05
        ? "enable='eq(n,0)'"
        : `enable='lte(t,${duration.toFixed(4)})'`;

    args = [
      '-y',
      '-i', videoPath,
      '-i', thumbnailPath,
      '-filter_complex',
      `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[thumb];[0:v][thumb]overlay=0:0:${overlayEnable}[outv]`,
      '-map', '[outv]',
      '-map', '0:a?',
      '-map', '1:v',
      '-c:v:0', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-c:v:1', 'png',
      '-disposition:v:1', 'attached_pic',
      '-metadata:s:v:1', 'title=Thumbnail',
      tempOutput,
    ];
  }

  try {
    await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const cleanupSignal = () => signal?.removeEventListener('abort', abortMerge);
    const abortMerge = () => {
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
      else child.kill('SIGTERM');
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupSignal();
      reject(error);
    };
    signal?.addEventListener('abort', abortMerge, { once: true });
    if (signal?.aborted) abortMerge();

    let stderrData = '';
    child.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    child.on('close', (code) => {
      if (settled) return;
      if (signal?.aborted) return fail(new Error('Thumbnail merge cancelled.'));
      if (code === 0 && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
        settled = true;
        cleanupSignal();
        resolve();
      } else {
        fail(
          new Error(
            `FFmpeg thumbnail merge failed with exit code ${code}: ${stderrData.slice(-500)}`
          )
        );
      }
    });

    child.on('error', (err) => {
      fail(new Error(`Failed to launch FFmpeg: ${err.message}`));
    });
    });
    await commitStorageFile(tempOutput, targetOutputPath);
    return { outputPath: targetOutputPath };
  } catch (error) {
    await removeStorageFile(tempOutput);
    throw error;
  }
}
