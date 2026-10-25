import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, sanitizeFilename } from '@/lib/storage';
import { probeAudioDuration, extractAudioFromVideo } from '@/lib/caption-maker/ffmpeg-renderer';
import { AudioAsset, ImageAsset } from '@/lib/caption-maker/types';
import { validateUpload } from '@/lib/media-validation';
import { randomUUID } from 'node:crypto';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { recordMediaOwner } from '@/lib/media-access';
import { backupPrivateMedia, deletePrivateMedia } from '@/lib/cloudflare/private-media';
import { getIncomingUploadMetadata, streamRequestBodyToFile, UploadRequestError } from '@/lib/stream-upload';
import { registerStorageTask } from '@/lib/storage-runtime';

export async function POST(req: NextRequest) {
  let uploadDirectory: string | undefined;
  let uploadAbort: AbortController | undefined;
  let finishStorageTask: (() => void) | undefined;
  let keepUploadedAsset = false;
  let uploadOwnerId: string | undefined;
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    uploadOwnerId = user.id;
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    const { filename, mediaType, expectedSize, uploadId } = getIncomingUploadMetadata(req, true);
    const type = mediaType!;
    const permittedKinds = type === 'image' ? ['image'] as const : type === 'video' ? ['video'] as const : ['audio', 'video'] as const;
    const uploadError = validateUpload({ name: filename, size: expectedSize }, [...permittedKinds]);
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    const safeName = sanitizeFilename(filename);
    const ext = path.extname(safeName).toLowerCase();

    // Check allowed extensions
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
    const audioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];

    const isImage = imageExts.includes(ext);
    const isVideo = videoExts.includes(ext);
    const isAudio = audioExts.includes(ext);

    if (type === 'image' && !isImage) {
      return NextResponse.json(
        { error: 'Unsupported image format. Please upload JPG, PNG, or WEBP.' },
        { status: 400 }
      );
    }
    if (type === 'video' && !isVideo) {
      return NextResponse.json(
        { error: 'Unsupported video format. Please upload MP4, MOV, WEBM, or MKV.' },
        { status: 400 }
      );
    }
    if (type === 'audio' && !isAudio && !isVideo) {
      return NextResponse.json(
        { error: 'Unsupported audio or video format. Please upload MP3, WAV, M4A, AAC, OGG or MP4, MOV, WEBM.' },
        { status: 400 }
      );
    }

    // Prepare target storage directory
    const assetId = `asset_${randomUUID()}`;
    const uploadDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', assetId);
    uploadDirectory = uploadDir;
    assertSafePath(uploadDir, APP_CONFIG.storageRoot);

    uploadAbort = new AbortController();
    finishStorageTask = registerStorageTask({
      id: uploadId,
      ownerId: user.id,
      kind: 'upload',
      paths: [uploadDir],
      cancel: () => uploadAbort?.abort(),
    });

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    await recordMediaOwner(uploadDir, user.id);

    const targetFilePath = path.join(uploadDir, safeName);
    const fileSize = await streamRequestBodyToFile(req, targetFilePath, undefined, AbortSignal.any([req.signal, uploadAbort.signal]));

    const relativePath = `caption-maker/${assetId}/${safeName}`;
    const fileUrl = `/api/files/${relativePath}`;

    if (isVideo && type === 'audio') {
      // Extract audio only when the user uploaded a video as spoken audio.
      const duration = await probeAudioDuration(targetFilePath);
      let companionAudioPath = targetFilePath;
      let companionAudioUrl = fileUrl;
      let companionFormat = ext.replace('.', '').toUpperCase();
      let companionSize = fileSize;
      let companionDuration = duration;

      try {
        const extractedAudioName = `${path.parse(safeName).name}_audio.mp3`;
        const extractedAudioPath = path.join(uploadDir, extractedAudioName);
        const { duration: extractedDuration } = await extractAudioFromVideo(targetFilePath, extractedAudioPath);
        const extractedStat = fs.statSync(extractedAudioPath);
        companionAudioPath = extractedAudioPath;
        companionAudioUrl = `/api/files/caption-maker/${assetId}/${extractedAudioName}`;
        companionFormat = 'MP3';
        companionSize = extractedStat.size;
        companionDuration = extractedDuration;
      } catch (error) {
        // Preserve the uploaded source as the audio asset if optional extraction fails.
        console.warn('Companion audio extraction note:', error instanceof Error ? error.message : error);
      }

      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      if (companionAudioPath !== targetFilePath) await fs.promises.rm(targetFilePath, { force: true });
      await backupPrivateMedia(user.id, companionAudioPath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      keepUploadedAsset = true;

      const audioAsset: AudioAsset = {
        id: `aud_${assetId}`,
        fileUrl: companionAudioUrl,
        storagePath: companionAudioPath,
        fileName: `${filename} (Audio)`,
        fileSize: companionSize,
        duration: Math.round(companionDuration * 100) / 100,
        format: companionFormat,
        sourceType: 'video',
        originalVideoFileName: filename,
      };

      return NextResponse.json({
        success: true,
        asset: audioAsset,
        audioAsset,
        type: 'audio',
      });
    }

    if (isVideo) {
      // Background videos are rendered as visuals; avoid an unused audio transcode.
      const duration = await probeAudioDuration(targetFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      await backupPrivateMedia(user.id, targetFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      keepUploadedAsset = true;
      const videoAsset: ImageAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: filename,
        fileSize,
        width: 1080,
        height: 1920,
        format: ext.replace('.', '').toUpperCase(),
        fitMode: 'cover',
        position: 'center',
        scale: 100,
        mediaType: 'video',
        duration: Math.round(duration * 100) / 100,
      };

      return NextResponse.json({
        success: true,
        asset: videoAsset,
        type: 'video',
      });
    } else if (isImage) {
      // Basic dimension determination or default 1080x1920
      const imageAsset: ImageAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: filename,
        fileSize,
        width: 1080,
        height: 1920,
        format: ext.replace('.', '').toUpperCase(),
        fitMode: 'cover',
        position: 'center',
        scale: 100,
        mediaType: 'image',
      };
      await backupPrivateMedia(user.id, targetFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      keepUploadedAsset = true;
      return NextResponse.json({ success: true, asset: imageAsset, type: 'image' });
    } else {
      // Audio duration probing
      const duration = await probeAudioDuration(targetFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      await backupPrivateMedia(user.id, targetFilePath);
      if (uploadAbort.signal.aborted) throw new Error('Upload cancelled.');
      keepUploadedAsset = true;
      const audioAsset: AudioAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: filename,
        fileSize,
        duration: Math.round(duration * 100) / 100,
        format: ext.replace('.', '').toUpperCase(),
      };
      return NextResponse.json({ success: true, asset: audioAsset, type: 'audio' });
    }
  } catch (err: any) {
    if (uploadDirectory && !keepUploadedAsset) {
      try {
        if (uploadOwnerId && fs.existsSync(/*turbopackIgnore: true*/ uploadDirectory)) {
          const entries = await fs.promises.readdir(/*turbopackIgnore: true*/ uploadDirectory, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && !entry.name.startsWith('.')) {
              await deletePrivateMedia(uploadOwnerId, path.join(uploadDirectory, entry.name));
            }
          }
        }
        await fs.promises.rm(uploadDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('[Caption Maker upload] Rollback failed; janitor will retry:', cleanupError);
        await fs.promises.writeFile(path.join(uploadDirectory, '.abandoned-upload.json'), JSON.stringify({ failedAt: new Date().toISOString() })).catch(() => undefined);
      }
    }
    console.error('Caption Maker upload failed:', err);
    return NextResponse.json(
      { error: err.message || 'File upload failed' },
      { status: err instanceof UploadRequestError ? err.status : 500 }
    );
  } finally {
    finishStorageTask?.();
  }
}
