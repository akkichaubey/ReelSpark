import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, loadProject, sanitizeFilename } from '@/lib/storage';
import { extractClipAudio } from '@/lib/ffmpeg';
import { renderRemotionReelVideo } from '@/lib/caption-maker/remotion-renderer';
import { generatePhraseLevelSrt, generateWordLevelSrt } from '@/lib/caption-maker/srt-generator';
import { CaptionGroup, CaptionStyle, ImageFitMode, ImagePosition, OutputSettings, TranscriptWord } from '@/lib/caption-maker/types';
import { saveBase64Image, mergeThumbnailIntoVideo, ThumbnailMergeMode } from '@/lib/caption-maker/thumbnail-merger';

export async function POST(req: NextRequest) {
  try {
    const isStream =
      req.nextUrl.searchParams.get('stream') === 'true' ||
      req.headers.get('accept')?.includes('text/event-stream');

    const body = await req.json();
    const {
      projectId = `reel_${Date.now()}`,
      imagePath: rawImagePath,
      imageUrl: rawImageUrl,
      audioPath: rawAudioPath,
      audioUrl: rawAudioUrl,
      transcript: rawTranscript,
      captionGroups,
      captionStyle,
      outputSettings,
      imageFitMode: rawImageFitMode,
      imagePosition: rawImagePosition,
      thumbnailDataUrl,
      thumbnailPath: rawThumbnailPath,
      mergeThumbnail = true,
      thumbnailMergeMode = 'intro_and_poster',
      thumbnailIntroDuration = 0.000001,
    }: {
      projectId?: string;
      imagePath?: string;
      imageUrl?: string;
      audioPath?: string;
      audioUrl?: string;
      transcript?: TranscriptWord[];
      captionGroups?: CaptionGroup[];
      captionStyle: CaptionStyle;
      outputSettings: OutputSettings;
      imageFitMode?: ImageFitMode;
      imagePosition?: ImagePosition;
      imageScale?: number;
      thumbnailDataUrl?: string;
      thumbnailPath?: string;
      mergeThumbnail?: boolean;
      thumbnailMergeMode?: ThumbnailMergeMode;
      thumbnailIntroDuration?: number;
    } = body;

    // 1. Resolve image file path
    const imageUrl = rawImageUrl || body.image?.fileUrl;
    let imagePath = rawImagePath || body.image?.storagePath;

    if (imagePath && !path.isAbsolute(imagePath)) {
      imagePath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), imagePath);
    }

    if ((!imagePath || !fs.existsSync(/*turbopackIgnore: true*/ imagePath)) && imageUrl) {
      if (imageUrl.includes('/api/files/')) {
        const rel = imageUrl.replace(/.*\/api\/files\//, '');
        imagePath = path.join(APP_CONFIG.storageRoot, rel);
      } else if (imageUrl.includes('sample-image.jpg')) {
        imagePath = path.join(process.cwd(), 'public', 'sample-image.jpg');
      }
    }

    // 2. Resolve audio file path
    const audioUrl = rawAudioUrl || body.audio?.fileUrl;
    let audioPath = rawAudioPath || body.audio?.storagePath;

    if (audioPath && !path.isAbsolute(audioPath)) {
      audioPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), audioPath);
    }

    if ((!audioPath || !fs.existsSync(/*turbopackIgnore: true*/ audioPath)) && audioUrl) {
      if (audioUrl.includes('/api/files/')) {
        const rel = audioUrl.replace(/.*\/api\/files\//, '');
        audioPath = path.join(APP_CONFIG.storageRoot, rel);
      } else if (audioUrl.includes('/clip-audio')) {
        // Extract project ID and clipId from /api/projects/:id/clip-audio?clipId=:clipId
        const match = audioUrl.match(/\/api\/projects\/([^/?#]+)\/clip-audio/);
        const urlObj = new URL(audioUrl, 'http://localhost');
        const clipId = urlObj.searchParams.get('clipId');

        if (match && clipId) {
          const projId = match[1];
          const clipSafeId = sanitizeFilename(clipId);
          const candidatePath = path.join(APP_CONFIG.storageRoot, 'projects', projId, 'clips', `${clipSafeId}_audio.mp3`);

          if (fs.existsSync(/*turbopackIgnore: true*/ candidatePath) && fs.statSync(/*turbopackIgnore: true*/ candidatePath).size > 1000) {
            audioPath = candidatePath;
          } else {
            const proj = await loadProject(projId);
            if (proj) {
              const candidate = proj.candidates.find((c) => c.id === clipId);
              const sourceVideoPath = candidate?.renderedVideoPath && fs.existsSync(/*turbopackIgnore: true*/ candidate.renderedVideoPath)
                ? candidate.renderedVideoPath
                : proj.localVideoPath && fs.existsSync(/*turbopackIgnore: true*/ proj.localVideoPath)
                ? proj.localVideoPath
                : undefined;

              if (sourceVideoPath && candidate) {
                const isRenderedClip = sourceVideoPath === candidate.renderedVideoPath;
                await extractClipAudio({
                  sourceVideoPath,
                  outputPath: candidatePath,
                  start: isRenderedClip ? 0 : candidate.start,
                  end: isRenderedClip ? candidate.duration : candidate.end,
                  normalizeAudio: false,
                });
                if (fs.existsSync(/*turbopackIgnore: true*/ candidatePath)) {
                  audioPath = candidatePath;
                }
              }
            }
          }
        }
      } else if (audioUrl.includes('sample-audio.mp3')) {
        audioPath = path.join(process.cwd(), 'public', 'sample-audio.mp3');
      }
    }

    if (!imagePath || !fs.existsSync(/*turbopackIgnore: true*/ imagePath)) {
      const fallbackSample = path.join(process.cwd(), 'public', 'sample-image.jpg');
      if (fs.existsSync(/*turbopackIgnore: true*/ fallbackSample)) {
        imagePath = fallbackSample;
      } else {
        return NextResponse.json(
          { error: 'Background image not found. Please upload an image.' },
          { status: 400 }
        );
      }
    }
    if (!audioPath || !fs.existsSync(/*turbopackIgnore: true*/ audioPath)) {
      const fallbackSample = path.join(process.cwd(), 'public', 'sample-audio.mp3');
      if (fs.existsSync(/*turbopackIgnore: true*/ fallbackSample)) {
        audioPath = fallbackSample;
      } else {
        return NextResponse.json(
          { error: 'Audio file not found. Please ensure the clip audio is prepared.' },
          { status: 400 }
        );
      }
    }

    // 3. Resolve transcript words and groups
    const resolvedGroups: CaptionGroup[] = captionGroups || [];
    const resolvedTranscript: TranscriptWord[] =
      rawTranscript ||
      body.transcript ||
      (resolvedGroups.length > 0 ? resolvedGroups.flatMap((g) => g.words) : []);

    const imageFitMode = rawImageFitMode || body.image?.fitMode || 'contain';
    const imagePosition = rawImagePosition || body.image?.position || 'bottom-left';
    const imageScale = body.image?.scale ?? body.imageScale ?? 100;
    const mediaType: 'image' | 'video' = body.image?.mediaType || body.mediaType || 'image';

    // 4. Prepare project render directory
    const safeProjectId = sanitizeFilename(projectId);
    const renderDir = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'renders', safeProjectId);
    assertSafePath(renderDir, APP_CONFIG.storageRoot);

    if (!fs.existsSync(renderDir)) {
      fs.mkdirSync(renderDir, { recursive: true });
    }

    const outputMp4Path = path.join(renderDir, `${safeProjectId}_remotion.mp4`);
    const outputSrtPath = path.join(renderDir, `${safeProjectId}_captions.srt`);

    // 5. Write SRT Subtitle File
    const srtContent =
      captionStyle.captionMode === 'word-by-word'
        ? generateWordLevelSrt(resolvedTranscript)
        : generatePhraseLevelSrt(resolvedGroups);
    await fs.promises.writeFile(outputSrtPath, srtContent, 'utf8');

    const videoRel = `caption-maker/renders/${safeProjectId}/${safeProjectId}_remotion.mp4`;
    const srtRel = `caption-maker/renders/${safeProjectId}/${safeProjectId}_captions.srt`;

    // 6. Handle SSE Streaming if requested
    if (isStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'progress', progress: 5, stage: 'bundling' })}\n\n`
              )
            );

            const renderRes = await renderRemotionReelVideo({
              imagePath,
              imageUrl,
              audioPath,
              audioUrl,
              outputPath: outputMp4Path,
              groups: resolvedGroups,
              words: resolvedTranscript,
              style: captionStyle,
              outputSettings,
              imageFitMode,
              imagePosition,
              imageScale,
              mediaType,
              onProgress: (pct) => {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'progress', progress: pct, stage: 'rendering' })}\n\n`
                  )
                );
              },
            });

            // Automatically merge thumbnail into Remotion video
            let thumbnailMerged = false;
            let resolvedThumb = rawThumbnailPath;
            let thumbnailWebUrl: string | undefined = undefined;
            if (mergeThumbnail !== false) {
              if (thumbnailDataUrl) {
                resolvedThumb = path.join(renderDir, `${safeProjectId}_cover.png`);
                await saveBase64Image(thumbnailDataUrl, resolvedThumb);
                thumbnailWebUrl = `/api/files/caption-maker/renders/${safeProjectId}/${safeProjectId}_cover.png`;
              } else if (!resolvedThumb && body.thumbnailUrl?.startsWith('data:image')) {
                resolvedThumb = path.join(renderDir, `${safeProjectId}_cover.png`);
                await saveBase64Image(body.thumbnailUrl, resolvedThumb);
                thumbnailWebUrl = `/api/files/caption-maker/renders/${safeProjectId}/${safeProjectId}_cover.png`;
              } else if (body.thumbnailUrl && !body.thumbnailUrl.startsWith('data:image')) {
                thumbnailWebUrl = body.thumbnailUrl;
              }

              if (resolvedThumb && fs.existsSync(/*turbopackIgnore: true*/ resolvedThumb)) {
                try {
                  await mergeThumbnailIntoVideo({
                    videoPath: outputMp4Path,
                    thumbnailPath: resolvedThumb,
                    mergeMode: thumbnailMergeMode,
                    introDuration: thumbnailIntroDuration ?? 0.000001,
                    width: outputSettings.width,
                    height: outputSettings.height,
                  });
                  thumbnailMerged = true;
                } catch (mergeErr: any) {
                  console.warn('Failed to merge thumbnail in Remotion video:', mergeErr.message);
                }
              }
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'complete',
                  success: true,
                  videoUrl: `/api/files/${videoRel}`,
                  videoPath: outputMp4Path,
                  srtUrl: `/api/files/${srtRel}`,
                  srtPath: outputSrtPath,
                  duration: renderRes.duration,
                  thumbnailMerged,
                  thumbnailUrl: thumbnailWebUrl,
                })}\n\n`
              )
            );
            controller.close();
          } catch (err: any) {
            console.error('Remotion render stream error:', err);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: err.message || 'Remotion video rendering failed',
                })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // 7. Non-streaming standard JSON response
    const renderRes = await renderRemotionReelVideo({
      imagePath,
      imageUrl,
      audioPath,
      audioUrl,
      outputPath: outputMp4Path,
      groups: resolvedGroups,
      words: resolvedTranscript,
      style: captionStyle,
      outputSettings,
      imageFitMode,
      imagePosition,
      imageScale,
      mediaType,
    });

    let thumbnailMerged = false;
    let resolvedThumb = rawThumbnailPath;
    let thumbnailWebUrl: string | undefined = undefined;
    if (mergeThumbnail !== false) {
      if (thumbnailDataUrl) {
        resolvedThumb = path.join(renderDir, `${safeProjectId}_cover.png`);
        await saveBase64Image(thumbnailDataUrl, resolvedThumb);
        thumbnailWebUrl = `/api/files/caption-maker/renders/${safeProjectId}/${safeProjectId}_cover.png`;
      } else if (!resolvedThumb && body.thumbnailUrl?.startsWith('data:image')) {
        resolvedThumb = path.join(renderDir, `${safeProjectId}_cover.png`);
        await saveBase64Image(body.thumbnailUrl, resolvedThumb);
        thumbnailWebUrl = `/api/files/caption-maker/renders/${safeProjectId}/${safeProjectId}_cover.png`;
      } else if (body.thumbnailUrl && !body.thumbnailUrl.startsWith('data:image')) {
        thumbnailWebUrl = body.thumbnailUrl;
      }

      if (resolvedThumb && fs.existsSync(/*turbopackIgnore: true*/ resolvedThumb)) {
        try {
          await mergeThumbnailIntoVideo({
            videoPath: outputMp4Path,
            thumbnailPath: resolvedThumb,
            mergeMode: thumbnailMergeMode,
            introDuration: thumbnailIntroDuration ?? 0.000001,
            width: outputSettings.width,
            height: outputSettings.height,
          });
          thumbnailMerged = true;
        } catch (mergeErr: any) {
          console.warn('Failed to merge thumbnail in Remotion video:', mergeErr.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      videoUrl: `/api/files/${videoRel}`,
      videoPath: outputMp4Path,
      srtUrl: `/api/files/${srtRel}`,
      srtPath: outputSrtPath,
      duration: renderRes.duration,
      thumbnailMerged,
      thumbnailUrl: thumbnailWebUrl,
    });
  } catch (err: any) {
    console.error('Caption Maker Remotion render error:', err);
    return NextResponse.json(
      { error: err.message || 'Remotion video rendering failed' },
      { status: 500 }
    );
  }
}
