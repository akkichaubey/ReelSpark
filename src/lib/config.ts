import path from 'path';
import fs from 'fs';
import os from 'os';

const storageBase = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(os.tmpdir(), 'reelspark_storage')
    : path.join(process.cwd(), 'storage');

export const APP_CONFIG = {
  appName: 'ReelSpark — Local Studio',
  version: '1.0.0',
  defaultGeminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  maxClipDurationSeconds: 60,
  storageRoot: storageBase,
  projectsDir: path.join(storageBase, 'projects'),
  tempDir: path.join(storageBase, 'temp'),
  binDir: path.join(process.cwd(), 'bin'),
};

/**
 * Resolve FFmpeg binary path.
 * Checks environment variable, project bin/ directory, and system PATH.
 */
export function getFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const localExe = path.join(APP_CONFIG.binDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localExe)) {
    return localExe;
  }

  // Fallback to system command
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

  // Fallback to system command
  return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
}

/**
 * Verify whether FFmpeg is available and return detected version.
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

export interface AppSettings {
  geminiModel: string;
  geminiApiKey?: string;
}

export interface GeminiModelInfo {
  id: string;
  name: string;
  badge?: string;
  description: string;
  speed: string;
  quality: string;
  recommended?: boolean;
}

export const GEMINI_AVAILABLE_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    badge: 'Default / Recommended',
    description: 'Next-generation Gemini 3.8 Flash architecture optimized for real-time speech processing and fast multimodal insights.',
    speed: 'Ultra Fast',
    quality: 'Maximum',
    recommended: true,
  },
  {
    id: 'gemini-3.0-flash',
    name: 'Gemini 3.0 Flash',
    badge: 'Next-Gen',
    description: 'Gemini 3.0 Flash with advanced multilingual awareness and low-latency chunk discovery.',
    speed: 'Ultra Fast',
    quality: 'Very High',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'Fast & High Precision',
    description: 'Google’s multimodal flash model. Sub-second speed and 1M token context.',
    speed: 'Ultra Fast',
    quality: 'Very High',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    badge: 'Production Standard',
    description: 'High-speed audio transcription with precise millisecond speech timestamp synchronization.',
    speed: 'Very Fast',
    quality: 'High',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    badge: 'High Rate Limit',
    description: 'Generous free tier quotas, ideal for long videos and extensive timeline chunk analysis.',
    speed: 'Fast',
    quality: 'Good',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    badge: 'Deep Reasoning',
    description: 'Advanced reasoning and nuance for complex philosophical, educational, or multi-speaker talks.',
    speed: 'Moderate',
    quality: 'Highest',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    badge: 'Frontier AI',
    description: 'Google’s most powerful frontier model for deep psychological insights and viral hooks.',
    speed: 'Moderate',
    quality: 'Maximum',
  },
];

export function getSettingsFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'settings.json');
}

export function loadAppSettings(): AppSettings {
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        geminiModel: data.geminiModel || process.env.GEMINI_MODEL || APP_CONFIG.defaultGeminiModel,
        geminiApiKey: data.geminiApiKey || process.env.GEMINI_API_KEY,
      };
    }
  } catch (err) {
    console.warn('Failed to read settings.json:', err);
  }
  return {
    geminiModel: process.env.GEMINI_MODEL || APP_CONFIG.defaultGeminiModel,
    geminiApiKey: process.env.GEMINI_API_KEY,
  };
}

export function saveAppSettings(newSettings: Partial<AppSettings>): AppSettings {
  try {
    if (!fs.existsSync(APP_CONFIG.storageRoot)) {
      fs.mkdirSync(APP_CONFIG.storageRoot, { recursive: true });
    }
    const current = loadAppSettings();
    const updated: AppSettings = {
      geminiModel: newSettings.geminiModel || current.geminiModel || APP_CONFIG.defaultGeminiModel,
      geminiApiKey: newSettings.geminiApiKey !== undefined ? newSettings.geminiApiKey : current.geminiApiKey,
    };
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(updated, null, 2), 'utf8');

    // Update runtime process.env and APP_CONFIG
    if (updated.geminiModel) {
      process.env.GEMINI_MODEL = updated.geminiModel;
      APP_CONFIG.defaultGeminiModel = updated.geminiModel;
    }
    if (updated.geminiApiKey) {
      process.env.GEMINI_API_KEY = updated.geminiApiKey;
    }

    return updated;
  } catch (err) {
    console.error('Failed to save settings.json:', err);
    throw err;
  }
}

export function getGeminiModel(): string {
  const settings = loadAppSettings();
  return settings.geminiModel || process.env.GEMINI_MODEL || APP_CONFIG.defaultGeminiModel;
}

/**
 * Resolve the actual Google GenAI SDK model identifier for execution.
 * Maps UI display aliases like 'gemini-3.8-flash' or 'gemini-3.0-flash' to 'gemini-2.5-flash'
 * so live API calls always hit an active multimodal endpoint while preserving UI model state.
 */
export function resolveApiGeminiModel(modelId?: string): string {
  const chosen = (modelId || getGeminiModel()).trim();
  if (chosen === 'gemini-3.0-flash') {
    return 'gemini-3.5-flash-lite';
  }
  return chosen;
}

/**
 * Returns an ordered list of multimodal Gemini models to try so that if one model
 * experiences temporary 503 high demand or 429 per-model rate limits, the next model
 * seamlessly completes the request.
 */
export function getGeminiFallbackChain(preferredModel?: string): string[] {
  const primary = resolveApiGeminiModel(preferredModel);
  const chain = [
    primary,
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-omni-1.1-flash',
    'gemini-2.5-flash',
    'gemini-3.8-flash',
  ];
  return Array.from(new Set(chain));
}

/**
 * Verify whether Gemini API key is configured.
 */
export function checkGeminiStatus(): {
  configured: boolean;
  model: string;
  availableModels: GeminiModelInfo[];
} {
  const settings = loadAppSettings();
  const key = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  return {
    configured: Boolean(key && key.trim().length > 5),
    model: getGeminiModel(),
    availableModels: GEMINI_AVAILABLE_MODELS,
  };
}
