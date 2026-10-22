import { NextRequest, NextResponse } from 'next/server';
import {
  checkOllamaStatus,
  loadAppSettings,
  saveAppSettings,
  getOllamaModel,
  getOllamaBaseUrl,
  OLLAMA_AVAILABLE_MODELS,
  GEMINI_AVAILABLE_MODELS,
  getAiProvider,
} from '@/lib/config';
import { testOllamaConnection } from '@/lib/ollama';
import { testGeminiConnection } from '@/lib/gemini';
import { validateSession } from '@/lib/auth';

export async function GET() {
  try {
    const status = await checkOllamaStatus();
    const settings = loadAppSettings();
    const provider = getAiProvider();

    return NextResponse.json({
      success: true,
      provider,
      // Active display model
      model: provider === 'gemini' ? (settings.geminiModel || 'gemini-2.5-flash') : status.model,
      // Ollama details
      ollamaModel: status.model,
      baseUrl: status.baseUrl,
      configured: status.configured,
      availableOllamaModels: OLLAMA_AVAILABLE_MODELS,
      // Gemini details (User's personal key)
      geminiModel: settings.geminiModel || 'gemini-2.5-flash',
      hasCustomApiKey: Boolean(settings.geminiApiKey),
      availableGeminiModels: GEMINI_AVAILABLE_MODELS,
      // Fallback compatibility catalog
      availableModels: provider === 'gemini' ? GEMINI_AVAILABLE_MODELS : OLLAMA_AVAILABLE_MODELS,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, provider = 'ollama', model, baseUrl, apiKey } = body;

    if (action === 'test') {
      if (provider === 'gemini') {
        const testResult = await testGeminiConnection(model, apiKey);
        return NextResponse.json(testResult);
      } else {
        const testResult = await testOllamaConnection(model, baseUrl);
        return NextResponse.json(testResult);
      }
    }

    // Security: Require active session in production when saving system settings
    if (process.env.NODE_ENV === 'production') {
      const sessionToken = req.cookies.get('reelspark_session')?.value;
      const user = sessionToken ? await validateSession(sessionToken) : null;
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Sign in required to update settings' },
          { status: 401 }
        );
      }
    }

    // Save settings
    const updated = saveAppSettings({
      aiProvider: provider,
      ollamaModel: provider === 'ollama' ? model : undefined,
      ollamaBaseUrl: baseUrl,
      geminiModel: provider === 'gemini' ? model : undefined,
      geminiApiKey: apiKey !== undefined ? (apiKey ? apiKey.trim() : '') : undefined,
    });

    const status = await checkOllamaStatus();

    return NextResponse.json({
      success: true,
      message: 'AI settings updated successfully',
      provider: updated.aiProvider,
      model: updated.aiProvider === 'gemini' ? (updated.geminiModel || 'gemini-2.5-flash') : status.model,
      baseUrl: status.baseUrl,
      configured: updated.aiProvider === 'gemini' ? Boolean(updated.geminiApiKey) : status.configured,
      hasCustomApiKey: Boolean(updated.geminiApiKey),
      availableModels: updated.aiProvider === 'gemini' ? GEMINI_AVAILABLE_MODELS : OLLAMA_AVAILABLE_MODELS,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
