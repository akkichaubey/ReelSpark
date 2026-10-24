import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { APP_CONFIG, getFfmpegPath } from '@/lib/config';
import { assertSafePath, sanitizeFilename } from '@/lib/storage';
import { extractClipAudio } from '@/lib/ffmpeg';
import { probeAudioDuration } from '@/lib/caption-maker/ffmpeg-renderer';
import { AudioAsset, ImageAsset } from '@/lib/caption-maker/types';
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia, mediaUserNamespace } from '@/lib/media-access';
import { backupPrivateMedia } from '@/lib/cloudflare/private-media';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const body = await req.json();
    const {
      clipId,
      clipName,
      startMs,
      endMs,
      durationMs,
      sourcePath,
      sourceFilename,
      hasVideo = false,
      projectId,
    } = body;

    if (!clipId || typeof startMs !== 'number' || typeof endMs !== 'number' || endMs <= startMs) {
      return NextResponse.json(
        { success: false, error: 'Invalid clip boundaries provided.' },
        { status: 400 }
      );
    }

    // 1. Resolve source file on disk
    let resolvedSourcePath = sourcePath;
    if (!resolvedSourcePath || !fs.existsSync(/*turbopackIgnore: true*/ resolvedSourcePath)) {
      if (sourceFilename && projectId) {
        const candidate = path.join(
          APP_CONFIG.storageRoot,
          'clipping-studio',
          'projects',
          projectId,
          'media',
          sourceFilename
        );
        if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
          resolvedSourcePath = candidate;
        }
      }
    }

    if (!resolvedSourcePath || !fs.existsSync(/*turbopackIgnore: true*/ resolvedSourcePath)) {
      return NextResponse.json(
        {
          success: false,
          error: `Source media file not found on disk: ${sourceFilename || sourcePath || 'unknown'}`,
        },
        { status: 404 }
      );
    }

    if (!(await canReadMedia(access.user.id, resolvedSourcePath))) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    // 2. Prepare target storage directory inside caption-maker
    const userNamespace = mediaUserNamespace(access.user.id);
    const targetDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'clips', userNamespace);
    assertSafePath(targetDir, APP_CONFIG.storageRoot);

    if (!fs.existsSync(/*turbopackIgnore: true*/ targetDir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ targetDir, { recursive: true });
    }

    const clipSafeId = sanitizeFilename(clipId);
    const startSec = Math.max(0, startMs / 1000);
    const endSec = Math.max(startSec + 0.1, endMs / 1000);
    const durationSec = Math.max(0.5, endSec - startSec);

    // 3. Extract precise clip audio segment
    const outputAudioPath = path.join(targetDir, `${clipSafeId}_audio.mp3`);
    const boundsMetaPath = `${outputAudioPath}.bounds.json`;
    let audioCached = false;

    if (fs.existsSync(/*turbopackIgnore: true*/ outputAudioPath) && fs.existsSync(/*turbopackIgnore: true*/ boundsMetaPath)) {
      try {
        const bounds = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ boundsMetaPath, 'utf8'));
        if (
          Math.abs(bounds.startMs - startMs) < 50 &&
          Math.abs(bounds.endMs - endMs) < 50 &&
          bounds.sourcePath === resolvedSourcePath
        ) {
          const stat = fs.statSync(/*turbopackIgnore: true*/ outputAudioPath);
          if (stat.size > 1000) {
            audioCached = true;
          }
        }
      } catch {}
    }

    if (!audioCached) {
      await extractClipAudio({
        sourceVideoPath: resolvedSourcePath,
        outputPath: outputAudioPath,
        start: startSec,
        end: endSec,
        normalizeAudio: false,
      });

      fs.writeFileSync(
        /*turbopackIgnore: true*/ boundsMetaPath,
        JSON.stringify({ startMs, endMs, sourcePath: resolvedSourcePath })
      );
    }

    const audioDuration = await probeAudioDuration(outputAudioPath);
    await backupPrivateMedia(access.user.id, outputAudioPath);
    const audioStat = await fs.promises.stat(/*turbopackIgnore: true*/ outputAudioPath);
    const relativeAudioPath = `caption-maker/clips/${userNamespace}/${clipSafeId}_audio.mp3`;
    const audioUrl = `/api/files/${relativeAudioPath}`;

    const cleanTitle = (clipName || 'Clip').trim();

    const audioAsset: AudioAsset = {
      id: `aud_${clipSafeId}`,
      fileUrl: audioUrl,
      storagePath: outputAudioPath,
      fileName: `${cleanTitle} (Audio).mp3`,
      fileSize: audioStat.size,
      duration: Math.round(audioDuration * 100) / 100,
      format: 'MP3',
      sourceType: hasVideo ? 'video' : 'audio',
      originalVideoFileName: sourceFilename || path.basename(resolvedSourcePath),
    };

    // 4. If video is present, also extract the video clip segment
    let videoAsset: ImageAsset | undefined = undefined;

    if (hasVideo) {
      const outputVideoPath = path.join(targetDir, `${clipSafeId}_video.mp4`);
      const videoBoundsMetaPath = `${outputVideoPath}.bounds.json`;
      let videoCached = false;

      if (fs.existsSync(/*turbopackIgnore: true*/ outputVideoPath) && fs.existsSync(/*turbopackIgnore: true*/ videoBoundsMetaPath)) {
        try {
          const bounds = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ videoBoundsMetaPath, 'utf8'));
          if (
            Math.abs(bounds.startMs - startMs) < 50 &&
            Math.abs(bounds.endMs - endMs) < 50 &&
            bounds.sourcePath === resolvedSourcePath
          ) {
            const stat = fs.statSync(/*turbopackIgnore: true*/ outputVideoPath);
            if (stat.size > 5000) {
              videoCached = true;
            }
          }
        } catch {}
      }

      if (!videoCached) {
        const ffmpeg = getFfmpegPath();
        await execFileAsync(ffmpeg, [
          '-y',
          '-ss', startSec.toFixed(3),
          '-to', endSec.toFixed(3),
          '-i', resolvedSourcePath,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-c:a', 'aac',
          '-b:a', '192k',
          outputVideoPath,
        ]);

        fs.writeFileSync(
          /*turbopackIgnore: true*/ videoBoundsMetaPath,
          JSON.stringify({ startMs, endMs, sourcePath: resolvedSourcePath })
        );
      }

      if (fs.existsSync(/*turbopackIgnore: true*/ outputVideoPath)) {
        await backupPrivateMedia(access.user.id, outputVideoPath);
        const videoStat = await fs.promises.stat(/*turbopackIgnore: true*/ outputVideoPath);
        const relativeVideoPath = `caption-maker/clips/${userNamespace}/${clipSafeId}_video.mp4`;
        const videoUrl = `/api/files/${relativeVideoPath}`;

        videoAsset = {
          id: `vid_${clipSafeId}`,
          fileUrl: videoUrl,
          storagePath: outputVideoPath,
          fileName: `${cleanTitle}.mp4`,
          fileSize: videoStat.size,
          width: 1080,
          height: 1920,
          format: 'MP4',
          fitMode: 'cover',
          position: 'center',
          scale: 100,
          mediaType: 'video',
          duration: Math.round(audioDuration * 100) / 100,
        };
      }
    }

    // 5. Check if acoustic sync cache already exists for this sliced audio
    const syncMetaPath = `${outputAudioPath}.sync.json`;
    let cachedSync: any = null;
    if (fs.existsSync(/*turbopackIgnore: true*/ syncMetaPath)) {
      try {
        cachedSync = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ syncMetaPath, 'utf8'));
      } catch {}
    }

    return NextResponse.json({
      success: true,
      audio: audioAsset,
      video: videoAsset,
      syncedSegments: cachedSync?.segments || null,
      titleHindi: cachedSync?.titleHindi || null,
      titleEnglish: cachedSync?.titleEnglish || null,
      isAudioSynced: Boolean(cachedSync && Array.isArray(cachedSync.segments) && cachedSync.segments.length > 0),
    });
  } catch (err: any) {
    console.error('Caption bridge error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to prepare clip for caption maker' },
      { status: 500 }
    );
  }
}
