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
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
} from 'lucide-react';
import { AudioAsset, ImageAsset, ImageFitMode } from '@/lib/caption-maker/types';

interface AssetUploadSectionProps {
  image?: ImageAsset;
  audio?: AudioAsset;
  onImageChange: (image?: ImageAsset) => void;
  onAudioChange: (audio?: AudioAsset) => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  onFitModeChange: (mode: ImageFitMode) => void;
}

export const AssetUploadSection: React.FC<AssetUploadSectionProps> = ({
  image,
  audio,
  onImageChange,
  onAudioChange,
  onTranscribe,
  isTranscribing,
  onFitModeChange,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImageFile = async (file: File) => {
    setUploadError(null);
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');

      const res = await fetch('/api/caption-maker/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload image');
      }

      onImageChange(data.asset);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingImage(false);
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

  return (
    <div className="space-y-4">
      {uploadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 1. Background Image Asset Card */}
      <div className="rounded-2xl bg-zinc-900/90 border border-white/10 p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <ImageIcon className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Background Image
            </h4>
          </div>
          {image && (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
              Ready
            </span>
          )}
        </div>

        {image ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/60 aspect-[16/9] flex items-center justify-center group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.fileUrl}
                alt={image.fileName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
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
                {(['cover', 'contain', 'blur'] as ImageFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onFitModeChange(mode)}
                    className={`px-2 py-0.5 rounded uppercase transition-all cursor-pointer ${
                      image.fitMode === mode
                        ? 'bg-white text-zinc-950 font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => imageInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleImageFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-white/10 hover:border-sky-500/50 rounded-xl p-5 text-center cursor-pointer transition-all hover:bg-sky-500/5 flex flex-col items-center justify-center space-y-2 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-sky-400 group-hover:scale-105 transition-all">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                {isUploadingImage ? 'Uploading Image...' : 'Drop background image here'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">JPG, PNG, or WEBP (up to 25MB)</p>
            </div>
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
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
