import { NextRequest, NextResponse } from 'next/server';
import {
  checkOllamaCloudStatus,
  loadAppSettings,
  saveAppSettings,
  OLLAMA_CLOUD_MODELS,
  GEMINI_AVAILABLE_MODELS,
  getAiProvider,
  hasOllamaCloudApiKey,
} from '@/lib/config';
import { testOllamaCloudConnection } from '@/lib/ollama';
import { testGeminiConnection } from '@/lib/gemini';
import { requireAdmin } from '@/lib/admin-access';
import { z } from 'zod';

const SettingsRequest = z.object({
  action: z.enum(['test', 'save']).optional(),
  provider: z.enum(['ollama-cloud', 'gemini']).default('ollama-cloud'),
  model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.:/-]+$/).optional(),
  apiKey: z.string().max(512).optional(),
}).strict();

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const status = await checkOllamaCloudStatus();
    const settings = loadAppSettings();
    const provider = getAiProvider();

    return NextResponse.json({
      success: true,
      provider,
      // Active display model
      model: provider === 'gemini' ? (settings.geminiModel || 'gemini-2.5-flash') : status.model,
      // Ollama Cloud details. Never return the server-side key.
      ollamaModel: status.model,
      configured: status.configured,
      ollamaCloudApiKeyConfigured: hasOllamaCloudApiKey(),
      availableOllamaCloudModels: OLLAMA_CLOUD_MODELS,
      // Gemini details (User's personal key)
      geminiModel: settings.geminiModel || 'gemini-2.5-flash',
      hasCustomApiKey: Boolean(settings.geminiApiKey),
      availableGeminiModels: GEMINI_AVAILABLE_MODELS,
      // Fallback compatibility catalog
      availableModels: provider === 'gemini' ? GEMINI_AVAILABLE_MODELS : OLLAMA_CLOUD_MODELS,
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
    const { action, provider = 'ollama-cloud', model, apiKey } = body;

    if (action === 'test') {
      if (provider === 'gemini') {
        const testResult = await testGeminiConnection(model, apiKey);
        return NextResponse.json(testResult);
      } else {
        const testResult = await testOllamaCloudConnection(model);
        return NextResponse.json(testResult);
      }
    }

    if (provider === 'ollama-cloud' && !hasOllamaCloudApiKey()) {
      return NextResponse.json({
        success: false,
        error: 'Ollama Cloud is not configured. Add OLLAMA_API_KEY to the server environment, then restart or redeploy ReelSpark.',
      }, { status: 400 });
    }

    // Save settings
    const updated = saveAppSettings({
      aiProvider: provider,
      ollamaCloudModel: provider === 'ollama-cloud' ? model : undefined,
      geminiModel: provider === 'gemini' ? model : undefined,
      geminiApiKey: apiKey !== undefined ? (apiKey ? apiKey.trim() : '') : undefined,
    });

    const status = await checkOllamaCloudStatus();

    return NextResponse.json({
      success: true,
      message: 'AI settings updated successfully',
      provider: updated.aiProvider,
      model: updated.aiProvider === 'gemini' ? (updated.geminiModel || 'gemini-2.5-flash') : status.model,
      configured: updated.aiProvider === 'gemini' ? Boolean(updated.geminiApiKey) : status.configured,
      hasCustomApiKey: Boolean(updated.geminiApiKey),
      availableModels: updated.aiProvider === 'gemini' ? GEMINI_AVAILABLE_MODELS : OLLAMA_CLOUD_MODELS,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
