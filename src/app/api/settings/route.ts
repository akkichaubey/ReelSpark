import { NextRequest, NextResponse } from 'next/server';
import { checkGeminiStatus, loadAppSettings, saveAppSettings, getGeminiModel, GEMINI_AVAILABLE_MODELS } from '@/lib/config';
import { testGeminiConnection } from '@/lib/gemini';

export async function GET() {
  try {
    const status = checkGeminiStatus();
    const settings = loadAppSettings();

    return NextResponse.json({
      success: true,
      model: status.model,
      configured: status.configured,
      availableModels: GEMINI_AVAILABLE_MODELS,
      hasCustomApiKey: Boolean(settings.geminiApiKey),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, model, apiKey } = body;

    if (action === 'test') {
      const testResult = await testGeminiConnection(model, apiKey);
      return NextResponse.json(testResult);
    }

    // Save settings
    const updated = saveAppSettings({
      geminiModel: model,
      geminiApiKey: apiKey !== undefined ? (apiKey.trim() || undefined) : undefined,
    });

    const status = checkGeminiStatus();

    return NextResponse.json({
      success: true,
      message: 'Gemini model settings updated successfully',
      model: status.model,
      configured: status.configured,
      availableModels: GEMINI_AVAILABLE_MODELS,
      hasCustomApiKey: Boolean(updated.geminiApiKey),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
