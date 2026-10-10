import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';
import { renderReelVideo } from '@/lib/caption-maker/ffmpeg-renderer';
import { generatePhraseLevelSrt, generateWordLevelSrt } from '@/lib/caption-maker/srt-generator';
import { CaptionGroup, CaptionStyle, OutputSettings, TranscriptWord } from '@/lib/caption-maker/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      projectId = `reel_${Date.now()}`,
      imagePath: rawImagePath,
      imageUrl,
      audioPath: rawAudioPath,
      audioUrl,
      transcript,
      captionGroups,
      captionStyle,
      outputSettings,
      imageFitMode = 'cover',
    }: {
      projectId: string;
      imagePath?: string;
      imageUrl?: string;
      audioPath?: string;
      audioUrl?: string;
      transcript: TranscriptWord[];
      captionGroups: CaptionGroup[];
      captionStyle: CaptionStyle;
      outputSettings: OutputSettings;
      imageFitMode?: 'cover' | 'contain' | 'blur';
    } = body;

    // Resolve image path
    let imagePath = rawImagePath;
    if (!imagePath && imageUrl) {
      const rel = imageUrl.replace('/api/files/', '');
      imagePath = path.join(APP_CONFIG.storageRoot, rel);
    }

    // Resolve audio path
    let audioPath = rawAudioPath;
    if (!audioPath && audioUrl) {
      const rel = audioUrl.replace('/api/files/', '');
      audioPath = path.join(APP_CONFIG.storageRoot, rel);
    }

    if (!imagePath || !fs.existsSync(imagePath)) {
      return NextResponse.json(
        { error: 'Background image not found. Please upload an image.' },
        { status: 400 }
      );
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      return NextResponse.json(
        { error: 'Audio file not found. Please upload an audio recording.' },
        { status: 400 }
      );
    }

    // Prepare project render directory
    const renderDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'renders', projectId);
    assertSafePath(renderDir, APP_CONFIG.storageRoot);

    if (!fs.existsSync(renderDir)) {
      fs.mkdirSync(renderDir, { recursive: true });
    }

    const outputMp4Path = path.join(renderDir, `${projectId}_final.mp4`);
    const outputSrtPath = path.join(renderDir, `${projectId}_captions.srt`);

    // 1. Write SRT Subtitle File
    const srtContent =
      captionStyle.captionMode === 'word-by-word'
        ? generateWordLevelSrt(transcript)
        : generatePhraseLevelSrt(captionGroups);
    await fs.promises.writeFile(outputSrtPath, srtContent, 'utf8');

    // 2. Render MP4 via FFmpeg
    const renderRes = await renderReelVideo({
      imagePath,
      audioPath,
      outputPath: outputMp4Path,
      groups: captionGroups,
      words: transcript,
      style: captionStyle,
      outputSettings,
      imageFitMode,
    });

    const videoRel = `caption-maker/renders/${projectId}/${projectId}_final.mp4`;
    const srtRel = `caption-maker/renders/${projectId}/${projectId}_captions.srt`;

    return NextResponse.json({
      success: true,
      videoUrl: `/api/files/${videoRel}`,
      srtUrl: `/api/files/${srtRel}`,
      duration: renderRes.duration,
    });
  } catch (err: any) {
    console.error('Caption Maker render error:', err);
    return NextResponse.json(
      { error: err.message || 'Video rendering failed' },
      { status: 500 }
    );
  }
}
