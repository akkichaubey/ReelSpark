import { CaptionStyle } from './types';

export interface CustomStylePreset {
  id: string;
  name: string;
  badge: string;
  description?: string;
  style: Partial<CaptionStyle>;
  createdAt: string;
}

export const CUSTOM_PRESETS_STORAGE_KEY = 'reel_custom_style_presets';

/**
 * Safely retrieves custom style presets from localStorage.
 * Handles SSR and corrupted JSON safely.
 */
export function getCustomPresets(): CustomStylePreset[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string'
      );
    }
    return [];
  } catch (err) {
    console.warn('Failed to load custom style presets from localStorage:', err);
    return [];
  }
}

/**
 * Saves a new custom preset created from the current CaptionStyle.
 */
export function saveCustomPreset(
  name: string,
  style: CaptionStyle,
  description?: string
): CustomStylePreset {
  const trimmedName = name?.trim() || 'My Custom Style';
  const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  
  // Extract only typography and visual style properties
  const cleanStyle: Partial<CaptionStyle> = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
    position: style.position,
    ninePosition: style.ninePosition,
    customX: style.customX,
    customY: style.customY,
    textColor: style.textColor,
    importantColor: style.importantColor,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    shadowColor: style.shadowColor,
    shadowBlur: style.shadowBlur,
    backgroundColor: style.backgroundColor,
    backgroundPadding: style.backgroundPadding,
    captionMode: style.captionMode,
    animationPreset: style.animationPreset,
    highlightAnimation: style.highlightAnimation,
    uppercase: style.uppercase,
    textTransform: style.textTransform,
    showSafeArea: style.showSafeArea,
    safeZoneOverrides: style.safeZoneOverrides,
    backgroundStyle: style.backgroundStyle,
    backgroundOpacity: style.backgroundOpacity,
    backgroundRadius: style.backgroundRadius,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    zoomScale: style.zoomScale,
    textOpacity: style.textOpacity,
    textEffect: style.textEffect,
    glowColor: style.glowColor,
    glowSpread: style.glowSpread,
    shadowOffsetX: style.shadowOffsetX,
    shadowOffsetY: style.shadowOffsetY,
    activeWordBgColor: style.activeWordBgColor,
    showEmojis: style.showEmojis,
    speaker1Color: style.speaker1Color,
    speaker2Color: style.speaker2Color,
  };

  const newPreset: CustomStylePreset = {
    id,
    name: trimmedName,
    badge: 'BRAND',
    description: description?.trim() || `${style.fontWeight || 'bold'} · ${cleanStyle.captionMode || 'phrase'} · ${style.textColor || '#fff'}`,
    style: cleanStyle,
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    const existing = getCustomPresets();
    const updated = [newPreset, ...existing];
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save custom preset to localStorage:', err);
    }
  }

  return newPreset;
}

/**
 * Deletes a custom preset by ID from localStorage.
 */
export function deleteCustomPreset(id: string): CustomStylePreset[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const existing = getCustomPresets();
    const updated = existing.filter((p) => p.id !== id);
    window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete custom preset:', err);
    return [];
  }
}

/**
 * Renames an existing custom preset.
 */
export function renameCustomPreset(id: string, newName: string): CustomStylePreset[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const existing = getCustomPresets();
    const updated = existing.map((p) =>
      p.id === id ? { ...p, name: newName.trim() || p.name } : p
    );
    window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to rename custom preset:', err);
    return [];
  }
}
