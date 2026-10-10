import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { transcribeAudio } from '@/lib/caption-maker/transcription';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storagePath, fileUrl } = body;

    let targetPath = storagePath;

    // Resolve from fileUrl if storagePath is not directly passed
    if (!targetPath && fileUrl) {
      const relPart = fileUrl.replace('/api/files/', '');
      targetPath = path.join(APP_CONFIG.storageRoot, relPart);
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for transcription' },
        { status: 400 }
      );
    }

    // Run transcription with word-level timestamps
    const result = await transcribeAudio(targetPath);
    const captionGroups = groupTranscriptWords(result.transcript, 4);

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      captionGroups,
      language: result.language || 'mixed',
    });
  } catch (err: any) {
    console.error('Transcription API error:', err);
    return NextResponse.json(
      { error: err.message || 'Audio transcription failed' },
      { status: 500 }
    );
  }
}
