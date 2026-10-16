'use strict';

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getFfmpegPath } from '../config';

export type ThumbnailMergeMode = 'intro_and_poster' | 'intro_hook' | 'poster_only';

export interface MergeThumbnailOptions {
  videoPath: string;
  thumbnailPath: string;
  outputPath?: string;
  mergeMode?: ThumbnailMergeMode;
  introDuration?: number; // in seconds, default 1.0
  width?: number; // target video width
  height?: number; // target video height
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
  } = options;

  const ffmpeg = getFfmpegPath();

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Source video not found at ${videoPath}`);
  }
  if (!fs.existsSync(thumbnailPath)) {
    throw new Error(`Thumbnail image not found at ${thumbnailPath}`);
  }

  const targetOutputPath = customOutputPath || videoPath;
  const tempOutput = path.join(
    path.dirname(targetOutputPath),
    `temp_merged_${Date.now()}_${path.basename(targetOutputPath)}`
  );

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

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrData = '';
    child.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg thumbnail merge failed with exit code ${code}: ${stderrData.slice(-500)}`
          )
        );
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to launch FFmpeg: ${err.message}`));
    });
  });

  // Safely replace target video with merged output
  if (fs.existsSync(tempOutput)) {
    if (fs.existsSync(targetOutputPath) && targetOutputPath === videoPath) {
      // Remove original before moving temp
      try {
        await fs.promises.unlink(videoPath);
      } catch {
        // Continue
      }
    }
    await fs.promises.rename(tempOutput, targetOutputPath);
  }

  return { outputPath: targetOutputPath };
}
