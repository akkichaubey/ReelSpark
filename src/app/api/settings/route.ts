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
  isHostedRuntime,
  isLoopbackOllamaUrl,
} from '@/lib/config';
import { testOllamaConnection } from '@/lib/ollama';
import { testGeminiConnection } from '@/lib/gemini';
import { requireAdmin } from '@/lib/admin-access';
import { z } from 'zod';

const SettingsRequest = z.object({
  action: z.enum(['test', 'save']).optional(),
  provider: z.enum(['ollama', 'gemini']).default('ollama'),
  model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.:/-]+$/).optional(),
  baseUrl: z.string().url().max(2048).optional(),
  apiKey: z.string().max(512).optional(),
}).strict();

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const status = await checkOllamaStatus();
    const settings = loadAppSettings();
    const savedProvider = getAiProvider();
    const ollamaUnavailableReason = isHostedRuntime() && isLoopbackOllamaUrl(status.baseUrl)
      ? 'This hosted ReelSpark server cannot reach Ollama on your PC through 127.0.0.1. Use Gemini with your API key, or configure a securely reachable Ollama server.'
      : null;
    const provider = ollamaUnavailableReason && savedProvider === 'ollama' ? 'gemini' : savedProvider;

    return NextResponse.json({
      success: true,
      provider,
      // Active display model
      model: provider === 'gemini' ? (settings.geminiModel || 'gemini-2.5-flash') : status.model,
      // Ollama details
      ollamaModel: status.model,
      baseUrl: status.baseUrl,
      configured: status.configured,
      hostedRuntime: isHostedRuntime(),
      ollamaUnavailableReason,
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
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const parsed = SettingsRequest.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid settings' }, { status: 400 });
    const body = parsed.data;
    const { action, provider = 'ollama', model, baseUrl, apiKey } = body;

    if (provider === 'ollama' && isHostedRuntime() && isLoopbackOllamaUrl(baseUrl || getOllamaBaseUrl())) {
      return NextResponse.json({
        success: false,
        error: 'Ollama at 127.0.0.1 is not available from the hosted ReelSpark server. Use Gemini with your API key, or configure a securely reachable Ollama server.',
      }, { status: 400 });
    }

    if (action === 'test') {
      if (provider === 'gemini') {
        const testResult = await testGeminiConnection(model, apiKey);
        return NextResponse.json(testResult);
      } else {
        const testResult = await testOllamaConnection(model, baseUrl);
        return NextResponse.json(testResult);
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
