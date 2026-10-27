'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Music,
  Trash2,
  RefreshCw,
  AudioWaveform,
  Loader2,
  Sliders,
  Move,
  AlertCircle,
  Play,
  Pause,
  ArrowUpLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Dot,
  ArrowRight,
  ArrowDownLeft,
  ArrowDown,
  ArrowDownRight,
  Maximize2,
  Film,
  Check,
  CheckCircle2,
  Volume2,
  VolumeX,
  Waves,
  Scissors,
  Zap,
  Users,
  X,
} from 'lucide-react';
import { UploadProgressIndicator } from '@/components/ProgressCircle';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';
import {
  AudioAsset,
  ImageAsset,
  ImageFitMode,
  ImagePosition,
  BgMusicTrack,
  AudioAnalysisResult,
  FillerSegment,
  SfxCue,
} from '@/lib/caption-maker/types';
import { PRESET_BGM_TRACKS } from '@/lib/caption-maker/sample-data';
import {
  getCustomBgmTracks,
  saveCustomBgmTrack,
  deleteCustomBgmTrack,
  validateBgmFile,
} from '@/lib/caption-maker/custom-bgm';

interface AssetUploadSectionProps {
  image?: ImageAsset;
  mediaAssets?: ImageAsset[];
  audio?: AudioAsset;
  bgMusic?: BgMusicTrack;
  voiceVolume?: number;
  voiceMuted?: boolean;
  studioDenoise?: boolean;
  audioAnalysis?: AudioAnalysisResult;
  sfxCues?: SfxCue[];
  autoSfxEnabled?: boolean;
  onAutoSfxEnabledChange?: (enabled: boolean) => void;
  fillerSegments?: FillerSegment[];
  onTrimFillers?: () => void;
  isTrimmingFillers?: boolean;
  speaker1Color?: string;
  speaker2Color?: string;
  onSpeaker1ColorChange?: (color: string) => void;
  onSpeaker2ColorChange?: (color: string) => void;
  onImageChange: (image?: ImageAsset, accompanyingAudio?: AudioAsset) => void;
  onAudioChange: (audio?: AudioAsset, useVideoAsBackground?: boolean) => void;
  onBgMusicChange?: (track?: BgMusicTrack) => void;
  onVoiceVolumeChange?: (volume: number) => void;
  onVoiceMutedChange?: (muted: boolean) => void;
  onStudioDenoiseChange?: (denoise: boolean) => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  onFitModeChange: (mode: ImageFitMode) => void;
  onPositionChange?: (position: ImagePosition) => void;
  onScaleChange?: (scale: number) => void;
  preferredLanguage?: 'en' | 'hi' | 'hinglish';
  onLanguageChange?: (lang: 'en' | 'hi' | 'hinglish') => void;
  onOpenSmartEditor?: () => void;
}

export const POS_ALIGNMENT: Record<ImagePosition, { justifyContent: string; alignItems: string }> = {
  'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
  'top-center': { justifyContent: 'center', alignItems: 'flex-start' },
  'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
  'center-left': { justifyContent: 'flex-start', alignItems: 'center' },
  'center': { justifyContent: 'center', alignItems: 'center' },
  'center-right': { justifyContent: 'flex-end', alignItems: 'center' },
  'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
  'bottom-center': { justifyContent: 'center', alignItems: 'flex-end' },
  'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' },
};

const CONTAIN_POSITIONS: {
  id: ImagePosition;
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'top-left', label: 'Top Left', shortLabel: 'Top Left', Icon: ArrowUpLeft },
  { id: 'top-center', label: 'Top Center', shortLabel: 'Top Center', Icon: ArrowUp },
  { id: 'top-right', label: 'Top Right', shortLabel: 'Top Right', Icon: ArrowUpRight },
  { id: 'center-left', label: 'Center Left', shortLabel: 'Center Left', Icon: ArrowLeft },
  { id: 'center', label: 'Center', shortLabel: 'Center', Icon: Dot },
  { id: 'center-right', label: 'Center Right', shortLabel: 'Center Right', Icon: ArrowRight },
  { id: 'bottom-left', label: 'Bottom Left', shortLabel: 'Bottom Left', Icon: ArrowDownLeft },
  { id: 'bottom-center', label: 'Bottom Center', shortLabel: 'Bottom Center', Icon: ArrowDown },
  { id: 'bottom-right', label: 'Bottom Right', shortLabel: 'Bottom Right', Icon: ArrowDownRight },
];

export const AssetUploadSection: React.FC<AssetUploadSectionProps> = ({
  image,
  mediaAssets = [],
  audio,
  bgMusic,
  voiceVolume = 1.0,
  voiceMuted = false,
  studioDenoise = false,
  audioAnalysis,
  sfxCues = [],
  autoSfxEnabled = true,
  onAutoSfxEnabledChange,
  fillerSegments = [],
  onTrimFillers,
  isTrimmingFillers = false,
  speaker1Color = '#FFFFFF',
  speaker2Color = '#06B6D4',
  onSpeaker1ColorChange,
  onSpeaker2ColorChange,
  onImageChange,
  onAudioChange,
  onBgMusicChange,
  onVoiceVolumeChange,
  onVoiceMutedChange,
  onStudioDenoiseChange,
  onTranscribe,
  isTranscribing,
  onFitModeChange,
  onPositionChange,
  onScaleChange,
  preferredLanguage = 'en',
  onOpenSmartEditor,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const anyMediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioVideoInputRef = useRef<HTMLInputElement>(null);
  const anyAudioInputRef = useRef<HTMLInputElement>(null);
  const bgmCustomInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [pendingVideoVoice, setPendingVideoVoice] = useState<AudioAsset | null>(null);
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ media: 0, audio: 0, bgm: 0 });
  const [mediaQueueStatus, setMediaQueueStatus] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [customBgmTracks, setCustomBgmTracks] = useState<BgMusicTrack[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadAbortControllers = useRef<Record<'media' | 'audio' | 'bgm', AbortController | null>>({
    media: null,
    audio: null,
    bgm: null,
  });
  const mediaQueueRef = useRef<File[]>([]);
  const mediaQueueProcessingRef = useRef(false);
  const mediaQueueCompletedRef = useRef(0);
  const mediaQueueTotalRef = useRef(0);
  const mediaQueueErrorsRef = useRef<string[]>([]);

  const cancelUpload = (kind: 'media' | 'audio' | 'bgm') => {
    if (kind === 'media') {
      mediaQueueRef.current = [];
    }
    uploadAbortControllers.current[kind]?.abort();
  };

  React.useEffect(() => () => {
    Object.values(uploadAbortControllers.current).forEach((controller) => controller?.abort());
  }, []);

  // Load custom BGM library from localStorage
  React.useEffect(() => {
    // Hydrate browser-only, account-scoped data after SSR to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomBgmTracks(getCustomBgmTracks());
  }, []);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackError, setAudioPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPreviewingBgm, setIsPreviewingBgm] = useState(false);
  const bgmPreviewRef = useRef<HTMLAudioElement | null>(null);

  const toggleBgmTestPlay = () => {
    if (!bgmPreviewRef.current) return;
    if (isPreviewingBgm) {
      bgmPreviewRef.current.pause();
      setIsPreviewingBgm(false);
    } else {
      bgmPreviewRef.current.volume = bgMusic?.volume ?? 0.2;
      bgmPreviewRef.current.play().catch(() => {});
      setIsPreviewingBgm(true);
    }
  };

  const handleCustomBgmUpload = async (file: File) => {
    if (uploadAbortControllers.current.bgm) return;
    setUploadError(null);
    const validation = validateBgmFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid audio file');
      return;
    }

    try {
      setIsUploadingBgm(true);
      setUploadProgress((current) => ({ ...current, bgm: 0 }));
      const controller = new AbortController();
      uploadAbortControllers.current.bgm = controller;
      const data = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: ImageAsset | AudioAsset;
      }>('/api/caption-maker/upload', file, (bgm) => {
        setUploadProgress((current) => ({ ...current, bgm }));
      }, 'audio', controller.signal);
      if (!data?.success || !data.asset) {
        throw new Error(data?.error || 'Unable to upload background music');
      }
      if (data.asset.fileUrl) {
        const newTrack: BgMusicTrack = {
          id: `custom_bgm_${Date.now()}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileUrl: data.asset.fileUrl,
          storagePath: data.asset.storagePath,
          volume: 0.2,
          custom: true,
          fadeInDuration: 0.8,
          fadeOutDuration: 1.2,
          autoDucking: true,
        };
        const updated = saveCustomBgmTrack(newTrack);
        setCustomBgmTracks(updated);
        onBgMusicChange?.(newTrack);
      }
      setUploadProgress((current) => ({ ...current, bgm: 100 }));
    } catch (err: any) {
      if (err instanceof UploadCancelledError) {
        setUploadProgress((current) => ({ ...current, bgm: 0 }));
        setUploadError(null);
      } else {
        setUploadError(err.message || 'Failed to upload custom background music');
      }
    } finally {
      uploadAbortControllers.current.bgm = null;
      setIsUploadingBgm(false);
    }
  };

  const handleDeleteCustomBgm = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = deleteCustomBgmTrack(id);
    setCustomBgmTracks(updated);
    if (bgMusic?.id === id) {
      onBgMusicChange?.(undefined);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const processMediaQueue = async () => {
    if (mediaQueueProcessingRef.current) return;
    mediaQueueProcessingRef.current = true;

    try {
      while (mediaQueueRef.current.length > 0) {
        const file = mediaQueueRef.current.shift();
        if (!file) continue;

        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        const isVideoFile = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
        const isImageFile = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        const itemNumber = mediaQueueCompletedRef.current + 1;
        setMediaQueueStatus({ current: itemNumber, total: mediaQueueTotalRef.current, fileName: file.name });
        setUploadProgress((current) => ({ ...current, media: 0 }));

        if (!isVideoFile && !isImageFile) {
          mediaQueueErrorsRef.current.push(`${file.name}: unsupported format`);
          mediaQueueCompletedRef.current += 1;
          continue;
        }

        const controller = new AbortController();
        uploadAbortControllers.current.media = controller;
        try {
          const data = await uploadFileWithProgress<{
            success?: boolean;
            error?: string;
            asset?: ImageAsset;
          }>('/api/caption-maker/upload', file, (media) => {
            setUploadProgress((current) => ({ ...current, media }));
          }, isVideoFile ? 'video' : 'image', controller.signal);
          if (!data.success || !data.asset) {
            throw new Error(data.error || 'Failed to upload background media');
          }

          // Keep every completed upload in the project library while selecting it on the canvas.
          onImageChange(data.asset);
        } catch (err: unknown) {
          if (err instanceof UploadCancelledError) {
            mediaQueueRef.current = [];
            setUploadProgress((current) => ({ ...current, media: 0 }));
            setUploadError(null);
            break;
          }
          mediaQueueErrorsRef.current.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
        } finally {
          if (uploadAbortControllers.current.media === controller) {
            uploadAbortControllers.current.media = null;
          }
          mediaQueueCompletedRef.current += 1;
        }
      }
    } finally {
      mediaQueueProcessingRef.current = false;
      setIsUploadingMedia(false);
      setMediaQueueStatus(null);
      const errors = mediaQueueErrorsRef.current;
      if (errors.length) {
        setUploadError(`${errors.length} file${errors.length === 1 ? '' : 's'} could not be uploaded. ${errors.slice(0, 2).join(' • ')}`);
      } else {
        setUploadError(null);
      }
      if (mediaQueueRef.current.length > 0) {
        setIsUploadingMedia(true);
        void processMediaQueue();
      } else {
        mediaQueueCompletedRef.current = 0;
        mediaQueueTotalRef.current = 0;
        mediaQueueErrorsRef.current = [];
      }
    }
  };

  const handleMediaFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const validExtensions = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.jpg', '.jpeg', '.png', '.webp'];
    const validFiles = files.filter((file) => validExtensions.includes(file.name.substring(file.name.lastIndexOf('.')).toLowerCase()));
    const invalidCount = files.length - validFiles.length;
    if (!mediaQueueProcessingRef.current && mediaQueueRef.current.length === 0) {
      mediaQueueCompletedRef.current = 0;
      mediaQueueTotalRef.current = 0;
      mediaQueueErrorsRef.current = [];
      setUploadError(null);
    }
    if (invalidCount) {
      mediaQueueErrorsRef.current.push(`${invalidCount} unsupported file${invalidCount === 1 ? '' : 's'} skipped. Use MP4, MOV, WEBM, MKV, AVI, JPG, PNG, or WEBP.`);
    }
    if (!validFiles.length) {
      setUploadError(mediaQueueErrorsRef.current.join(' • '));
      return;
    }
    mediaQueueRef.current.push(...validFiles);
    mediaQueueTotalRef.current += validFiles.length;
    setIsUploadingMedia(true);
    setMediaQueueStatus((current) => ({
      current: current?.current || mediaQueueCompletedRef.current + 1,
      total: mediaQueueTotalRef.current,
      fileName: current?.fileName || validFiles[0].name,
    }));
    void processMediaQueue();
  };

  const handleAudioFile = async (file: File) => {
    if (uploadAbortControllers.current.audio) return;
    setUploadError(null);
    setIsUploadingAudio(true);
    setUploadProgress((current) => ({ ...current, audio: 0 }));
    const controller = new AbortController();
    uploadAbortControllers.current.audio = controller;
    try {
      const data = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: AudioAsset;
      }>('/api/caption-maker/upload', file, (audio) => {
        setUploadProgress((current) => ({ ...current, audio }));
      }, 'audio', controller.signal);
      if (!data.success || !data.asset) {
        throw new Error(data.error || 'Failed to process audio or extract from video');
      }

      if (data.asset.sourceType === 'video' && data.asset.sourceVideo?.mediaType === 'video') {
        setPendingVideoVoice(data.asset);
      } else onAudioChange(data.asset);
      setUploadProgress((current) => ({ ...current, audio: 100 }));
    } catch (err: any) {
      if (err instanceof UploadCancelledError) {
        setUploadProgress((current) => ({ ...current, audio: 0 }));
        setUploadError(null);
      } else {
        setUploadError(err.message);
      }
    } finally {
      uploadAbortControllers.current.audio = null;
      setIsUploadingAudio(false);
    }
  };

  const toggleAudioPlay = async () => {
    const player = audioRef.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
    } else {
      setAudioPlaybackError(null);
      try {
        await player.play();
      } catch {
        setIsPlayingAudio(false);
        setAudioPlaybackError('Audio preview could not start. Check your connection or upload the file again.');
      }
    }
  };

  const isVideo =
    image?.mediaType === 'video' ||
    (image?.format && ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI'].includes(image.format.toUpperCase())) ||
    (image?.fileName && (
      image.fileName.toLowerCase().endsWith('.mp4') ||
      image.fileName.toLowerCase().endsWith('.mov') ||
      image.fileName.toLowerCase().endsWith('.webm')
    ));

  const isAudioFromVideo =
    audio?.sourceType === 'video' ||
    (audio?.format && ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI'].includes(audio.format.toUpperCase())) ||
    (audio?.fileName && (
      audio.fileName.toLowerCase().endsWith('.mp4') ||
      audio.fileName.toLowerCase().endsWith('.mov') ||
      audio.fileName.toLowerCase().endsWith('.webm') ||
      audio.fileName.includes('(Audio)') ||
      audio.fileName.includes('(Video Audio)')
    ));

  return (
    <div className="space-y-4">
      {pendingVideoVoice && (
        <div role="dialog" aria-modal="true" aria-labelledby="voice-video-background-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-400/25 bg-zinc-900 p-6 shadow-2xl">
            <Film className="h-7 w-7 text-amber-400" aria-hidden="true" />
            <h3 id="voice-video-background-title" className="text-lg font-bold text-white">Use this video as background?</h3>
            <p className="text-sm text-zinc-300">Your voice has been extracted. You can also use the same video as your background media.</p>
            <p className="truncate text-xs text-zinc-500">{pendingVideoVoice.originalVideoFileName}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => { onAudioChange(pendingVideoVoice, false); setPendingVideoVoice(null); }} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800">Keep current background</button>
              <button type="button" onClick={() => { onAudioChange(pendingVideoVoice, true); setPendingVideoVoice(null); }} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300">Use video as background</button>
            </div>
          </div>
        </div>
      )}
      {uploadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 1. Background Media (Video / Image) Asset Card */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files?.length) handleMediaFiles(e.dataTransfer.files);
        }}
        className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg border ${
              isVideo
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
            }`}>
              {isVideo ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Background {isVideo ? 'Video' : image ? 'Image' : 'Media (Video / Image)'}
            </h4>
          </div>
          {image && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
              isVideo
                ? 'text-amber-400 bg-amber-950/60 border-amber-800/50'
                : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50'
            }`}>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                {isVideo ? `Video • ${formatDuration(image.duration)}` : <span className="sr-only">Image upload complete</span>}
              </span>
            </span>
          )}
        </div>

        {isUploadingMedia && image && (
          <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold text-amber-200">
                Uploading {mediaQueueStatus?.current || 1} of {mediaQueueStatus?.total || 1}: {mediaQueueStatus?.fileName || 'background media'} ({uploadProgress.media}%)
              </p>
              <p className="text-[9px] text-zinc-500">Additional files are queued and uploaded one at a time.</p>
            </div>
            <button type="button" onClick={() => cancelUpload('media')} className="shrink-0 rounded border border-red-500/30 px-2 py-1 text-[9px] font-semibold text-red-300 hover:bg-red-500/10">Cancel queue</button>
          </div>
        )}

        {image ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/60 aspect-[16/9] flex items-center justify-center group">
              {(image.fitMode || 'cover') === 'contain' ? (
                <div
                  className="w-full h-full flex p-1.5 transition-all duration-200"
                  style={{
                    justifyContent: POS_ALIGNMENT[image.position || 'bottom-left'].justifyContent,
                    alignItems: POS_ALIGNMENT[image.position || 'bottom-left'].alignItems,
                  }}
                >
                  {isVideo ? (
                    <video
                      src={image.fileUrl}
                      muted
                      playsInline
                      style={{
                        maxWidth: `${image.scale ?? 100}%`,
                        maxHeight: `${image.scale ?? 100}%`,
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                      }}
                      className="rounded shadow transition-all duration-200"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.fileUrl}
                      alt={image.fileName}
                      style={{
                        maxWidth: `${image.scale ?? 100}%`,
                        maxHeight: `${image.scale ?? 100}%`,
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                      }}
                      className="rounded shadow transition-all duration-200"
                    />
                  )}
                </div>
              ) : (
                isVideo ? (
                  <video
                    src={image.fileUrl}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.fileUrl}
                    alt={image.fileName}
                    className="w-full h-full object-cover"
                  />
                )
              )}
              {isVideo && (
                <div className="absolute top-2 left-2 pointer-events-none bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                  <Film className="w-3 h-3 text-amber-400" />
                  <span>VIDEO</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => anyMediaInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white flex items-center space-x-1 shadow-md cursor-pointer"
                  title="Replace background media"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Replace</span>
                </button>
                <button
                  type="button"
                  onClick={() => onImageChange(undefined)}
                  className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs font-semibold text-white flex items-center space-x-1 shadow-md cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <span className="truncate max-w-[140px] text-zinc-200">{image.fileName}</span>
              <span>{formatFileSize(image.fileSize)}</span>
            </div>

            {/* Fit Mode Switcher */}
            <div className="pt-1 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 text-[11px] font-medium flex items-center space-x-1">
                <Sliders className="w-3 h-3 text-zinc-500" />
                <span>Fit Mode:</span>
              </span>
              <div className="flex items-center space-x-1 bg-zinc-950 p-0.5 rounded-lg border border-white/10 text-[10px] font-semibold">
                {(['cover', 'contain', 'blur'] as ImageFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onFitModeChange(mode)}
                    className={`px-2 py-0.5 rounded uppercase transition-all cursor-pointer ${
                      (image.fitMode || 'cover') === mode
                        ? 'bg-white text-zinc-950 font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* 9 Positioning Options when Contain is selected */}
            {(image.fitMode || 'cover') === 'contain' && (
              <div className="pt-2.5 border-t border-white/5 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-medium flex items-center space-x-1.5">
                    <Move className="w-3.5 h-3.5 text-amber-400" />
                    <span>Contain Position</span>
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                    {CONTAIN_POSITIONS.find((p) => p.id === (image.position || 'bottom-left'))?.label || 'Bottom Left'}
                  </span>
                </div>

                {/* 3x3 Grid with 9 Positioning Options */}
                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-zinc-950/80 rounded-xl border border-white/10">
                  {CONTAIN_POSITIONS.map((pos) => {
                    const isSelected = (image.position || 'bottom-left') === pos.id;
                    const IconComponent = pos.Icon;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => onPositionChange?.(pos.id)}
                        title={pos.label}
                        className={`py-1.5 px-1 rounded-lg text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400 text-black font-bold shadow-md shadow-amber-400/20 ring-1 ring-amber-300'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/5'
                        }`}
                      >
                        <span className="text-[11px] leading-tight font-medium">
                          {pos.shortLabel}
                        </span>
                        <IconComponent
                          className={`w-3.5 h-3.5 mt-0.5 ${
                            isSelected ? 'text-black stroke-[2.5]' : 'text-zinc-400 stroke-2'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Image Scale Slider & Presets */}
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300 font-medium flex items-center space-x-1">
                      <Maximize2 className="w-3 h-3 text-amber-400" />
                      <span>Media Scale</span>
                    </span>
                    <span className="text-[10px] font-mono text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      {image.scale ?? 100}%
                    </span>
                  </div>

                  {/* Preset Pills */}
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: 'Full', val: 100 },
                      { label: 'Std 85%', val: 85 },
                      { label: 'Mid 70%', val: 70 },
                      { label: 'Mini 50%', val: 50 },
                    ].map((preset) => {
                      const isActive = (image.scale ?? 100) === preset.val;
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => onScaleChange?.(preset.val)}
                          className={`py-1 rounded text-[10px] font-semibold transition-all cursor-pointer text-center ${
                            isActive
                              ? 'bg-amber-400 text-black font-bold shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Scale Range Slider */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono">40%</span>
                    <input
                      type="range"
                      min="40"
                      max="200"
                      step="5"
                      value={image.scale ?? 100}
                      onChange={(e) => onScaleChange?.(Number(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                    <span className="text-[9px] text-zinc-500 font-mono">200%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-4 text-center transition-all bg-zinc-950/40 hover:bg-zinc-900/50 flex flex-col items-center justify-center space-y-2.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition-all">
              {isUploadingMedia ? (
                <UploadProgressIndicator progress={uploadProgress.media} processing={uploadProgress.media >= 100} size={30} label="Background media upload" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-200">
                {isUploadingMedia
                  ? `${uploadProgress.media >= 100 ? 'Processing' : 'Uploading'} ${mediaQueueStatus?.current || 1} of ${mediaQueueStatus?.total || 1}: ${mediaQueueStatus?.fileName || 'background media'} (${uploadProgress.media}%)...`
                  : 'Choose Background Video or Image'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Drag & drop video or image file or choose below:</p>
            </div>

            {isUploadingMedia && (
              <button
                type="button"
                onClick={() => cancelUpload('media')}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="h-3 w-3" />
                Cancel upload
              </button>
            )}

            {/* Quick Upload Choice Buttons: Video and Image */}
            <div className="flex items-center gap-2 pt-1 w-full max-w-[270px]">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex-1 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>{isUploadingMedia ? 'Add Videos' : 'Upload Video'}</span>
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex-1 py-1.5 px-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 hover:text-sky-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-sky-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>{isUploadingMedia ? 'Add Images' : 'Upload Image'}</span>
              </button>
            </div>
            <button type="button" onClick={() => anyMediaInputRef.current?.click()} className="text-[10px] font-semibold text-zinc-400 underline decoration-white/20 underline-offset-2 hover:text-white">
              Select multiple images and videos
            </button>
            <p className="text-[9px] text-zinc-500 font-mono">
              MP4, MOV, WEBM or JPG, PNG, WEBP (Reel visual background)
            </p>
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files?.length) handleMediaFiles(files);
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files?.length) handleMediaFiles(files);
          }}
        />
        <input
          ref={anyMediaInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files?.length) handleMediaFiles(files);
          }}
        />

        {mediaAssets.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 space-y-2" aria-label="Uploaded project media">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-[11px] font-bold text-zinc-200">Project Media</h5>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-zinc-500">{mediaAssets.length} uploaded</span>
                <button type="button" onClick={() => anyMediaInputRef.current?.click()} className="rounded border border-amber-500/30 px-2 py-1 text-[9px] font-semibold text-amber-300 hover:bg-amber-500/10">Add Media</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto">
              {mediaAssets.map((asset) => {
                const active = asset.id === image?.id;
                const assetIsVideo = asset.mediaType === 'video';
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onImageChange(asset)}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-amber-400/60 bg-amber-500/10 text-amber-200'
                        : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                    }`}
                  >
                    {assetIsVideo ? <Film className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
                    <span className="min-w-0 flex-1 truncate text-[10px]">{asset.fileName}</span>
                    <span className="shrink-0 text-[9px] uppercase text-zinc-500">{assetIsVideo ? 'Video' : 'Image'}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="Active background" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-zinc-500">Choose which uploaded image or video to use as the active background.</p>
          </section>
        )}
      </div>

      {/* 2. Audio Voice Recording Asset Card */}
      <div className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg border ${
              isAudioFromVideo
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {isAudioFromVideo ? <Film className="w-4 h-4" /> : <Music className="w-4 h-4" />}
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Spoken Audio / Voice
            </h4>
          </div>
          {audio && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
              isAudioFromVideo
                ? 'text-amber-400 bg-amber-950/60 border-amber-800/50'
                : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50'
            }`}>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                {isAudioFromVideo ? `Video Voice • ${audio.duration.toFixed(1)}s` : `Audio • ${audio.duration.toFixed(1)}s`}
              </span>
            </span>
          )}
        </div>

        {audio ? (
          <div className="space-y-3">
            {audio.sourceType === 'video' && audio.sourceVideo?.mediaType === 'video' && (
              <button
                type="button"
                disabled={isTranscribing || image?.id === audio.sourceVideo.id}
                onClick={() => onImageChange(audio.sourceVideo)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                title={isTranscribing ? 'Available when voice analysis finishes' : undefined}
              >
                <Film className="h-3.5 w-3.5" />
                {image?.id === audio.sourceVideo.id ? 'Using voice video as background' : 'Use this video as background'}
              </button>
            )}
            <div className="p-3 rounded-xl bg-zinc-950/80 border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={toggleAudioPlay}
                  aria-label={isPlayingAudio ? 'Pause uploaded audio preview' : 'Play uploaded audio preview'}
                  title={isPlayingAudio ? 'Pause preview' : 'Play preview'}
                  className="p-2 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 shadow-md transition-all cursor-pointer flex-shrink-0"
                >
                  {isPlayingAudio ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-100 truncate">{audio.fileName}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {formatFileSize(audio.fileSize)} • {audio.format} {isAudioFromVideo ? '• (Voice Extracted)' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => anyAudioInputRef.current?.click()}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Replace with Audio or Video"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => audioVideoInputRef.current?.click()}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500/25 text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Replace with Video file (extract voice)"
                >
                  <Film className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAudioChange(undefined)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/80 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Remove audio"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <audio
                ref={audioRef}
                src={audio.fileUrl}
                preload="metadata"
                onLoadStart={() => {
                  setAudioPlaybackError(null);
                  setIsPlayingAudio(false);
                }}
                onPlay={() => setIsPlayingAudio(true)}
                onPause={() => setIsPlayingAudio(false)}
                onEnded={() => setIsPlayingAudio(false)}
                onError={() => {
                  setIsPlayingAudio(false);
                  setAudioPlaybackError('Audio preview could not load. Check your connection or upload the file again.');
                }}
                className="hidden"
              />
            </div>
            {audioPlaybackError && (
              <p role="status" className="text-[10px] text-red-300" aria-live="polite">
                {audioPlaybackError}
              </p>
            )}

            {/* Voice Audio Mixer Controls (VN & Instagram Style) */}
            <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onVoiceMutedChange?.(!voiceMuted)}
                    className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                      voiceMuted ? 'text-red-400 bg-red-950/40 hover:bg-red-900/60' : 'text-zinc-300 hover:text-white bg-zinc-800'
                    }`}
                    title={voiceMuted ? 'Unmute Voice' : 'Mute Voice'}
                  >
                    {voiceMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <span className="text-[11px] font-medium text-zinc-300">Voice Volume</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-mono font-semibold ${
                    (voiceVolume ?? 1.0) > 1.0 ? 'text-amber-400' : 'text-zinc-300'
                  }`}>
                    {voiceMuted ? 'Muted' : `${Math.round((voiceVolume ?? 1.0) * 100)}%`}
                    {!voiceMuted && (voiceVolume ?? 1.0) > 1.0 && ' ⚡ Boost'}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={voiceMuted ? 0 : (voiceVolume ?? 1.0)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (voiceMuted) onVoiceMutedChange?.(false);
                  onVoiceVolumeChange?.(val);
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />

              {/* Studio Denoise Toggle */}
              <div className="pt-1 flex items-center justify-between border-t border-white/5">
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Waves className="w-3 h-3 text-cyan-400" />
                  Studio Denoise (Fan/Room Noise)
                </span>
                <button
                  type="button"
                  onClick={() => onStudioDenoiseChange?.(!studioDenoise)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold transition-all cursor-pointer ${
                    studioDenoise
                      ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {studioDenoise ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* 1. AI Gemini Audio Insights Badge */}
            {audioAnalysis && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5">
                    <AudioWaveform className="w-3.5 h-3.5 text-purple-400" />
                    Gemini Audio Insights
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700/50 capitalize">
                    {audioAnalysis.mood || 'Standard'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-zinc-400 uppercase">Energy</p>
                    <p className="text-[11px] font-bold text-amber-300 capitalize">{audioAnalysis.energyLevel || 'Medium'}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-zinc-400 uppercase">Tempo</p>
                    <p className="text-[11px] font-bold text-emerald-300 font-mono">{audioAnalysis.speechPaceWpm ? `${audioAnalysis.speechPaceWpm} WPM` : '140 WPM'}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-zinc-400 uppercase">Speakers</p>
                    <p className="text-[11px] font-bold text-cyan-300">{audioAnalysis.speakersDetected || 1} Person</p>
                  </div>
                </div>
                {audioAnalysis.summary && (
                  <p className="text-[10px] text-purple-200/90 leading-relaxed italic bg-black/20 p-1.5 rounded border border-purple-500/10">
                    &ldquo;{audioAnalysis.summary}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* 2. AI Smart Editing & Silence Studio ("AI Jump-Cutter") */}
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  AI Smart Edit & Silence Studio
                </span>
                {fillerSegments && fillerSegments.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700/50">
                    {fillerSegments.length} Gaps
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-300">
                Auto-detect dead air, awkward pauses, and viral hook moments on this clip.
              </p>
              <div className="flex items-center gap-2">
                {onOpenSmartEditor && (
                  <button
                    type="button"
                    onClick={onOpenSmartEditor}
                    className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-400" />
                    <span>Open Smart Studio</span>
                  </button>
                )}
                {fillerSegments && fillerSegments.length > 0 && onTrimFillers && (
                  <button
                    type="button"
                    onClick={onTrimFillers}
                    disabled={isTrimmingFillers}
                    className="py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>{isTrimmingFillers ? 'Trimming...' : 'Quick Trim'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. AI Auto-Sound Effects (SFX) Track Card */}
            <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[11px] font-medium text-zinc-300">AI Sound Effects (Auto-SFX)</span>
                </div>
                <button
                  type="button"
                  onClick={() => onAutoSfxEnabledChange?.(!autoSfxEnabled)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold transition-all cursor-pointer ${
                    autoSfxEnabled
                      ? 'bg-yellow-950/80 border-yellow-500/50 text-yellow-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {autoSfxEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {autoSfxEnabled && sfxCues.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {sfxCues.map((cue, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center gap-1"
                    >
                      <span>⚡ {cue.type}</span>
                      <span className="text-zinc-500">@{cue.time.toFixed(1)}s</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 4. AI Multi-Speaker Diarization & Colors */}
            <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px] font-medium text-zinc-300">Speaker Caption Colors</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {audioAnalysis?.speakersDetected && audioAnalysis.speakersDetected > 1 ? 'Dual Speaker' : 'Smart Diarization'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-300 font-medium">Speaker 1</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={speaker1Color}
                      onChange={(e) => onSpeaker1ColorChange?.(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[9px] font-mono text-zinc-400">{speaker1Color}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-300 font-medium">Speaker 2</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={speaker2Color}
                      onChange={(e) => onSpeaker2ColorChange?.(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[9px] font-mono text-cyan-400">{speaker2Color}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Status / Re-transcribe Trigger Button */}
            {isTranscribing ? (
              <div className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs animate-pulse">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span>AI Analyzing Voice & Synchronizing Captions...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onTranscribe}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
              >
                <AudioWaveform className="w-4 h-4" />
                <span>
                  Re-analyze Audio & Sync Captions ({preferredLanguage === 'hi' ? 'हिन्दी' : preferredLanguage === 'hinglish' ? 'Hinglish' : 'English'})
                </span>
              </button>
            )}
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleAudioFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-4 text-center transition-all bg-zinc-950/40 hover:bg-zinc-900/50 flex flex-col items-center justify-center space-y-2.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition-all">
              {isUploadingAudio ? (
              <UploadProgressIndicator progress={uploadProgress.audio} processing={uploadProgress.audio >= 100} size={30} label="Spoken audio upload" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-200">
                {isUploadingAudio
                  ? uploadProgress.audio >= 100
                    ? 'Preparing voice captions…'
                    : `Uploading Voice Audio/Video (${uploadProgress.audio}%)...`
                  : 'Choose Spoken Audio or Video'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Audio or video will be processed with AI for speech transcription and captions:
              </p>
            </div>

            {isUploadingAudio && (
              <button
                type="button"
                onClick={() => cancelUpload('audio')}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="h-3 w-3" />
                Cancel upload
              </button>
            )}

            {/* Quick Upload Choice Buttons: Audio and Video */}
            <div className="flex items-center gap-2 pt-1 w-full max-w-[270px]">
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isUploadingAudio}
                className="flex-1 py-1.5 px-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-emerald-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Music className="w-3.5 h-3.5 text-emerald-400" />
                <span>Upload Audio</span>
              </button>
              <button
                type="button"
                onClick={() => audioVideoInputRef.current?.click()}
                disabled={isUploadingAudio}
                className="flex-1 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload Video</span>
              </button>
            </div>

            <p className="text-[9px] text-zinc-500 font-mono">
              MP3, WAV, M4A, OGG or MP4, MOV, WEBM (Processed strictly for voice captions)
            </p>
          </div>
        )}

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleAudioFile(file);
          }}
        />
        <input
          ref={audioVideoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleAudioFile(file);
          }}
        />
        <input
          ref={anyAudioInputRef}
          type="file"
          accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg,video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleAudioFile(e.target.files[0]);
          }}
        />
      </div>

      {/* 3. Background Music (BGM) Card */}
      <div className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg border bg-purple-500/10 text-purple-400 border-purple-500/20">
              <Music className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Background Music (BGM)
            </h4>
          </div>
          {bgMusic && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border font-semibold text-purple-400 bg-purple-950/60 border-purple-800/50">
              🎵 {Math.round((bgMusic.volume ?? 0.2) * 100)}% Vol
            </span>
          )}
        </div>

        {/* AI Recommended BGM Quick Action */}
        {audioAnalysis?.recommendedBgmId && (
          <button
            type="button"
            onClick={() => {
              const rec = PRESET_BGM_TRACKS.find((t) => t.id === audioAnalysis.recommendedBgmId);
              if (rec) {
                onBgMusicChange?.({
                  ...rec,
                  volume: audioAnalysis.suggestedBgmVolume ?? 0.2,
                });
              }
            }}
            className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 border border-purple-500/40 text-purple-200 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <span className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-amber-400" />
              <span>AI Auto-Match: {PRESET_BGM_TRACKS.find((t) => t.id === audioAnalysis.recommendedBgmId)?.title}</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-700/50">Apply</span>
          </button>
        )}

        {/* Track Selection Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (bgmPreviewRef.current) {
                bgmPreviewRef.current.pause();
                setIsPreviewingBgm(false);
              }
              onBgMusicChange?.(undefined);
            }}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-all cursor-pointer ${
              !bgMusic
                ? 'bg-purple-500/20 border-purple-500/50 text-white font-semibold'
                : 'bg-zinc-950/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>None</span>
            {!bgMusic && <Check className="w-3 h-3 text-purple-400" />}
          </button>
          {PRESET_BGM_TRACKS.map((track) => {
            const isSelected = bgMusic?.id === track.id;
            const isAiRecommended = audioAnalysis?.recommendedBgmId === track.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => {
                  onBgMusicChange?.({
                    ...track,
                    volume: isAiRecommended
                      ? (audioAnalysis?.suggestedBgmVolume ?? bgMusic?.volume ?? 0.2)
                      : (bgMusic?.volume ?? 0.2),
                  });
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-500/20 border-purple-500/50 text-white font-semibold'
                    : isAiRecommended
                    ? 'bg-purple-950/40 border-amber-500/50 text-amber-200 hover:bg-purple-900/50'
                    : 'bg-zinc-950/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="truncate">{track.title}</span>
                  {isAiRecommended && (
                    <span className="text-[8px] font-mono text-amber-400 bg-amber-950/80 px-1 rounded border border-amber-700/50">
                      AI
                    </span>
                  )}
                </div>
                {isSelected && <Check className="w-3 h-3 text-purple-400 shrink-0" />}
              </button>
            );
          })}
          </div>

          {/* User's Custom Uploaded BGM Library */}
          {customBgmTracks.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-white/5">
              <span className="text-[10px] text-zinc-400 font-semibold block">
                My Uploaded Music ({customBgmTracks.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {customBgmTracks.map((customTrack) => {
                  const isSelected = bgMusic?.id === customTrack.id;
                  return (
                    <div
                      key={customTrack.id}
                      onClick={() =>
                        onBgMusicChange?.({
                          ...customTrack,
                          volume: bgMusic?.volume ?? 0.2,
                        })
                      }
                      className={`p-2 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 text-white font-semibold shadow-sm'
                          : 'bg-zinc-950/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                      }`}
                    >
                      <div className="min-w-0 pr-1 flex items-center gap-1.5">
                        <span className="text-[10px]">🎵</span>
                        <span className="text-xs truncate">{customTrack.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Upload complete" role="img" />
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomBgm(e, customTrack.id)}
                          title="Remove track from library"
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Custom Track Trigger Button */}
          <button
            type="button"
            onClick={() => bgmCustomInputRef.current?.click()}
            disabled={isUploadingBgm}
            className="w-full py-2 px-3 rounded-xl border border-dashed border-purple-500/30 hover:border-purple-500/60 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-50"
          >
            {isUploadingBgm ? (
              <UploadProgressIndicator progress={uploadProgress.bgm} processing={uploadProgress.bgm >= 100} size={26} label="Background music upload" className="text-purple-400" />
            ) : (
              <UploadCloud className="w-4 h-4 text-purple-400" />
            )}
            <span>
              {isUploadingBgm
                ? uploadProgress.bgm >= 100
                  ? 'Processing track…'
                  : `Uploading Track (${uploadProgress.bgm}%)...`
                : '+ Upload Custom MP3 / WAV Music'}
            </span>
          </button>

          {isUploadingBgm && (
            <button
              type="button"
              onClick={() => cancelUpload('bgm')}
              className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <X className="h-3 w-3" />
              Cancel upload
            </button>
          )}

        <input
          ref={bgmCustomInputRef}
          type="file"
          accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleCustomBgmUpload(file);
          }}
        />

        {/* Volume & Advanced VN Controls if BGM is active */}
        {bgMusic && (
          <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onBgMusicChange?.({
                      ...bgMusic,
                      muted: !bgMusic.muted,
                    })
                  }
                  className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                    bgMusic.muted
                      ? 'text-red-400 bg-red-950/40 hover:bg-red-900/60'
                      : 'text-zinc-300 hover:text-white bg-zinc-800'
                  }`}
                  title={bgMusic.muted ? 'Unmute BGM' : 'Mute BGM'}
                >
                  {bgMusic.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[11px] font-medium text-zinc-300">BGM Volume</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-purple-300 font-semibold">
                  {bgMusic.muted ? 'Muted' : `${Math.round((bgMusic.volume ?? 0.2) * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={toggleBgmTestPlay}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Preview BGM"
                >
                  {isPreviewingBgm ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgMusic.muted ? 0 : (bgMusic.volume ?? 0.2)}
              onChange={(e) => {
                const newVol = parseFloat(e.target.value);
                onBgMusicChange?.({
                  ...bgMusic,
                  volume: newVol,
                  muted: false,
                });
                if (bgmPreviewRef.current) {
                  bgmPreviewRef.current.volume = newVol;
                }
              }}
              className="w-full accent-purple-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
            />

            {/* VN & Instagram Audio Controls */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {/* Fade In */}
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Fade In</span>
                    <span className="font-mono text-zinc-300">{(bgMusic.fadeInDuration ?? 0.8).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={bgMusic.fadeInDuration ?? 0.8}
                    onChange={(e) =>
                      onBgMusicChange?.({
                        ...bgMusic,
                        fadeInDuration: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-purple-400 cursor-pointer h-1 bg-zinc-800 rounded"
                  />
                </div>

                {/* Fade Out */}
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Fade Out</span>
                    <span className="font-mono text-zinc-300">{(bgMusic.fadeOutDuration ?? 1.2).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={bgMusic.fadeOutDuration ?? 1.2}
                    onChange={(e) =>
                      onBgMusicChange?.({
                        ...bgMusic,
                        fadeOutDuration: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-purple-400 cursor-pointer h-1 bg-zinc-800 rounded"
                  />
                </div>
              </div>

              {/* Smart Auto-Ducking Switch */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <span>📉 Auto-Ducking (Dip while speaking)</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onBgMusicChange?.({
                      ...bgMusic,
                      autoDucking: bgMusic.autoDucking === false ? true : false,
                    })
                  }
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold transition-all cursor-pointer ${
                    bgMusic.autoDucking !== false
                      ? 'bg-purple-950/80 border-purple-500/50 text-purple-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {bgMusic.autoDucking !== false ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Start Offset (Hook / Drop Scrubber) */}
              <div className="pt-1">
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Start from Hook / Offset</span>
                  <span className="font-mono text-zinc-300">{(bgMusic.startOffset ?? 0).toFixed(0)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={bgMusic.startOffset ?? 0}
                  onChange={(e) =>
                    onBgMusicChange?.({
                      ...bgMusic,
                      startOffset: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-purple-400 cursor-pointer h-1 bg-zinc-800 rounded"
                />
              </div>
            </div>

            <audio
              ref={bgmPreviewRef}
              src={bgMusic.fileUrl}
              onEnded={() => setIsPreviewingBgm(false)}
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );
};
