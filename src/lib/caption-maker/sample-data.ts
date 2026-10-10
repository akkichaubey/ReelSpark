import { CaptionProject, CaptionStyle, OutputSettings, PlatformPreset, TranscriptWord } from './types';
import { groupTranscriptWords } from './caption-grouping';

export const PLATFORM_PRESETS: Record<
  PlatformPreset,
  { label: string; width: number; height: number; aspectRatio: string; description: string }
> = {
  'instagram-reel': {
    label: 'Instagram Reel',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    description: '1080 × 1920 (9:16 Vertical)',
  },
  'youtube-short': {
    label: 'YouTube Short',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    description: '1080 × 1920 (9:16 Vertical)',
  },
  'instagram-portrait': {
    label: 'Instagram Portrait',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    description: '1080 × 1350 (4:5 Feed Post)',
  },
  'instagram-square': {
    label: 'Instagram Square',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    description: '1080 × 1080 (1:1 Square)',
  },
  'youtube-landscape': {
    label: 'YouTube Landscape',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    description: '1920 × 1080 (16:9 Landscape)',
  },
  'custom': {
    label: 'Custom Size',
    width: 1080,
    height: 1920,
    aspectRatio: 'custom',
    description: 'Custom dimensions',
  },
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 60,
  fontWeight: 'bold',
  textAlign: 'center',
  position: 'center',
  customX: 50,
  customY: 55,
  textColor: '#FFFFFF',
  importantColor: '#FACC15', // Vibrant Gold
  strokeColor: '#000000',
  strokeWidth: 6,
  shadowColor: 'rgba(0,0,0,0.85)',
  shadowBlur: 8,
  backgroundColor: 'rgba(0,0,0,0.6)',
  backgroundPadding: 12,
  captionMode: 'phrase-highlight',
  animationPreset: 'punch',
  highlightAnimation: 'pop',
  uppercase: true,
  showSafeArea: true,
};

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  preset: 'instagram-reel',
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  quality: 'standard',
  fps: 30,
};

export const SAMPLE_TRANSCRIPT_WORDS: TranscriptWord[] = [
  { id: 'w1', text: 'Zindagi', start: 0.00, end: 0.52, isImportant: true },
  { id: 'w2', text: 'mein', start: 0.52, end: 0.80, isImportant: false },
  { id: 'w3', text: 'kabhi', start: 0.80, end: 1.15, isImportant: false },
  { id: 'w4', text: 'HAAR', start: 1.15, end: 1.70, isImportant: true },
  { id: 'w5', text: 'mat', start: 1.70, end: 1.95, isImportant: false },
  { id: 'w6', text: 'maanna,', start: 1.95, end: 2.45, isImportant: false },
  { id: 'w7', text: 'kyunki', start: 2.55, end: 2.90, isImportant: false },
  { id: 'w8', text: 'girte', start: 2.90, end: 3.32, isImportant: false },
  { id: 'w9', text: 'wahi', start: 3.32, end: 3.65, isImportant: false },
  { id: 'w10', text: 'hain', start: 3.65, end: 3.90, isImportant: false },
  { id: 'w11', text: 'jo', start: 3.90, end: 4.12, isImportant: false },
  { id: 'w12', text: 'CHALTE', start: 4.12, end: 4.62, isImportant: true },
  { id: 'w13', text: 'hain.', start: 4.62, end: 5.08, isImportant: false },
  { id: 'w14', text: 'Tumhara', start: 5.20, end: 5.66, isImportant: false },
  { id: 'w15', text: 'DREAM', start: 5.66, end: 6.24, isImportant: true },
  { id: 'w16', text: 'tumhari', start: 6.24, end: 6.58, isImportant: false },
  { id: 'w17', text: 'asli', start: 6.58, end: 6.90, isImportant: false },
  { id: 'w18', text: 'PEHCHAN', start: 6.90, end: 7.52, isImportant: true },
  { id: 'w19', text: 'hai.', start: 7.52, end: 7.90, isImportant: false },
  { id: 'w20', text: 'Focus', start: 8.05, end: 8.50, isImportant: true },
  { id: 'w21', text: 'apne', start: 8.50, end: 8.80, isImportant: false },
  { id: 'w22', text: 'LAKSHYA', start: 8.80, end: 9.40, isImportant: true },
  { id: 'w23', text: 'par', start: 9.40, end: 9.65, isImportant: false },
  { id: 'w24', text: 'rakho.', start: 9.65, end: 10.10, isImportant: false },
];

export function createDefaultCaptionProject(id = `proj_${Date.now()}`): CaptionProject {
  const words = [...SAMPLE_TRANSCRIPT_WORDS];
  const groups = groupTranscriptWords(words, 4);

  return {
    id,
    title: 'Motivational Reel Captions',
    transcript: words,
    captionGroups: groups,
    captionStyle: { ...DEFAULT_CAPTION_STYLE },
    outputSettings: { ...DEFAULT_OUTPUT_SETTINGS },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
