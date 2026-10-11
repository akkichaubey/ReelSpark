import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, sanitizeFilename } from '@/lib/storage';
import { probeAudioDuration } from '@/lib/caption-maker/ffmpeg-renderer';
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
    if (type === 'audio' && !isAudio) {
      return NextResponse.json(
        { error: 'Unsupported audio format. Please upload MP3, WAV, M4A, AAC or OGG.' },
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
      // Probe video duration
      const duration = await probeAudioDuration(targetFilePath);
      const videoAsset: ImageAsset = {
        id: assetId,
        fileUrl,
        storagePath: targetFilePath,
        fileName: file.name,
        fileSize: file.size,
        width: 1080,
        height: 1920,
        format: ext.replace('.', '').toUpperCase(),
        fitMode: 'cover',
        mediaType: 'video',
        duration: Math.round(duration * 100) / 100,
      };

      // Also create companion audio asset from video audio track
      const audioAsset: AudioAsset = {
        id: `aud_${assetId}`,
        fileUrl,
        storagePath: targetFilePath,
        fileName: `${file.name} (Audio)`,
        fileSize: file.size,
        duration: Math.round(duration * 100) / 100,
        format: ext.replace('.', '').toUpperCase(),
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
        fitMode: 'cover',
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
