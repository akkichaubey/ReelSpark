import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, sanitizeFilename } from '@/lib/storage';
import { probeAudioDuration, extractAudioFromVideo } from '@/lib/caption-maker/ffmpeg-renderer';
import { AudioAsset, ImageAsset } from '@/lib/caption-maker/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as 'image' | 'video' | 'audio' | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const safeName = sanitizeFilename(file.name);
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
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', assetId);
    assertSafePath(uploadDir, APP_CONFIG.storageRoot);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const targetFilePath = path.join(uploadDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(targetFilePath, buffer);

    const relativePath = `caption-maker/${assetId}/${safeName}`;
    const fileUrl = `/api/files/${relativePath}`;

    if (isVideo) {
      // 1. Probe video duration
      const duration = await probeAudioDuration(targetFilePath);

      // Attempt high-quality MP3 audio extraction from the video
      let companionAudioPath = targetFilePath;
      let companionAudioUrl = fileUrl;
      let companionFormat = ext.replace('.', '').toUpperCase();
      let companionSize = file.size;
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
      } catch (err: any) {
        console.warn('Companion audio extraction note:', err?.message || err);
      }

      const audioAsset: AudioAsset = {
        id: `aud_${assetId}`,
        fileUrl: companionAudioUrl,
        storagePath: companionAudioPath,
        fileName: `${file.name} (Audio)`,
        fileSize: companionSize,
        duration: Math.round(companionDuration * 100) / 100,
        format: companionFormat,
        sourceType: 'video',
        originalVideoFileName: file.name,
      };

      // If user specifically uploaded this file to Spoken Audio, return it as the primary audio asset
      if (type === 'audio') {
        return NextResponse.json({
          success: true,
          asset: audioAsset,
          audioAsset,
          type: 'audio',
        });
      }

      const videoAsset: ImageAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: file.name,
        fileSize: file.size,
        width: 1080,
        height: 1920,
        format: ext.replace('.', '').toUpperCase(),
        fitMode: 'contain',
        position: 'bottom-left',
        scale: 100,
        mediaType: 'video',
        duration: Math.round(duration * 100) / 100,
      };

      return NextResponse.json({
        success: true,
        asset: videoAsset,
        audioAsset,
        type: 'video',
      });
    } else if (isImage) {
      // Basic dimension determination or default 1080x1920
      const imageAsset: ImageAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: file.name,
        fileSize: file.size,
        width: 1080,
        height: 1920,
        format: ext.replace('.', '').toUpperCase(),
        fitMode: 'contain',
        position: 'bottom-left',
        scale: 100,
        mediaType: 'image',
      };
      return NextResponse.json({ success: true, asset: imageAsset, type: 'image' });
    } else {
      // Audio duration probing
      const duration = await probeAudioDuration(targetFilePath);
      const audioAsset: AudioAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: file.name,
        fileSize: file.size,
        duration: Math.round(duration * 100) / 100,
        format: ext.replace('.', '').toUpperCase(),
      };
      return NextResponse.json({ success: true, asset: audioAsset, type: 'audio' });
    }
  } catch (err: any) {
    console.error('Caption Maker upload failed:', err);
    return NextResponse.json(
      { error: err.message || 'File upload failed' },
      { status: 500 }
    );
  }
}
