import path from 'path';
import fs from 'fs';
import os from 'os';

const storageBase = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(os.tmpdir(), 'reelspark_storage')
    : path.join(process.cwd(), 'storage');

export const APP_CONFIG = {
  appName: 'ReelMaker — Local Studio',
  version: '1.0.0',
  /** Default Ollama Model */
  defaultOllamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  /** Default Ollama Host Base URL */
  defaultOllamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  maxClipDurationSeconds: 60,
  storageRoot: storageBase,
  projectsDir: path.join(storageBase, 'projects'),
  tempDir: path.join(storageBase, 'temp'),
  binDir: path.join(process.cwd(), 'bin'),
};

/**
 * Resolve FFmpeg binary path.
 */
export function getFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const localExe = path.join(APP_CONFIG.binDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localExe)) {
    return localExe;
  }

  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

/**
 * Resolve FFprobe binary path.
 */
export function getFfprobePath(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }

  const localExe = path.join(APP_CONFIG.binDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  if (fs.existsSync(localExe)) {
    return localExe;
  }

  return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
}

/**
 * Verify whether FFmpeg is available.
 */
export async function checkFfmpegStatus(): Promise<{ available: boolean; path: string; version?: string; error?: string }> {
  const binary = getFfmpegPath();
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-version']);
    const output = stdout || stderr;
    const firstLine = output.split('\n')[0] || '';
    return { available: true, path: binary, version: firstLine.trim() };
  } catch (err: any) {
    return {
      available: false,
      path: binary,
      error: err?.message || 'FFmpeg executable not found or failed to execute',
    };
  }
}

/**
 * Verify whether FFprobe is available.
 */
export async function checkFfprobeStatus(): Promise<{ available: boolean; path: string; version?: string; error?: string }> {
  const binary = getFfprobePath();
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-version']);
    const output = stdout || stderr;
    const firstLine = output.split('\n')[0] || '';
    return { available: true, path: binary, version: firstLine.trim() };
  } catch (err: any) {
    return {
      available: false,
      path: binary,
      error: err?.message || 'FFprobe executable not found or failed to execute',
    };
  }
}

export interface OllamaModelInfo {
  id: string;
  name: string;
  badge?: string;
  description: string;
  speed: string;
  quality: string;
  recommended?: boolean;
}

export const OLLAMA_AVAILABLE_MODELS: OllamaModelInfo[] = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2 (3B)',
    badge: 'Default / Recommended',
    description: 'Lightweight, ultra-fast 3B model for instant viral clip candidate discovery and scoring with minimal RAM.',
    speed: 'Ultra Fast',
    quality: 'Very High',
    recommended: true,
  },
  {
    id: 'llama3.1',
    name: 'Llama 3.1 (8B)',
    badge: 'Deep Reasoning',
    description: 'Meta’s powerful 8B model with frontier logic for complex podcasts, philosophical talks, and humor.',
    speed: 'Fast',
    quality: 'Maximum',
  },
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5 (7B)',
    badge: 'Best for Hindi & Multilingual',
    description: 'Outstanding multilingual awareness with native Hindi and Hinglish sentence understanding.',
    speed: 'Fast',
    quality: 'Maximum',
  },
  {
    id: 'mistral',
    name: 'Mistral (7B)',
    badge: 'Creative & Catchy',
    description: 'Mistral 7B optimized for engaging viral punchlines, hooks, and story highlights.',
    speed: 'Very Fast',
    quality: 'High',
  },
  {
    id: 'gemma2',
    name: 'Gemma 2 (9B)',
    badge: 'Google Open Weights',
    description: 'Google’s open-weights architecture for deep educational and inspirational topics.',
    speed: 'Moderate',
    quality: 'Very High',
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini (3.8B)',
    badge: 'Ultra Lightweight',
    description: 'Microsoft compact model that runs smoothly on any low-end hardware or CPU without GPU.',
    speed: 'Maximum',
    quality: 'Good',
  },
];

export type AiProvider = 'ollama' | 'gemini';

export interface AppSettings {
  aiProvider?: AiProvider;
  ollamaModel: string;
  ollamaBaseUrl: string;
  // User personal Gemini API settings
  geminiModel?: string;
  geminiApiKey?: string;
}

export function getSettingsFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'settings.json');
}

export function loadAppSettings(): AppSettings {
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        aiProvider: data.aiProvider || 'ollama',
        ollamaModel: data.ollamaModel || process.env.OLLAMA_MODEL || APP_CONFIG.defaultOllamaModel,
        ollamaBaseUrl: data.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || APP_CONFIG.defaultOllamaBaseUrl,
        geminiModel: data.geminiModel,
        geminiApiKey: data.geminiApiKey,
      };
    }
  } catch (err) {
    console.warn('Failed to read settings.json:', err);
  }
  return {
    aiProvider: 'ollama',
    ollamaModel: process.env.OLLAMA_MODEL || APP_CONFIG.defaultOllamaModel,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || APP_CONFIG.defaultOllamaBaseUrl,
  };
}

export function saveAppSettings(newSettings: Partial<AppSettings>): AppSettings {
  try {
    if (!fs.existsSync(APP_CONFIG.storageRoot)) {
      fs.mkdirSync(APP_CONFIG.storageRoot, { recursive: true });
    }
    const current = loadAppSettings();
    const updated: AppSettings = {
      aiProvider: newSettings.aiProvider || current.aiProvider || 'ollama',
      ollamaModel: newSettings.ollamaModel || current.ollamaModel || APP_CONFIG.defaultOllamaModel,
      ollamaBaseUrl: newSettings.ollamaBaseUrl || current.ollamaBaseUrl || APP_CONFIG.defaultOllamaBaseUrl,
      geminiModel: newSettings.geminiModel || current.geminiModel,
      geminiApiKey: newSettings.geminiApiKey !== undefined ? newSettings.geminiApiKey : current.geminiApiKey,
    };
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(updated, null, 2), 'utf8');

    // Update runtime env
    if (updated.ollamaModel) {
      process.env.OLLAMA_MODEL = updated.ollamaModel;
      APP_CONFIG.defaultOllamaModel = updated.ollamaModel;
    }
    if (updated.ollamaBaseUrl) {
      process.env.OLLAMA_BASE_URL = updated.ollamaBaseUrl;
      APP_CONFIG.defaultOllamaBaseUrl = updated.ollamaBaseUrl;
    }

    return updated;
  } catch (err) {
    console.error('Failed to save settings.json:', err);
    throw err;
  }
}

export function getAiProvider(): AiProvider {
  const settings = loadAppSettings();
  return settings.aiProvider || 'ollama';
}

export function getOllamaModel(): string {
  const settings = loadAppSettings();
  return settings.ollamaModel || process.env.OLLAMA_MODEL || APP_CONFIG.defaultOllamaModel;
}

export function getOllamaBaseUrl(): string {
  const settings = loadAppSettings();
  return settings.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || APP_CONFIG.defaultOllamaBaseUrl;
}

/** True when this process runs inside Render rather than on the user's computer. */
export function isHostedRuntime(): boolean {
  return process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);
}

/** A loopback Ollama URL points to this process's machine, not the browser user's machine. */
export function isLoopbackOllamaUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Check whether Ollama is active and return model status.
 */
export async function checkOllamaStatus(): Promise<{
  configured: boolean;
  model: string;
  baseUrl: string;
  availableModels: OllamaModelInfo[];
}> {
  const model = getOllamaModel();
  const baseUrl = getOllamaBaseUrl();

  let configured = false;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    configured = res.ok;
  } catch {
    configured = false;
  }

  return {
    configured,
    model,
    baseUrl,
    availableModels: OLLAMA_AVAILABLE_MODELS,
  };
}

// ─── Backward Compatibility Wrappers (to prevent breaking legacy references) ─

export const GEMINI_AVAILABLE_MODELS = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Preview)',
    badge: 'Fastest Multimodal',
    description: 'Next-gen frontier flash model optimized for real-time video understanding, speech alignment, and virality scoring.',
    speed: 'Ultra Fast (~1.5s)',
    quality: 'Maximum',
  },
  {
    id: 'gemini-3.0-flash',
    name: 'Gemini 3.0 Flash',
    badge: 'Recommended',
    description: 'Workhorse balanced model with deep semantic reasoning and high context window.',
    speed: 'Very Fast (~2.0s)',
    quality: 'High',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'Reliable Stable',
    description: 'Previous-generation production flash model with predictable outputs and high rate-limit tolerance.',
    speed: 'Fast (~2.5s)',
    quality: 'Standard',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    badge: 'Legacy Fast',
    description: 'High-speed legacy flash variant with low latency.',
    speed: 'Fast',
    quality: 'Good',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    badge: 'Legacy Standard',
    description: 'Long-standing standard flash model.',
    speed: 'Fast',
    quality: 'Good',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    badge: 'Deep Reasoning',
    description: 'Pro tier reasoning model for complex analysis.',
    speed: 'Moderate',
    quality: 'High',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    badge: 'Frontier Pro',
    description: 'High parameter frontier pro model.',
    speed: 'Moderate',
    quality: 'Maximum',
  },
];

export function getGeminiModel(): string {
  const settings = loadAppSettings();
  return settings.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

export function checkGeminiStatus(): {
  configured: boolean;
  model: string;
  availableModels: any[];
} {
  const settings = loadAppSettings();
  const apiKey = process.env.GEMINI_API_KEY || settings.geminiApiKey;
  return {
    configured: Boolean(apiKey && apiKey.trim().length > 0),
    model: settings.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    availableModels: GEMINI_AVAILABLE_MODELS,
  };
}

export function resolveApiGeminiModel(modelId?: string): string {
  return modelId || getGeminiModel();
}

export function getGeminiFallbackChain(preferredModel?: string): string[] {
  const base = preferredModel || getGeminiModel();
  return [base, 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
}
