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
  /** Default Ollama Cloud starter model (API model IDs omit the :cloud suffix). */
  defaultOllamaModel: process.env.OLLAMA_CLOUD_MODEL || 'gemma4',
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

export const OLLAMA_CLOUD_MODELS: OllamaModelInfo[] = [
  {
    id: 'gemma4',
    name: 'Gemma 4 Cloud',
    badge: 'Free Starter Model',
    description: 'Ollama-hosted cloud model. Free accounts include a limited amount of starter usage; availability and limits are set by Ollama.',
    speed: 'Cloud hosted',
    quality: 'High',
    recommended: true,
  },
];

export type AiProvider = 'ollama-cloud' | 'gemini';

export interface AppSettings {
  aiProvider?: AiProvider;
  ollamaCloudModel: string;
  // User personal Gemini API settings
  geminiModel?: string;
  geminiApiKey?: string;
}

export function getSettingsFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'settings.json');
}

export function loadAppSettings(): AppSettings {
  const defaultProvider: AiProvider = process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'ollama-cloud';
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        // Migrate persisted local-Ollama preferences to the only Ollama mode now supported.
        aiProvider: data.aiProvider === 'gemini' ? 'gemini' : 'ollama-cloud',
        ollamaCloudModel: resolveOllamaCloudModel(data.ollamaCloudModel || data.ollamaModel),
        geminiModel: data.geminiModel,
        geminiApiKey: data.geminiApiKey,
      };
    }
  } catch (err) {
    console.warn('Failed to read settings.json:', err);
  }
  return {
    aiProvider: defaultProvider,
    ollamaCloudModel: resolveOllamaCloudModel(process.env.OLLAMA_CLOUD_MODEL || APP_CONFIG.defaultOllamaModel),
  };
}

export function saveAppSettings(newSettings: Partial<AppSettings>): AppSettings {
  try {
    if (!fs.existsSync(APP_CONFIG.storageRoot)) {
      fs.mkdirSync(APP_CONFIG.storageRoot, { recursive: true });
    }
    const current = loadAppSettings();
    const updated: AppSettings = {
      aiProvider: newSettings.aiProvider || current.aiProvider || 'ollama-cloud',
      ollamaCloudModel: resolveOllamaCloudModel(newSettings.ollamaCloudModel || current.ollamaCloudModel),
      geminiModel: newSettings.geminiModel || current.geminiModel,
      geminiApiKey: newSettings.geminiApiKey !== undefined ? newSettings.geminiApiKey : current.geminiApiKey,
    };
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(updated, null, 2), 'utf8');

    // Update runtime env
    process.env.OLLAMA_CLOUD_MODEL = updated.ollamaCloudModel;
    APP_CONFIG.defaultOllamaModel = updated.ollamaCloudModel;

    return updated;
  } catch (err) {
    console.error('Failed to save settings.json:', err);
    throw err;
  }
}

export function getAiProvider(): AiProvider {
  const settings = loadAppSettings();
  return settings.aiProvider || 'ollama-cloud';
}

export function getOllamaModel(): string {
  const settings = loadAppSettings();
  return resolveOllamaCloudModel(settings.ollamaCloudModel || process.env.OLLAMA_CLOUD_MODEL || APP_CONFIG.defaultOllamaModel);
}

/** Cloud API allowlist: keep ReelSpark on Ollama's free starter model. */
export function resolveOllamaCloudModel(model?: string): string {
  const requested = model?.replace(/:cloud$/, '');
  return OLLAMA_CLOUD_MODELS.some((entry) => entry.id === requested) ? requested! : 'gemma4';
}

export function hasOllamaCloudApiKey(): boolean {
  return Boolean(process.env.OLLAMA_API_KEY?.trim());
}

/**
 * Cloud readiness is based on a server-side key; do not send health probes that
 * consume free-tier inference credits just to render a status badge.
 */
export async function checkOllamaCloudStatus(): Promise<{
  configured: boolean;
  model: string;
  availableModels: OllamaModelInfo[];
}> {
  const model = getOllamaModel();
  return {
    configured: hasOllamaCloudApiKey(),
    model,
    availableModels: OLLAMA_CLOUD_MODELS,
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
