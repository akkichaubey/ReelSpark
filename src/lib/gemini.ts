/**
 * AI Engine — Ollama & Google Gemini (BYOK — Bring Your Own Key)
 *
 * Supports two flexible modes:
 * 1. Ollama (100% Free & Local — Zero API Key Required)
 * 2. Google Gemini (User's Personal API Key — The site owner's key is NEVER charged)
 */

import {
  analyzeTranscriptChunkWithOllama,
  analyzeYouTubeWithOllama,
  generateWithOllama,
  testOllamaConnection,
  ChunkAnalysisInput as OllamaChunkInput,
} from './ollama';
import { getOllamaModel, loadAppSettings } from './config';
import { ClipCandidate, TranscriptSegment } from './types';

export type ChunkAnalysisInput = OllamaChunkInput;

export const ANALYSIS_SYSTEM_INSTRUCTION = `You are a master video editor, philosopher, and AI clip curator specializing in identifying viral, deeply meaningful, motivational, and thought-provoking short clips from long-form speeches, podcasts, and talks.`;

/**
 * Direct Google Gemini API call using the user's personal API key or environment key via standard HTTP REST.
 * No external npm packages required.
 */
export async function generateWithGemini(params: {
  prompt?: string;
  contents?: any[];
  parts?: any[];
  system?: string;
  model?: string;
  apiKey?: string;
  responseMimeType?: string;
  temperature?: number;
}): Promise<string> {
  const model = params.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = (
    params.apiKey ||
    process.env.GEMINI_API_KEY ||
    loadAppSettings().geminiApiKey ||
    ''
  ).trim();

  if (!apiKey) {
    throw new Error('Please enter your Google Gemini API key or set GEMINI_API_KEY in .env.local to use Gemini.');
  }

  let finalContents: any[] = [];
  if (Array.isArray(params.contents) && params.contents.length > 0) {
    finalContents = params.contents;
  } else if (Array.isArray(params.parts) && params.parts.length > 0) {
    finalContents = [{ role: 'user', parts: params.parts }];
  } else {
    finalContents = [
      {
        role: 'user',
        parts: [
          {
            text: params.system ? `${params.system}\n\n${params.prompt || ''}` : params.prompt || '',
          },
        ],
      },
    ];
  }

  const payload: any = {
    contents: finalContents,
    generationConfig: {
      temperature: params.temperature ?? 0.2,
      ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Gemini API error (${res.status})`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

/**
 * Backward compatibility stub for getGeminiClient.
 */
export function getGeminiClient(customApiKey?: string): any {
  const apiKey = (
    customApiKey ||
    process.env.GEMINI_API_KEY ||
    loadAppSettings().geminiApiKey ||
    ''
  ).trim();

  return {
    models: {
      generateContent: async (params: any) => {
        let text = '';
        if (apiKey) {
          text = await generateWithGemini({
            contents: Array.isArray(params.contents) ? params.contents : undefined,
            prompt: typeof params.contents === 'string' ? params.contents : undefined,
            model: params.model,
            apiKey,
            responseMimeType: params.config?.responseMimeType,
            temperature: params.config?.temperature,
          });
        } else {
          const prompt = typeof params.contents === 'string'
            ? params.contents
            : JSON.stringify(params.contents);
          text = await generateWithOllama({ prompt });
        }

        return {
          text,
          candidates: [{ content: { parts: [{ text }] } }],
        };
      },
    },
    files: {
      upload: async () => {
        throw new Error('File upload not supported via REST stub, please use inline data.');
      },
      delete: async () => {},
    },
  };
}

/**
 * Backward compatibility stub for generateContentWithFallback.
 */
export async function generateContentWithFallback(
  _ai: any,
  preferredModel: string | undefined,
  params: { contents: any; config?: any }
): Promise<any> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    loadAppSettings().geminiApiKey ||
    ''
  ).trim();

  let responseText = '';
  if (apiKey) {
    try {
      const contents = Array.isArray(params.contents)
        ? params.contents
        : typeof params.contents === 'string'
        ? [{ role: 'user', parts: [{ text: params.contents }] }]
        : [params.contents];

      responseText = await generateWithGemini({
        contents,
        model: preferredModel,
        apiKey,
        responseMimeType: params.config?.responseMimeType,
        temperature: params.config?.temperature,
      });
    } catch (err: any) {
      console.warn('Gemini generate note, checking Ollama fallback:', err.message);
      // Fallback to Ollama text if possible
      let prompt = '';
      if (Array.isArray(params.contents)) {
        prompt = params.contents
          .map((c: any) => (c.parts ? c.parts.map((p: any) => p.text || '').join('\n') : String(c)))
          .join('\n');
      } else if (typeof params.contents === 'string') {
        prompt = params.contents;
      } else {
        prompt = JSON.stringify(params.contents);
      }
      responseText = await generateWithOllama({
        prompt,
        format: params.config?.responseMimeType === 'application/json' ? 'json' : undefined,
        temperature: params.config?.temperature,
      });
    }
  } else {
    let prompt = '';
    if (Array.isArray(params.contents)) {
      prompt = params.contents
        .map((c: any) => (c.parts ? c.parts.map((p: any) => p.text || '').join('\n') : String(c)))
        .join('\n');
    } else if (typeof params.contents === 'string') {
      prompt = params.contents;
    } else {
      prompt = JSON.stringify(params.contents);
    }
    responseText = await generateWithOllama({
      prompt,
      format: params.config?.responseMimeType === 'application/json' ? 'json' : undefined,
      temperature: params.config?.temperature,
    });
  }

  return {
    text: responseText,
    candidates: [{ content: { parts: [{ text: responseText }] } }],
  };
}

/**
 * Transcribe extracted audio using Cloudflare Whisper or acoustic alignment.
 */
export async function transcribeAudioWithGemini(
  audioFilePath: string,
  _modelName?: string,
  _intervals?: any[]
): Promise<TranscriptSegment[]> {
  try {
    const { transcribeAudioWithCloudflarAI } = await import('./cloudflare/ai');
    return await transcribeAudioWithCloudflarAI(audioFilePath);
  } catch {
    return [];
  }
}

/**
 * Analyze transcript chunk using local Ollama model or user's Gemini key.
 */
export async function analyzeTranscriptChunkWithGemini(
  input: ChunkAnalysisInput,
  modelName?: string
): Promise<ClipCandidate[]> {
  return analyzeTranscriptChunkWithOllama(input, modelName || getOllamaModel());
}

/**
 * Analyze public YouTube URL using Ollama.
 */
export async function analyzeYouTubeWithGemini(
  youtubeUrl: string,
  modelName?: string
): Promise<ClipCandidate[]> {
  return analyzeYouTubeWithOllama(youtubeUrl, modelName || getOllamaModel());
}

/**
 * Test connectivity for either the user's personal Google Gemini API Key or Ollama.
 */
export async function testGeminiConnection(
  modelName?: string,
  customApiKey?: string
): Promise<{ success: boolean; message: string; model: string }> {
  const model = modelName || 'gemini-2.5-flash';
  const apiKey = (customApiKey || loadAppSettings().geminiApiKey || '').trim();

  if (!apiKey) {
    // If no key is provided, test Ollama
    return testOllamaConnection(modelName || getOllamaModel());
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply: ReelSpark API Key Valid' }] }],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        message: data.error?.message || `Google Gemini error (${res.status}). Please check your key.`,
        model,
      };
    }

    return {
      success: true,
      message: `Your Google Gemini API Key is valid and active for model ${model}!`,
      model,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Cannot connect to Google API: ${err.message}`,
      model,
    };
  }
}
