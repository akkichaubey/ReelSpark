import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { assertStorageFile, resolveStoragePath } from '@/lib/storage';
import { APP_CONFIG } from '@/lib/config';
import { transcribeAudio } from '@/lib/caption-maker/transcription';
import { groupTranscriptWords } from '@/lib/caption-maker/caption-grouping';
import { buildWordsFromSyncedSegments } from '@/lib/caption-maker/clip-to-reel';
import { devanagariToHinglish, enrichWordsWithEmojis } from '@/lib/caption-maker/hinglish-and-emoji';
import { extractAudioFromVideo } from '@/lib/caption-maker/ffmpeg-renderer';
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { isTemporaryGeminiError } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const body = await req.json();
    const { storagePath, fileUrl, preferredLanguage, fallbackHint: rawHint, clipId, audioTitle, forceRefresh } = body;
    const lang: 'hi' | 'en' | 'hinglish' =
      preferredLanguage === 'hinglish' ? 'hinglish' : preferredLanguage === 'hi' ? 'hi' : 'en';

    let targetPath: string | undefined;
    if (storagePath) {
      try {
        targetPath = assertStorageFile(storagePath);
      } catch {
        // Fallback if storagePath is a public or relative asset
        if (storagePath.startsWith('public/') || storagePath.startsWith('public\\')) {
          const sub = storagePath.replace(/^public[/\\]/, '');
          const pubPath = path.join(process.cwd(), 'public', sub);
          if (fs.existsSync(/*turbopackIgnore: true*/ pubPath)) {
            targetPath = pubPath;
          }
        }
      }
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
        if (publicPath.startsWith(`${publicRoot}${path.sep}`) || publicPath === publicRoot) {
          targetPath = publicPath;
        }
      }
    }

    if (targetPath && !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) await restorePrivateMedia(access.user.id, targetPath);
    if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      return NextResponse.json(
        { error: 'Audio file not found on server for transcription' },
        { status: 400 }
      );
    }

    if (!(await canReadMedia(access.user.id, targetPath))) {
      return NextResponse.json({ error: 'Media not found. Upload media to your account first.' }, { status: 404 });
    }

    // 1. If targetPath is a video file (.mp4, .mov, .webm, etc.), ensure audio is extracted to MP3
    const ext = path.extname(targetPath).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
    let audioTargetPath = targetPath;

    if (isVideo) {
      const extractedAudioPath = `${targetPath}.audio.mp3`;
      if (fs.existsSync(extractedAudioPath) && fs.statSync(extractedAudioPath).size > 1000) {
        audioTargetPath = extractedAudioPath;
      } else {
        try {
          const { outputPath } = await extractAudioFromVideo(targetPath, extractedAudioPath);
          if (fs.existsSync(outputPath)) {
            audioTargetPath = outputPath;
          }
        } catch (extractErr) {
          console.warn('Audio extraction from video fallback note:', extractErr);
        }
      }
    }

    // 2. Build or clean fallback hint, preventing sample quote contamination
    const isSampleQuote = (t?: string) =>
      Boolean(
        t &&
          (t.includes('Zindagi mein kabhi HAAR') ||
            t.includes('ज़िंदगी में कभी हार') ||
            t.includes('girte wahi hain jo'))
      );

    const fallbackHint: any = {
      textHindi: isSampleQuote(rawHint?.textHindi) ? undefined : rawHint?.textHindi,
      textEnglish: isSampleQuote(rawHint?.textEnglish) ? undefined : rawHint?.textEnglish,
      titleHindi: isSampleQuote(rawHint?.titleHindi) ? undefined : rawHint?.titleHindi,
      titleEnglish: isSampleQuote(rawHint?.titleEnglish) ? undefined : rawHint?.titleEnglish,
    };

    // 3. Inspect if media file belongs to a Clipping Studio / ReelSpark project
    let matchedCandidate: any = null;
    let projectManifestPath: string | null = null;
    const projectMatch = targetPath.match(/(?:projects|clipping-studio[/\\]projects)[/\\]([^/\\]+)/);

    if (projectMatch && projectMatch[1]) {
      const projectId = projectMatch[1];
      const manifestPath = path.join(APP_CONFIG.projectsDir, projectId, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (manifest.ownerUserId !== access.user.id) throw new Error('Project ownership mismatch');
          projectManifestPath = manifestPath;
          const candidates: any[] = Array.isArray(manifest.candidates) ? manifest.candidates : [];

          // Match candidate by clipId or rendered video path or filename
          const filename = path.basename(targetPath);
          matchedCandidate = candidates.find((c) => {
            if (clipId && c.id === clipId) return true;
            if (c.renderedVideoPath && c.renderedVideoPath.includes(filename)) return true;
            if (audioTitle && (c.title === audioTitle || c.titleEnglish === audioTitle)) return true;
            return false;
          });

          if (matchedCandidate) {
            if (!fallbackHint.titleEnglish) {
              fallbackHint.titleEnglish = matchedCandidate.titleEnglish || matchedCandidate.title;
            }
            if (!fallbackHint.titleHindi) {
              fallbackHint.titleHindi = matchedCandidate.titleHindi || matchedCandidate.title;
            }
            if (!fallbackHint.textEnglish && matchedCandidate.transcriptEnglish) {
              fallbackHint.textEnglish = matchedCandidate.transcriptEnglish;
            }
            if (!fallbackHint.textHindi && matchedCandidate.transcriptHindi) {
              fallbackHint.textHindi = matchedCandidate.transcriptHindi;
            }
            if (!fallbackHint.textEnglish && !fallbackHint.textHindi && matchedCandidate.transcript) {
              fallbackHint.textEnglish = matchedCandidate.transcript;
              fallbackHint.textHindi = matchedCandidate.transcript;
            }
          }
        } catch (e) {
          console.warn('Could not read project manifest context:', e);
        }
      }
    }

    // 4. If title is still missing, derive clean human title from filename
    if (!fallbackHint.titleEnglish && !fallbackHint.titleHindi) {
      const baseName = path.parse(targetPath).name;
      const cleanTitle = baseName
        .replace(/^Video-\d+_/i, '')
        .replace(/_\d+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();
      fallbackHint.titleEnglish = cleanTitle;
      fallbackHint.titleHindi = cleanTitle;
    }

    // 5. Run transcription with hardware acoustic-locked word-level timestamps
    const baseLang = lang === 'hinglish' ? 'hi' : lang;
    const result = await transcribeAudio(audioTargetPath, baseLang, fallbackHint, forceRefresh === true);

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

    // 6. Dual-cache sync metadata so both original video path and extracted audio path hit instant cache
    if (result.syncedSegments && result.syncedSegments.length > 0) {
      const cacheData = {
        provider: 'gemini',
        titleHindi: result.titleHindi,
        titleEnglish: result.titleEnglish,
        acousticLocked: true,
        syncVersion: result.wordTimingSource === 'model-word-level' ? 5 : 4,
        wordTimingSource: result.wordTimingSource || 'phrase-estimated',
        wordTimingLanguage: result.wordTimingLanguage,
        segments: result.syncedSegments,
        sfxCues: result.sfxCues || [],
        audioAnalysis: result.audioAnalysis || null,
        fillerSegments: result.fillerSegments || [],
        updatedAt: new Date().toISOString(),
      };
      try {
        fs.writeFileSync(`${targetPath}.sync.json`, JSON.stringify(cacheData, null, 2), 'utf8');
        if (audioTargetPath !== targetPath) {
          fs.writeFileSync(`${audioTargetPath}.sync.json`, JSON.stringify(cacheData, null, 2), 'utf8');
        }
      } catch {}

      // Update candidate in project manifest if matched
      if (matchedCandidate && projectManifestPath) {
        try {
          const manifest = JSON.parse(fs.readFileSync(projectManifestPath, 'utf8'));
          const cIndex = (manifest.candidates || []).findIndex((c: any) => c.id === matchedCandidate.id);
          if (cIndex !== -1) {
            manifest.candidates[cIndex].syncedSegments = result.syncedSegments;
            if (result.rawTranscriptEnglish) manifest.candidates[cIndex].transcriptEnglish = result.rawTranscriptEnglish;
            if (result.rawTranscriptHindi) manifest.candidates[cIndex].transcriptHindi = result.rawTranscriptHindi;
            fs.writeFileSync(projectManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
          }
        } catch {}
      }
    }

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
      wordTimingSource: result.wordTimingSource || 'phrase-estimated',
      wordTimingLanguage: result.wordTimingLanguage,
      language: lang,
      sfxCues: result.sfxCues || [],
      audioAnalysis: result.audioAnalysis || null,
      fillerSegments: result.fillerSegments || [],
    });
  } catch (err: any) {
    console.error('Transcription API error:', err);
    const retryable = isTemporaryGeminiError(err);
    return NextResponse.json(
      { error: retryable ? 'Google speech recognition is temporarily busy. Automatic retries did not complete. Your audio is unchanged; please retry shortly.' : err.message || 'Audio transcription failed', retryable },
      { status: retryable || /not configured|GEMINI_API_KEY/.test(err.message || '') ? 503 : 500 }
    );
  }
}

