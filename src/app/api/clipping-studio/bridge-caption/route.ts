import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'node:crypto';
import { APP_CONFIG, getFfmpegPath } from '@/lib/config';
import { assertSafePath, sanitizeFilename } from '@/lib/storage';
import { extractClipAudio } from '@/lib/ffmpeg';
import { probeAudioDuration } from '@/lib/caption-maker/ffmpeg-renderer';
import { AudioAsset, ImageAsset } from '@/lib/caption-maker/types';
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia, mediaUserNamespace, recordMediaOwner } from '@/lib/media-access';
import { backupPrivateMedia } from '@/lib/cloudflare/private-media';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { probeVideo } from '@/lib/ffmpeg';
import { loadProject } from '@/lib/storage';
import type { SyncedPhraseSegment } from '@/lib/caption-maker/types';

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

    if (typeof clipId !== 'string' || !clipId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
      return NextResponse.json(
        { success: false, error: 'Invalid clip boundaries provided.' },
        { status: 400 }
      );
    }

    // 1. Resolve source file on disk
    let resolvedSourcePath = sourcePath;
    if (resolvedSourcePath && typeof resolvedSourcePath === 'string') {
      assertSafePath(resolvedSourcePath);
      if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedSourcePath)) await restorePrivateMedia(access.user.id, resolvedSourcePath);
    }
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
    const metadata = await probeVideo(resolvedSourcePath);
    if (endMs > metadata.duration * 1000 + 1) return NextResponse.json({ success: false, error: 'Clip ends after source media' }, { status: 400 });

    // 2. Prepare target storage directory inside caption-maker
    const userNamespace = mediaUserNamespace(access.user.id);
    const targetDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'clips', userNamespace);
    assertSafePath(targetDir, APP_CONFIG.storageRoot);

    if (!fs.existsSync(/*turbopackIgnore: true*/ targetDir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ targetDir, { recursive: true });
    }
    await recordMediaOwner(targetDir, access.user.id);

    const boundsKey = createHash('sha256').update(`${resolvedSourcePath}:${startMs}:${endMs}`).digest('hex').slice(0, 20);
    const clipSafeId = `${sanitizeFilename(clipId).slice(0, 48)}_${boundsKey}`;
    const startSec = Math.max(0, startMs / 1000);
    const endSec = Math.max(startSec + 0.1, endMs / 1000);
    const durationSec = endSec - startSec;

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
          width: metadata.width,
          height: metadata.height,
          format: 'MP4',
          fitMode: 'cover',
          position: 'center',
          scale: 100,
          mediaType: 'video',
          duration: Math.round(audioDuration * 100) / 100,
          muteSourceAudio: true,
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
    if (!cachedSync?.segments?.length && typeof body.sourceProjectId === 'string') {
      const source = await loadProject(body.sourceProjectId);
      if (source?.ownerUserId === access.user.id && source.localVideoPath === resolvedSourcePath) {
        const segments: SyncedPhraseSegment[] = source.transcript.filter(segment => segment.end > startSec && segment.start < endSec).map(segment => ({
          id: segment.id, start: Math.max(0, segment.start - startSec), end: Math.min(durationSec, segment.end - startSec),
          textEnglish: segment.text, textHindi: '', speakerId: segment.speaker,
        }));
        if (segments.length) cachedSync = { segments };
      }
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
