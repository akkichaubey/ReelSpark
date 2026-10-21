import { BgMusicTrack } from './types';

export const CUSTOM_BGM_STORAGE_KEY = 'reel_custom_bgm_tracks';

/**
 * Valid audio MIME types and extensions for background music
 */
export const ALLOWED_BGM_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];

export function validateBgmFile(file: { name: string; size?: number; type?: string }): {
  valid: boolean;
  error?: string;
} {
  if (!file || !file.name) {
    return { valid: false, error: 'No file provided' };
  }

  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_BGM_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported audio format "${ext}". Please use MP3, WAV, M4A, AAC, or OGG.`,
    };
  }

  // 100MB limit for background music
  if (file.size && file.size > 100 * 1024 * 1024) {
    return {
      valid: false,
      error: 'Audio file exceeds 100MB maximum limit.',
    };
  }

  return { valid: true };
}

/**
 * Safely retrieve custom uploaded BGM tracks from localStorage.
 */
export function getCustomBgmTracks(): BgMusicTrack[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_BGM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (t) => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.title === 'string'
      );
    }
    return [];
  } catch (err) {
    console.warn('Failed to load custom BGM tracks from localStorage:', err);
    return [];
  }
}

/**
 * Save a new or updated custom BGM track to localStorage.
 */
export function saveCustomBgmTrack(track: BgMusicTrack): BgMusicTrack[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [track];
  }

  try {
    const existing = getCustomBgmTracks();
    const filtered = existing.filter((t) => t.id !== track.id && t.fileUrl !== track.fileUrl);
    const updated = [track, ...filtered];
    window.localStorage.setItem(CUSTOM_BGM_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save custom BGM track:', err);
    return [];
  }
}

/**
 * Delete a custom BGM track by ID from localStorage.
 */
export function deleteCustomBgmTrack(id: string): BgMusicTrack[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const existing = getCustomBgmTracks();
    const updated = existing.filter((t) => t.id !== id);
    window.localStorage.setItem(CUSTOM_BGM_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete custom BGM track:', err);
    return [];
  }
}
