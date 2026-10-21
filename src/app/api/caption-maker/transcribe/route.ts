import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { assertStorageFile, resolveStoragePath } from '@/lib/storage';
import { transcribeAudio } from '@/lib/caption-maker/transcription';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';
import { buildWordsFromSyncedSegments } from '@/lib/caption-maker/clip-to-reel';
import { devanagariToHinglish, enrichWordsWithEmojis } from '@/lib/caption-maker/hinglish-and-emoji';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storagePath, fileUrl, preferredLanguage, fallbackHint } = body;
    const lang: 'hi' | 'en' | 'hinglish' =
      preferredLanguage === 'hinglish' ? 'hinglish' : preferredLanguage === 'hi' ? 'hi' : 'en';

    let targetPath: string | undefined;
    if (storagePath) {
      targetPath = assertStorageFile(storagePath);
    }

    // Resolve from fileUrl if storagePath is not directly passed or does not exist
    if ((!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) && fileUrl) {
      const decodedUrl = decodeURIComponent(fileUrl);
      if (decodedUrl.startsWith('/api/files/')) {
        const relPart = decodedUrl.replace('/api/files/', '');
        targetPath = resolveStoragePath(relPart);
      } else if (decodedUrl.startsWith('/')) {
        const publicPath = path.resolve(process.cwd(), 'public', decodedUrl.replace(/^\/+/, ''));
        const publicRoot = path.resolve(process.cwd(), 'public');
        if (!publicPath.startsWith(`${publicRoot}${path.sep}`)) throw new Error('Invalid public media path');
        targetPath = publicPath;
      }
    }

    if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for transcription' },
        { status: 400 }
      );
    }

    // Run transcription with hardware acoustic-locked word-level timestamps (use Hindi base for Hinglish transliteration)
    const baseLang = lang === 'hinglish' ? 'hi' : lang;
    const result = await transcribeAudio(targetPath, baseLang, fallbackHint);

    let finalTranscript = result.transcript;
    const rawTranscriptHinglish =
      result.rawTranscriptHinglish ||
      (result.rawTranscriptHindi
        ? devanagariToHinglish(result.rawTranscriptHindi)
        : result.rawTranscriptEnglish);
    const titleHinglish =
      result.titleHinglish ||
      (result.titleHindi ? devanagariToHinglish(result.titleHindi) : result.titleEnglish);

    if (lang === 'hinglish') {
      if (result.syncedSegments && result.syncedSegments.length > 0) {
        finalTranscript = buildWordsFromSyncedSegments(result.syncedSegments, 'hinglish');
      } else {
        finalTranscript = result.transcript.map((w) => ({
          ...w,
          text: devanagariToHinglish(w.text) || w.text,
        }));
      }
    }

    finalTranscript = enrichWordsWithEmojis(finalTranscript);
    const captionGroups = groupTranscriptWords(finalTranscript, 4);

    return NextResponse.json({
      success: true,
      transcript: finalTranscript,
      captionGroups,
      syncedSegments: result.syncedSegments,
      rawTranscriptHindi: result.rawTranscriptHindi,
      rawTranscriptEnglish: result.rawTranscriptEnglish,
      rawTranscriptHinglish,
      titleHindi: result.titleHindi,
      titleEnglish: result.titleEnglish,
      titleHinglish,
      isAudioSynced: Boolean(result.syncedSegments && result.syncedSegments.length > 0),
      language: lang,
      sfxCues: result.sfxCues || [],
      audioAnalysis: result.audioAnalysis || null,
      fillerSegments: result.fillerSegments || [],
    });
  } catch (err: any) {
    console.error('Transcription API error:', err);
    return NextResponse.json(
      { error: err.message || 'Audio transcription failed' },
      { status: 500 }
    );
  }
}

