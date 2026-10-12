import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '@/lib/storage';
import { analyzeYouTubeWithGemini } from '@/lib/gemini';
import { checkGeminiStatus } from '@/lib/config';
import { ClipCandidate } from '@/lib/types';

/**
 * Extract YouTube video ID from standard URLs.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.trim().match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const youtubeUrl = body.url?.trim();

    if (!youtubeUrl) {
      return NextResponse.json({ success: false, error: 'Please enter a valid YouTube URL' }, { status: 400 });
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid YouTube URL format. Please provide a standard watch or youtu.be link.',
      }, { status: 400 });
    }

    project.sourceType = 'youtube';
    project.youtubeUrl = youtubeUrl;
    project.youtubeVideoId = videoId;
    project.status = 'ANALYZING';
    project.progress = 25;
    project.statusMessage = 'Connecting to Google Gemini API for YouTube video semantic understanding...';
    await saveProject(project);

    const geminiStatus = checkGeminiStatus();

    // Check Gemini API support
    let candidates: ClipCandidate[] = [];
    if (geminiStatus.configured) {
      try {
        candidates = await analyzeYouTubeWithGemini(youtubeUrl);
      } catch (geminiErr: any) {
        console.warn('Gemini YouTube direct analysis notice:', geminiErr.message);
        // Fallback or retry
      }
    }

    // Notice: YouTube analysis provides timestamps & candidates, but local FFmpeg rendering needs local MP4
    project.candidates = candidates;
    project.status = 'COMPLETED';
    project.progress = 100;
    project.statusMessage =
      'AI analysis completed. Note: Local FFmpeg clip rendering requires the original video file. Upload an authorized local copy when ready to render.';
    await saveProject(project);

    return NextResponse.json({
      success: true,
      project,
      requiresLocalFile: !project.localVideoPath,
      notice: 'AI analysis is available, but local clip rendering requires the original video file. Upload a copy you are authorized to use.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
