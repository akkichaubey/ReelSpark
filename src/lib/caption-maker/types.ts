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

export type AnimationPreset = 'clean' | 'pop' | 'kinetic' | 'punch' | 'minimal';

export type HighlightAnimation =
  | 'none'
  | 'scale'
  | 'pop'
  | 'glow'
  | 'background'
  | 'underline'
  | 'color-change';

export type ImageFitMode = 'cover' | 'contain' | 'blur';

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
export type TextAlignment = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'black';

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number; // in pixels relative to 1080p width (default 64)
  fontWeight: FontWeight;
  textAlign: TextAlignment;
  position: CaptionPosition;
  customX?: number; // 0 - 100% horizontal center
  customY?: number; // 0 - 100% vertical center
  textColor: string; // e.g. '#FFFFFF'
  importantColor: string; // e.g. '#FACC15' (Amber/Yellow)
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

export interface CaptionProject {
  id: string;
  title: string;
  image?: ImageAsset;
  audio?: AudioAsset;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  captionStyle: CaptionStyle;
  outputSettings: OutputSettings;
  renderedVideoPath?: string;
  renderedVideoUrl?: string;
  renderedSrtPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionResult {
  transcript: TranscriptWord[];
  language?: string;
  duration?: number;
}

export interface TranscriptionProvider {
  transcribe(audioFilePath: string): Promise<TranscriptionResult>;
}
