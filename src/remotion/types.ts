import { CaptionGroup, CaptionStyle, ImageFitMode, ImagePosition, OutputSettings, TranscriptWord } from '../lib/caption-maker/types';

export interface RemotionCaptionProps extends Record<string, unknown> {
  imageSrc?: string;
  audioSrc?: string;
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
