'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Music,
  Trash2,
  RefreshCw,
  Sparkles,
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
} from 'lucide-react';
import { AudioAsset, ImageAsset, ImageFitMode, ImagePosition } from '@/lib/caption-maker/types';

interface AssetUploadSectionProps {
  image?: ImageAsset;
  audio?: AudioAsset;
  onImageChange: (image?: ImageAsset, accompanyingAudio?: AudioAsset) => void;
  onAudioChange: (audio?: AudioAsset) => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  onFitModeChange: (mode: ImageFitMode) => void;
  onPositionChange?: (position: ImagePosition) => void;
  onScaleChange?: (scale: number) => void;
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
  audio,
  onImageChange,
  onAudioChange,
  onTranscribe,
  isTranscribing,
  onFitModeChange,
  onPositionChange,
  onScaleChange,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const handleMediaFile = async (file: File) => {
    setUploadError(null);
    setIsUploadingMedia(true);
    try {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', isVideo ? 'video' : 'image');

      const res = await fetch('/api/caption-maker/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload media file');
      }

      onImageChange(data.asset, data.audioAsset);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleAudioFile = async (file: File) => {
    setUploadError(null);
    setIsUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'audio');

      const res = await fetch('/api/caption-maker/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload audio');
      }

      onAudioChange(data.asset);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlayingAudio(true);
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

  return (
    <div className="space-y-4">
      {uploadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 1. Background Media (Video / Image) Asset Card */}
      <div className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg">
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
              {isVideo ? `🎬 Video • ${formatDuration(image.duration)}` : '🖼️ Image Ready'}
            </span>
          )}
        </div>

        {image ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/60 aspect-[16/9] flex items-center justify-center group">
              {(image.fitMode || 'contain') === 'contain' ? (
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
                  onClick={() => mediaInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white flex items-center space-x-1 shadow-md cursor-pointer"
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
                {(['cover', 'contain'] as ImageFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onFitModeChange(mode)}
                    className={`px-2 py-0.5 rounded uppercase transition-all cursor-pointer ${
                      (image.fitMode || 'contain') === mode
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
            {(image.fitMode || 'contain') === 'contain' && (
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
                      max="100"
                      step="5"
                      value={image.scale ?? 100}
                      onChange={(e) => onScaleChange?.(Number(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                    <span className="text-[9px] text-zinc-500 font-mono">100%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleMediaFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-4 text-center transition-all bg-zinc-950/40 hover:bg-zinc-900/50 flex flex-col items-center justify-center space-y-2.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition-all">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-200">
                {isUploadingMedia ? 'Uploading Media...' : 'Choose Background Video or Image'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Drag & drop media file or choose below:</p>
            </div>

            {/* Quick Upload Choice Buttons */}
            <div className="flex items-center gap-2 pt-1 w-full max-w-[270px]">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="flex-1 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload Video</span>
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="flex-1 py-1.5 px-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 hover:text-sky-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-sky-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>Upload Image</span>
              </button>
            </div>
            <p className="text-[9px] text-zinc-600 font-mono">MP4, WEBM, MOV or JPG, PNG, WEBP (up to 100MB)</p>
          </div>
        )}

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-matroska"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleMediaFile(e.target.files[0]);
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleMediaFile(e.target.files[0]);
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleMediaFile(e.target.files[0]);
          }}
        />
      </div>

      {/* 2. Audio Voice Recording Asset Card */}
      <div className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Music className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Spoken Audio / Voice
            </h4>
          </div>
          {audio && (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
              {audio.duration.toFixed(1)}s
            </span>
          )}
        </div>

        {audio ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-zinc-950/80 border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={toggleAudioPlay}
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
                    {formatFileSize(audio.fileSize)} • {audio.format}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  title="Replace audio"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAudioChange(undefined)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/80 text-zinc-400 hover:text-white transition-colors"
                  title="Remove audio"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <audio
                ref={audioRef}
                src={audio.fileUrl}
                onEnded={() => setIsPlayingAudio(false)}
                className="hidden"
              />
            </div>

            {/* Transcribe Trigger Button */}
            <button
              type="button"
              onClick={onTranscribe}
              disabled={isTranscribing}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              <span>
                {isTranscribing ? 'Transcribing Word Timestamps...' : 'Transcribe & Detect Keywords'}
              </span>
            </button>
          </div>
        ) : (
          <div
            onClick={() => audioInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleAudioFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-white/10 hover:border-amber-500/50 rounded-xl p-5 text-center cursor-pointer transition-all hover:bg-amber-500/5 flex flex-col items-center justify-center space-y-2 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition-all">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                {isUploadingAudio ? 'Uploading Audio...' : 'Drop audio voice recording here'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">MP3, WAV, M4A, AAC, OGG</p>
            </div>
          </div>
        )}

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleAudioFile(e.target.files[0]);
          }}
        />
      </div>
    </div>
  );
};
