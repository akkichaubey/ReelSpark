import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-access';
import { checkFfmpegStatus, checkOllamaStatus, checkGeminiStatus, getAiProvider, loadAppSettings } from '@/lib/config';

export async function GET(req: Request) {
  try {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const ffmpeg = await checkFfmpegStatus();
    const ollama = await checkOllamaStatus();
    const gemini = checkGeminiStatus();
    const provider = getAiProvider();
    const settings = loadAppSettings();

    return NextResponse.json({
      status: 'ok',
      provider,
      ffmpeg: {
        available: ffmpeg.available,
        path: ffmpeg.path,
        version: ffmpeg.version,
        error: ffmpeg.error,
      },
      ollama: {
        configured: ollama.configured,
        model: ollama.model,
        baseUrl: ollama.baseUrl,
        availableModels: ollama.availableModels,
      },
      gemini: {
        configured: Boolean(settings.geminiApiKey),
        model: settings.geminiModel || 'gemini-2.5-flash',
        hasKey: Boolean(settings.geminiApiKey),
        availableModels: gemini.availableModels,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
