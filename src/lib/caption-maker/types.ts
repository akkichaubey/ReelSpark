export interface TranscriptWord {
  id: string;
  text: string;
  start: number; // in seconds (e.g. 0.42)
  end: number;   // in seconds (e.g. 0.68)
  confidence?: number;
  isImportant?: boolean;
  emoji?: string;
  intensity?: 'normal' | 'punch' | 'climax' | 'whisper';
  speakerId?: string;
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

export type ImageFitMode = 'cover' | 'contain' | 'blur';

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
  | 'facebook-reel'
  | 'youtube-short'
  | 'threads-video'
  | 'instagram-portrait'
  | 'instagram-square'
  | 'youtube-landscape'
  | 'custom';

export type ResolutionTier = '720p' | '1080p' | '1440p' | '4k';
export type VideoFps = 24 | 25 | 30 | 60;
export type VideoQuality = 'draft' | 'standard' | 'high' | 'pro';
export type VideoCodec = 'h264' | 'hevc' | 'auto';
export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';

export interface OutputSettings {
  preset: PlatformPreset;
  width: number;
  height: number;
  aspectRatio: string;
  quality: VideoQuality;
  fps: number; // 24 | 25 | 30 | 60 or custom
  resolution?: ResolutionTier;
  bitrate?: string; // e.g. 'auto', '4M', '8M', '16M', '28M'
  audioBitrate?: string; // e.g. '128k', '192k', '256k', '320k'
  codec?: VideoCodec;
  burnSubtitles?: boolean;
}

export type TextTransformMode = 'uppercase' | 'lowercase' | 'sentence' | 'title' | 'none';

export type Caption9Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type CaptionPosition =
  | 'top'
  | 'center'
  | 'bottom'
  | 'custom'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
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
  presetId?: string;
  fontFamily: string;
  fontSize: number; // in pixels relative to 1080p width (default 64)
  fontWeight: FontWeight;
  textAlign: TextAlignment;
  position: CaptionPosition;
  ninePosition?: Caption9Position;
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
  textTransform?: TextTransformMode; // 'uppercase' | 'lowercase' | 'sentence' | 'title' | 'none'
  showSafeArea: boolean;
  safeZoneOverrides?: {
    platform?: PlatformPreset;
    topDangerPercent?: number;
    bottomDangerPercent?: number;
    rightMarginPercent?: number;
    leftMarginPercent?: number;
    showFaceGuide?: boolean;
    showCropGuides?: boolean;
    showActionRail?: boolean;
    showDangerZones?: boolean;
    showSafeActionBox?: boolean;
    showHeadlineBox?: boolean;
  };
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
  showEmojis?: boolean;
  speaker1Color?: string;
  speaker2Color?: string;
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
  sourceType?: 'audio' | 'video';
  originalVideoFileName?: string;
  volume?: number; // 0.0 to 2.0 (default 1.0, >1.0 = Boost ⚡)
  muted?: boolean; // default false
  denoise?: boolean; // default false (AI Studio Denoise)
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
  safeZoneOverrides?: {
    platform?: PlatformPreset;
    topDangerPercent?: number;
    bottomDangerPercent?: number;
    rightMarginPercent?: number;
    leftMarginPercent?: number;
    showFaceGuide?: boolean;
    showCropGuides?: boolean;
    showActionRail?: boolean;
    showDangerZones?: boolean;
    showSafeActionBox?: boolean;
    showHeadlineBox?: boolean;
  };
}

export interface BgMusicTrack {
  id: string;
  title: string;
  fileUrl: string;
  volume: number; // 0.0 to 1.0 (default 0.20)
  custom?: boolean;
  storagePath?: string;
  muted?: boolean;
  fadeInDuration?: number; // 0.0 to 3.0s (default 0.8s)
  fadeOutDuration?: number; // 0.0 to 3.0s (default 1.2s)
  autoDucking?: boolean; // dips BGM during speech
  duckingAmount?: number; // 0.1 to 0.9 (default 0.7 = 70% dip)
  startOffset?: number; // start BGM at offset seconds (default 0)
}

export type SfxType = 'whoosh' | 'ding' | 'kaching' | 'pop' | 'impact';

export interface SfxCue {
  id: string;
  time: number; // in seconds
  type: SfxType;
  volume?: number; // 0.0 to 1.0 (default 0.35)
  reason?: string;
  audioSrc?: string;
}

export interface AudioAnalysisResult {
  mood?: 'motivational' | 'chill' | 'energetic' | 'dramatic' | 'philosophical' | 'conversational';
  energyLevel?: 'high' | 'medium' | 'low';
  speechPaceWpm?: number;
  recommendedBgmId?: string;
  suggestedBgmVolume?: number;
  summary?: string;
  speakersDetected?: number;
}

export interface FillerSegment {
  start: number;
  end: number;
  text: string;
  type?: 'filler' | 'silence' | 'stutter';
}

export interface SyncedPhraseSegment {
  id?: string;
  start: number;
  end: number;
  textHindi: string;
  textEnglish: string;
  textHinglish?: string;
  speechIntervalIndex?: number;
  speakerId?: string; // 'Speaker 1' | 'Speaker 2'
  intensity?: 'normal' | 'punch' | 'climax' | 'whisper';
}

export interface TrimRange {
  start: number; // in seconds (e.g. 0.0)
  end: number;   // in seconds (e.g. 28.5)
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
  rawTranscriptHinglish?: string;
  preferredLanguage?: 'en' | 'hi' | 'hinglish';
  bgMusic?: BgMusicTrack;
  voiceVolume?: number; // 0.0 to 2.0 (default 1.0)
  voiceMuted?: boolean;
  studioDenoise?: boolean;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  audioAnalysis?: AudioAnalysisResult;
  fillerSegments?: FillerSegment[];
  speaker1Color?: string; // e.g. '#FFFFFF'
  speaker2Color?: string; // e.g. '#06B6D4'
  sourceClipId?: string;
  syncedSegments?: SyncedPhraseSegment[];
  isAudioSynced?: boolean;
  syncVersion?: number;
  trimRange?: TrimRange;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionResult {
  transcript: TranscriptWord[];
  wordsHindi?: TranscriptWord[];
  wordsEnglish?: TranscriptWord[];
  wordsHinglish?: TranscriptWord[];
  rawTranscriptHindi?: string;
  rawTranscriptEnglish?: string;
  rawTranscriptHinglish?: string;
  titleHindi?: string;
  titleEnglish?: string;
  titleHinglish?: string;
  syncedSegments?: SyncedPhraseSegment[];
  sfxCues?: SfxCue[];
  audioAnalysis?: AudioAnalysisResult;
  fillerSegments?: FillerSegment[];
  language?: string;
  duration?: number;
}

export interface TranscriptionProvider {
  transcribe(audioFilePath: string): Promise<TranscriptionResult>;
}


