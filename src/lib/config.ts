import path from 'path';
import fs from 'fs';

export const APP_CONFIG = {
  appName: 'AI Clip Finder — Local Studio',
  version: '1.0.0',
  defaultGeminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  maxClipDurationSeconds: 60,
  storageRoot: path.join(process.cwd(), 'storage'),
  projectsDir: path.join(process.cwd(), 'storage', 'projects'),
  tempDir: path.join(process.cwd(), 'storage', 'temp'),
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

/**
 * Verify whether Gemini API key is configured.
 */
export function checkGeminiStatus(): { configured: boolean; model: string } {
  const key = process.env.GEMINI_API_KEY;
  return {
    configured: Boolean(key && key.trim().length > 5),
    model: APP_CONFIG.defaultGeminiModel,
  };
}
