import { CaptionGroup, CaptionStyle, ImageFitMode, ImagePosition, OutputSettings, SfxCue, TranscriptWord } from '../lib/caption-maker/types';

export interface RemotionCaptionProps extends Record<string, unknown> {
  imageSrc?: string;
  audioSrc?: string;
  voiceVolume?: number;
  voiceMuted?: boolean;
  bgMusicSrc?: string;
  bgMusicVolume?: number;
  bgMusicMuted?: boolean;
  bgMusicFadeIn?: number;
  bgMusicFadeOut?: number;
  bgMusicAutoDucking?: boolean;
  bgMusicOffset?: number;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  speaker1Color?: string;
  speaker2Color?: string;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  captionStyle: CaptionStyle;
  outputSettings: OutputSettings;
  imageFitMode?: ImageFitMode;
  imagePosition?: ImagePosition;
  imageScale?: number;
  mediaType?: 'image' | 'video';
  durationInSeconds: number;
}
