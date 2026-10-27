import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-access';
import { checkFfmpegStatus, checkOllamaCloudStatus, checkGeminiStatus, getAiProvider, loadAppSettings } from '@/lib/config';
import { publishingRuntimeStatus } from '@/lib/social-intelligence/publishing-runtime';

export async function GET(req: Request) {
  try {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const ffmpeg = await checkFfmpegStatus();
    const ollama = await checkOllamaCloudStatus();
    const gemini = checkGeminiStatus();
    const provider = getAiProvider();
    const settings = loadAppSettings();

    return NextResponse.json({
      status: 'ok',
      publishing: publishingRuntimeStatus(req.url),
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
