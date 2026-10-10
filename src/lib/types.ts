export type ProjectStatus =
  | 'QUEUED'
  | 'UPLOADING'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'RANKING'
  | 'VERIFYING'
  | 'RENDERING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type VideoSourceType = 'upload' | 'youtube';

export type TopicCategory =
  | 'Motivation'
  | 'Philosophy'
  | 'Self-Respect'
  | 'Psychology'
  | 'Relationships'
  | 'Fear and Courage'
  | 'Meditation and Awareness'
  | 'Life Lessons'
  | 'Stories'
  | 'Other';

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  aspectRatio: string;
  fps: number;
  format: string;
  sizeBytes: number;
  hasAudio: boolean;
  audioCodec?: string;
  videoCodec?: string;
}

export interface TranscriptSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  speaker?: string;
  confidence?: number;
}

export interface ClipScoreBreakdown {
  meaningAndDepth: number;            // 0 - 25
  standaloneCompleteness: number;     // 0 - 20
  openingStrength: number;            // 0 - 15
  emotionalIntellectualImpact: number;// 0 - 15
  clarity: number;                    // 0 - 10
  conciseness: number;                // 0 - 10
  audioQuality: number;               // 0 - 5
  total: number;                      // 0 - 100
}

export interface ContextVerification {
  isCompleteThought: boolean;
  hasConclusion: boolean;
  hasDanglingPronouns: boolean;
  contextConfidence: number;          // 0 - 100
  suggestedAdjustment?: { start: number; end: number };
  notes: string;
  flaggedForReview: boolean;
}

export interface SubtitleStyle {
  fontSize: number;                   // e.g. 24
  fontColor: string;                  // hex e.g. #FFFFFF or #FFFF00
  outlineColor: string;               // hex e.g. #000000
  outlineWidth: number;               // e.g. 2
  backgroundColor?: string;           // e.g. rgba(0,0,0,0.5)
  verticalPosition: 'bottom' | 'middle' | 'top';
  alignment: 'center' | 'left';
}

export interface ClipCandidate {
  id: string;
  title: string;
  titleHindi?: string;
  titleEnglish?: string;
  start: number;                      // seconds
  end: number;                        // seconds
  duration: number;                   // seconds (max 60)
  topic: TopicCategory;
  explanation: string;
  explanationHindi?: string;
  explanationEnglish?: string;
  transcript: string;
  transcriptHindi?: string;
  transcriptEnglish?: string;
  firstWords: string;
  firstWordsHindi?: string;
  lastWords: string;
  lastWordsHindi?: string;
  scores: ClipScoreBreakdown;
  contextVerification: ContextVerification;
  selected: boolean;
  renderStatus?: 'idle' | 'rendering' | 'completed' | 'failed';
  renderedVideoPath?: string;
  renderedSrtPath?: string;
  renderError?: string;
  customTitle?: string;
}

export interface TimelineCoverage {
  analyzedSeconds: number;
  totalSeconds: number;
  coveragePercent: number;
  ranges: Array<[number, number]>;
}

export interface ProjectSettings {
  durationLimit: '15' | '30' | '45' | '60' | 'auto';
  aspectRatio: 'original' | 'vertical_crop' | 'vertical_blur';
  normalizeAudio: boolean;
  burnSubtitles: boolean;
  subtitleStyle: SubtitleStyle;
}

export interface Project {
  id: string;
  title: string;
  sourceType: VideoSourceType;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  localVideoPath?: string;
  originalFileName?: string;
  status: ProjectStatus;
  progress: number;                   // 0 - 100
  statusMessage: string;
  error?: string;
  videoMetadata?: VideoMetadata;
  settings: ProjectSettings;
  timelineCoverage: TimelineCoverage;
  transcript: TranscriptSegment[];
  candidates: ClipCandidate[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchMatch {
  candidateId?: string;
  segmentId?: string;
  start: number;
  end: number;
  snippet: string;
  relevanceScore: number;
  contextNote: string;
}
