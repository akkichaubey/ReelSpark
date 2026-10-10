import { NextResponse } from 'next/server';
import { checkFfmpegStatus, checkGeminiStatus } from '@/lib/config';

export async function GET() {
  try {
    const ffmpeg = await checkFfmpegStatus();
    const gemini = checkGeminiStatus();

    return NextResponse.json({
      status: 'ok',
      ffmpeg: {
        available: ffmpeg.available,
        path: ffmpeg.path,
        version: ffmpeg.version,
        error: ffmpeg.error,
      },
      gemini: {
        configured: gemini.configured,
        model: gemini.model,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
