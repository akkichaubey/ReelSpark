export interface GoogleFontInfo {
  name: string;
  category: 'viral' | 'clean' | 'display' | 'serif' | 'devanagari';
  badge: string;
  description: string;
}

export const SINGLE_WEIGHT_FONTS = new Set([
  'Bebas Neue',
  'Anton',
  'Archivo Black',
  'Bangers',
  'Bungee',
  'Righteous',
  'Press Start 2P',
  'Russo One',
  'Permanent Marker',
  'Black Han Sans',
  'Fjalla One',
  'Rozha One',
  'Monoton',
  'Creepster',
  'Abril Fatface',
  'Lobster',
  'Pacifico',
  'Yatra One',
]);

export const POPULAR_GOOGLE_FONTS: GoogleFontInfo[] = [
  // --- 1. VIRAL & HIGH IMPACT (Reels / TikTok Headline) ---
  { name: 'Montserrat', category: 'viral', badge: 'VIRAL', description: 'Bold, clean, top choice for viral reels' },
  { name: 'Impact', category: 'viral', badge: 'HEAVY', description: 'Standard high-energy viral meme headline' },
  { name: 'Anton', category: 'viral', badge: 'PUNCH', description: 'Extra-compressed, powerful poster bold' },
  { name: 'Bebas Neue', category: 'viral', badge: 'TREND', description: 'Tall condensed uppercase, gym & motivation' },
  { name: 'Archivo Black', category: 'viral', badge: 'MASSIVE', description: 'Ultra-heavy block punch headline' },
  { name: 'Oswald', category: 'viral', badge: 'TIGHT', description: 'Tight vertical headline with high impact' },
  { name: 'Russo One', category: 'viral', badge: 'BLOCK', description: 'Futuristic block punch for bold videos' },
  { name: 'Black Han Sans', category: 'viral', badge: 'HEAVY', description: 'Massive visual weight headline' },
  { name: 'Syne', category: 'viral', badge: 'AVANT', description: 'Trendy avant-garde viral display' },
  { name: 'Bangers', category: 'viral', badge: 'COMIC', description: 'Comic book punch, gaming & humor' },
  { name: 'Bungee', category: 'viral', badge: 'POSTER', description: 'Chunky poster sans for catchy reels' },
  { name: 'Righteous', category: 'viral', badge: 'RETRO', description: 'Retro cyber bold display' },
  { name: 'Fjalla One', category: 'viral', badge: 'NARROW', description: 'Condensed documentary & news headline' },
  { name: 'Teko', category: 'viral', badge: 'TALL', description: 'Tall vertical letters, athletic & fitness' },

  // --- 2. MODERN CLEAN SANS (Minimalist, Tech & Vlogs) ---
  { name: 'Inter', category: 'clean', badge: 'MINIMAL', description: 'Clean modern UI sans, Ali Abdaal style' },
  { name: 'Poppins', category: 'clean', badge: 'POPULAR', description: 'Geometric modern rounded, YouTube standard' },
  { name: 'Outfit', category: 'clean', badge: 'TECH', description: 'Trendy modern tech & AI aesthetic' },
  { name: 'Plus Jakarta Sans', category: 'clean', badge: 'SLEEK', description: 'Contemporary editorial geometric sans' },
  { name: 'Space Grotesk', category: 'clean', badge: 'CYBER', description: 'Tech, crypto & startup reel typography' },
  { name: 'Work Sans', category: 'clean', badge: 'CLEAN', description: 'Contemporary versatile clean sans' },
  { name: 'DM Sans', category: 'clean', badge: 'MODERN', description: 'Geometric clarity for podcasts & talking heads' },
  { name: 'Manrope', category: 'clean', badge: 'CORP', description: 'Modern business, finance & vlog sans' },
  { name: 'Urbanist', category: 'clean', badge: 'GEOMETRIC', description: 'Sleek geometric sans for lifestyle vlogs' },
  { name: 'Lexend', category: 'clean', badge: 'READABLE', description: 'Engineered for fast, effortless subtitle reading' },
  { name: 'Rubik', category: 'clean', badge: 'SOFT', description: 'Soft rounded corners, friendly & engaging' },
  { name: 'Roboto', category: 'clean', badge: 'NEUTRAL', description: 'Classic neutral sans, universally legible' },

  // --- 3. DISPLAY, TRENDY & CREATIVE ---
  { name: 'Permanent Marker', category: 'display', badge: 'MARKER', description: 'Streetwear, skate & casual hand-drawn marker' },
  { name: 'Caveat', category: 'display', badge: 'SCRIPT', description: 'Casual personal handwritten script' },
  { name: 'Audiowide', category: 'display', badge: 'SCI-FI', description: 'Sci-Fi futuristic tech display' },
  { name: 'Orbitron', category: 'display', badge: 'FUTURE', description: 'Futuristic cybernetic typography' },
  { name: 'Press Start 2P', category: 'display', badge: '8-BIT', description: 'Retro pixelated gaming typography' },
  { name: 'Abril Fatface', category: 'display', badge: 'VINTAGE', description: 'Dramatic high-contrast vintage titling' },
  { name: 'Lobster', category: 'display', badge: 'RETRO', description: 'Bold cursive display banner' },
  { name: 'Pacifico', category: 'display', badge: 'BRUSH', description: 'Fun casual brush script for travel reels' },

  // --- 4. CINEMATIC & EDITORIAL SERIF ---
  { name: 'Playfair Display', category: 'serif', badge: 'LUXURY', description: 'High-fashion, luxury & editorial storytelling' },
  { name: 'Cinzel', category: 'serif', badge: 'CINEMA', description: 'Epic Roman cinematic serif, historical reels' },
  { name: 'Cormorant Garamond', category: 'serif', badge: 'ELEGANT', description: 'Classic elegance for poetry & motivation' },
  { name: 'Lora', category: 'serif', badge: 'LITERARY', description: 'Contemporary literary serif with warm curves' },
  { name: 'Merriweather', category: 'serif', badge: 'JOURNAL', description: 'Sturdy editorial serif with high contrast' },
  { name: 'Bodoni Moda', category: 'serif', badge: 'VOGUE', description: 'Dramatic high-fashion Vogue typography' },

  // --- 5. HINDI / DEVANAGARI COMPATIBLE ---
  { name: 'Rozha One', category: 'devanagari', badge: 'HINDI BOLD', description: 'High-contrast bold Devanagari poster font' },
  { name: 'Kalam', category: 'devanagari', badge: 'HINGLISH', description: 'Casual handwritten Devanagari & Latin' },
  { name: 'Noto Sans Devanagari', category: 'devanagari', badge: 'CLEAN HI', description: 'Clean, legible modern Hindi typography' },
  { name: 'Gotu', category: 'devanagari', badge: 'MODERN HI', description: 'Modern Devanagari sans with calligraphic feel' },
  { name: 'Yatra One', category: 'devanagari', badge: 'POSTER HI', description: 'Classic vintage Indian railway poster lettering' },
  { name: 'Mukta', category: 'devanagari', badge: 'HINDI SANS', description: 'Highly legible modern Hindi sans, viral on Reels' },
  { name: 'Rajdhani', category: 'devanagari', badge: 'CYBER HI', description: 'Edgy squared technical font with native Hindi support' },
  { name: 'Modak', category: 'devanagari', badge: 'MEGA BOLD', description: 'Chubby block letter display for punchy Hindi titles' },
];

/**
 * Ensures Google Fonts preconnect tags exist in document head.
 */
export function ensureGoogleFontsPreconnect(): void {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('gf-preconnect-api')) {
    const p1 = document.createElement('link');
    p1.id = 'gf-preconnect-api';
    p1.rel = 'preconnect';
    p1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(p1);
  }
  if (!document.getElementById('gf-preconnect-static')) {
    const p2 = document.createElement('link');
    p2.id = 'gf-preconnect-static';
    p2.rel = 'preconnect';
    p2.href = 'https://fonts.gstatic.com';
    p2.crossOrigin = 'anonymous';
    document.head.appendChild(p2);
  }
}

/**
 * Returns Google Fonts CSS stylesheet URL for any font family name.
 */
export function getGoogleFontUrl(fontFamily: string, fallbackToBase = false): string {
  const cleanName = fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const encoded = cleanName.replace(/\s+/g, '+');

  if (fallbackToBase || SINGLE_WEIGHT_FONTS.has(cleanName)) {
    return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700;800;900&display=swap`;
}

/**
 * Dynamically injects Google Font link tag into document head and fires callback once loaded.
 */
export function loadGoogleFontInDocument(fontFamily: string, onLoaded?: () => void): void {
  if (typeof document === 'undefined') return;
  ensureGoogleFontsPreconnect();

  const cleanName = fontFamily.split(',')[0].replace(/["']/g, '').trim();
  if (
    !cleanName ||
    ['Arial', 'Helvetica', 'Times New Roman', 'Courier', 'Impact', 'sans-serif', 'serif', 'monospace'].includes(cleanName)
  ) {
    onLoaded?.();
    return;
  }

  const id = `gf-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const existing = document.getElementById(id) as HTMLLinkElement | null;

  if (existing) {
    // Already in head: check if document.fonts is ready
    if ('fonts' in document) {
      document.fonts.load(`32px "${cleanName}"`).then(() => {
        onLoaded?.();
      }).catch(() => {
        onLoaded?.();
      });
    } else {
      onLoaded?.();
    }
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = getGoogleFontUrl(cleanName);

  link.onload = () => {
    if ('fonts' in document) {
      document.fonts.load(`32px "${cleanName}"`).then(() => {
        onLoaded?.();
      }).catch(() => {
        onLoaded?.();
      });
    } else {
      onLoaded?.();
    }
  };

  link.onerror = () => {
    // If multi-weight query fails, fall back to base family query
    link.href = getGoogleFontUrl(cleanName, true);
    if ('fonts' in document) {
      document.fonts.load(`32px "${cleanName}"`).then(() => {
        onLoaded?.();
      }).catch(() => {
        onLoaded?.();
      });
    } else {
      onLoaded?.();
    }
  };

  document.head.appendChild(link);
}

/**
 * Batch preloads multiple fonts (e.g. for picker list previews)
 */
export function loadFontBatch(fonts: string[]): void {
  fonts.forEach((f) => loadGoogleFontInDocument(f));
}
