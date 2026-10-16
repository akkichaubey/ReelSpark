export interface TranscriptWord {
  id: string;
  text: string;
  start: number; // in seconds (e.g. 0.42)
  end: number;   // in seconds (e.g. 0.68)
  confidence?: number;
  isImportant?: boolean;
}

export interface CaptionGroup {
  id: string;
  words: TranscriptWord[];
  start: number;
  end: number;
  text: string;
}

export type CaptionMode = 'word-by-word' | 'phrase-highlight' | 'kinetic';

export type AnimationPreset =
  | 'clean'
  | 'pop'
  | 'kinetic'
  | 'punch'
  | 'minimal'
  | 'words-slide-up'
  | 'words-rotate-in'
  | 'letters-slide-up'
  | 'letters-slide-down';

export type HighlightAnimation =
  | 'none'
  | 'scale'
  | 'pop'
  | 'glow'
  | 'background'
  | 'underline'
  | 'color-change';

export type ImageFitMode = 'cover' | 'contain';

export type ImagePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type PlatformPreset =
  | 'instagram-reel'
  | 'youtube-short'
  | 'instagram-portrait'
  | 'instagram-square'
  | 'youtube-landscape'
  | 'custom';

export interface OutputSettings {
  preset: PlatformPreset;
  width: number;
  height: number;
  aspectRatio: string;
  quality: 'draft' | 'standard' | 'high';
  fps: number;
}

export type CaptionPosition = 'top' | 'center' | 'bottom' | 'custom';
export type TextAlignment = 'left' | 'center' | 'right' | 'custom';
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'black';

export type BackgroundStyle =
  | 'none'
  | 'solid-pill'
  | 'frosted-glass'
  | 'marker-bar'
  | 'outline-pill';

export type TextEffectType =
  | 'none'
  | 'drop-shadow'
  | 'neon-glow'
  | 'retro-3d'
  | 'soft-ambient';

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number; // in pixels relative to 1080p width (default 64)
  fontWeight: FontWeight;
  textAlign: TextAlignment;
  position: CaptionPosition;
  customX?: number; // 0 - 100% horizontal center
  customY?: number; // 0 - 100% vertical center
  textColor: string; // e.g. '#FFFFFF'
  importantColor: string; // e.g. '#FCD905' (Vibrant Active Yellow)
  strokeColor: string; // e.g. '#000000'
  strokeWidth: number; // in pixels (default 4)
  shadowColor: string; // e.g. 'rgba(0,0,0,0.8)'
  shadowBlur: number;
  backgroundColor?: string; // e.g. 'rgba(0,0,0,0.6)'
  backgroundPadding?: number;
  captionMode: CaptionMode;
  animationPreset: AnimationPreset;
  highlightAnimation: HighlightAnimation;
  uppercase: boolean;
  showSafeArea: boolean;
  // Modern VN / Instagram & CapCut Extensions
  backgroundStyle?: BackgroundStyle;
  backgroundOpacity?: number; // 0 to 1
  backgroundRadius?: number;  // 0 to 999
  letterSpacing?: number;     // in pixels (-2 to 12)
  lineHeight?: number;        // e.g. 1.2 to 1.8
  zoomScale?: number;         // Active word zoom scale multiplier: 1.0 (no zoom) to 1.40 (max zoom)
  textOpacity?: number;       // Normal/inactive word opacity: 0.1 to 1.0 (default 1.0)
  textEffect?: TextEffectType;
  glowColor?: string;
  glowSpread?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  activeWordBgColor?: string;
}

export interface ImageAsset {
  id: string;
  fileUrl: string;
  storagePath?: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  fitMode: ImageFitMode;
  position?: ImagePosition;
  scale?: number;
  mediaType?: 'image' | 'video';
  duration?: number;
}

export interface AudioAsset {
  id: string;
  fileUrl: string;
  storagePath?: string;
  fileName: string;
  fileSize: number;
  duration: number; // in seconds
  format: string;
}

export type ThumbnailLayoutPosition = 'top' | 'center' | 'bottom' | 'custom';
export type ThumbnailBadgeStyle = 'solid' | 'glow' | 'outline' | 'pill' | 'glass' | 'gradient' | 'none';
export type ThumbnailBadgeShape = 'pill' | 'rounded' | 'sharp';
export type ThumbnailBackgroundType = 'project' | 'gradient' | 'color';

export interface ThumbnailSettings {
  title: string;
  subtitle?: string;
  badgeText?: string;
  badgeStyle?: ThumbnailBadgeStyle;
  badgeColor?: string;
  badgeEnabled?: boolean;
  badgeSpacing?: number;
  badgeShape?: ThumbnailBadgeShape;
  badgeBorderRadius?: number;
  badgeBorderWidth?: number;
  badgeBorderColor?: string;
  badgeTextColor?: string;
  badgeAutoTextColor?: boolean;
  badgeFontSize?: number;
  badgeFontWeight?: string;
  badgeLetterSpacing?: number;
  badgePaddingX?: number;
  badgePaddingY?: number;
  badgeGlowBlur?: number;
  subtitleSpacing?: number;
  preset: string;
  fontFamily: string;
  fontSize: number; // e.g. 76
  fontWeight: string; // '700' | '800' | '900'
  letterSpacing: number; // -2 to 10
  textTransform: 'uppercase' | 'none' | 'capitalize';
  textColor: string; // e.g. '#FFFFFF'
  highlightColor: string; // default '#FCD905'
  highlightWords: string[];
  position: ThumbnailLayoutPosition;
  customY?: number; // 10 to 90 (% of height)
  textAlign: 'left' | 'center' | 'right' | 'custom';
  customX?: number; // 10 to 90 (% of width)
  overlayDarkness: number; // 0 to 0.95
  overlayType?: 'linear-bottom' | 'linear-top' | 'radial-vignette' | 'full-dark';
  strokeWidth: number; // 0 to 14
  strokeColor: string;
  shadowBlur: number; // 0 to 30
  shadowColor: string;
  boxBackground?: boolean;
  boxBgColor?: string;
  boxBgOpacity?: number;
  brandingText?: string;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  backgroundType?: ThumbnailBackgroundType;
  gradientPreset?: string;
  customBgUrl?: string;
  showSafeArea?: boolean;
}

export interface SyncedPhraseSegment {
  start: number;
  end: number;
  textHindi: string;
  textEnglish: string;
}

export interface CaptionProject {
  id: string;
  title: string;
  image?: ImageAsset;
  audio?: AudioAsset;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  captionStyle: CaptionStyle;
  outputSettings: OutputSettings;
  thumbnailSettings?: ThumbnailSettings;
  thumbnailUrl?: string;
  renderedVideoPath?: string;
  renderedVideoUrl?: string;
  renderedSrtPath?: string;
  rawTranscriptHindi?: string;
  rawTranscriptEnglish?: string;
  preferredLanguage?: 'en' | 'hi';
  sourceClipId?: string;
  syncedSegments?: SyncedPhraseSegment[];
  isAudioSynced?: boolean;
  syncVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionResult {
  transcript: TranscriptWord[];
  wordsHindi?: TranscriptWord[];
  wordsEnglish?: TranscriptWord[];
  rawTranscriptHindi?: string;
  rawTranscriptEnglish?: string;
  titleHindi?: string;
  titleEnglish?: string;
  syncedSegments?: SyncedPhraseSegment[];
  language?: string;
  duration?: number;
}

export interface TranscriptionProvider {
  transcribe(audioFilePath: string): Promise<TranscriptionResult>;
}


