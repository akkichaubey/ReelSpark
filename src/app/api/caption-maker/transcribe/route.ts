import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { transcribeAudio } from '@/lib/caption-maker/transcription';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storagePath, fileUrl, preferredLanguage, fallbackHint } = body;
    const lang: 'hi' | 'en' = preferredLanguage === 'hi' ? 'hi' : 'en';

    let targetPath = storagePath;

    // Resolve from fileUrl if storagePath is not directly passed or does not exist
    if ((!targetPath || !fs.existsSync(targetPath)) && fileUrl) {
      if (fileUrl.startsWith('/api/files/')) {
        const relPart = fileUrl.replace('/api/files/', '');
        targetPath = path.join(APP_CONFIG.storageRoot, relPart);
      } else if (fileUrl.startsWith('/')) {
        targetPath = path.join(process.cwd(), 'public', fileUrl);
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for transcription' },
        { status: 400 }
      );
    }

    // Run transcription with hardware acoustic-locked word-level timestamps
    const result = await transcribeAudio(targetPath, lang, fallbackHint);
    const captionGroups = groupTranscriptWords(result.transcript, 4);

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      captionGroups,
      syncedSegments: result.syncedSegments,
      rawTranscriptHindi: result.rawTranscriptHindi,
      rawTranscriptEnglish: result.rawTranscriptEnglish,
      titleHindi: result.titleHindi,
      titleEnglish: result.titleEnglish,
      isAudioSynced: Boolean(result.syncedSegments && result.syncedSegments.length > 0),
      language: result.language || lang,
    });
  } catch (err: any) {
    console.error('Transcription API error:', err);
    return NextResponse.json(
      { error: err.message || 'Audio transcription failed' },
      { status: 500 }
    );
  }
}

