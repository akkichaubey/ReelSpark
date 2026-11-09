'use client';

import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { AlertCircle, Check, CheckCircle2, Music, Pause, Play, Trash2, UploadCloud, Volume2, VolumeX, X } from 'lucide-react';
import { UploadProgressIndicator } from '@/components/ProgressCircle';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';
import type { AudioAnalysisResult, AudioAsset, BgMusicTrack, ImageAsset } from '@/lib/caption-maker/types';
import { PRESET_BGM_TRACKS } from '@/lib/caption-maker/sample-data';
import { getCustomBgmTracks, saveCustomBgmTrack, deleteCustomBgmTrack, validateBgmFile } from '@/lib/caption-maker/custom-bgm';

export function BackgroundMusicPicker({ bgMusic, audioAnalysis, onBgMusicChange }: {
  bgMusic?: BgMusicTrack;
  audioAnalysis?: AudioAnalysisResult;
  onBgMusicChange: (track?: BgMusicTrack) => void;
}) {
  const bgmCustomInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [customBgmTracks, setCustomBgmTracks] = useState<BgMusicTrack[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadController = useRef<AbortController | null>(null);

  useEffect(() => () => uploadController.current?.abort(), []);

  // Load custom BGM library from localStorage
  useEffect(() => {
    // Hydrate browser-only, account-scoped data after SSR to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomBgmTracks(getCustomBgmTracks());
  }, []);

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
    if (uploadController.current) return;
    setUploadError(null);
    const validation = validateBgmFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid audio file');
      return;
    }

    try {
      setIsUploadingBgm(true);
      setUploadProgress(0);
      const controller = new AbortController();
      uploadController.current = controller;
      const data = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: ImageAsset | AudioAsset;
      }>('/api/caption-maker/upload', file, (bgm) => {
        setUploadProgress(bgm);
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
      setUploadProgress(100);
    } catch (err: unknown) {
      if (err instanceof UploadCancelledError) {
        setUploadProgress(0);
        setUploadError(null);
      } else {
        setUploadError(err instanceof Error ? err.message : 'Failed to upload custom background music');
      }
    } finally {
      uploadController.current = null;
      setIsUploadingBgm(false);
    }
  };

  const handleDeleteCustomBgm = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = deleteCustomBgmTrack(id);
    setCustomBgmTracks(updated);
    if (bgMusic?.id === id) {
      onBgMusicChange?.(undefined);
    }
  };

  return (
    <>
      {uploadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

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
          <Button
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
          </Button>
        )}

        {/* Track Selection Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
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
          </Button>
          {PRESET_BGM_TRACKS.map((track) => {
            const isSelected = bgMusic?.id === track.id;
            const isAiRecommended = audioAnalysis?.recommendedBgmId === track.id;
            return (
              <Button
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
              </Button>
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
                        <Button
                          type="button"
                          onClick={(e) => handleDeleteCustomBgm(e, customTrack.id)}
                          title="Remove track from library"
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Custom Track Trigger Button */}
          <Button
            type="button"
            onClick={() => bgmCustomInputRef.current?.click()}
            disabled={isUploadingBgm}
            className="w-full py-2 px-3 rounded-xl border border-dashed border-purple-500/30 hover:border-purple-500/60 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-50"
          >
            {isUploadingBgm ? (
              <UploadProgressIndicator progress={uploadProgress} processing={uploadProgress >= 100} size={26} label="Background music upload" className="text-purple-400" />
            ) : (
              <UploadCloud className="w-4 h-4 text-purple-400" />
            )}
            <span>
              {isUploadingBgm
                ? uploadProgress >= 100
                  ? 'Processing track…'
                  : `Uploading Track (${uploadProgress}%)...`
                : '+ Upload Custom MP3 / WAV Music'}
            </span>
          </Button>

          {isUploadingBgm && (
            <Button
              type="button"
              onClick={() => uploadController.current?.abort()}
              className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <X className="h-3 w-3" />
              Cancel upload
            </Button>
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
                <Button
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
                </Button>
                <span className="text-[11px] font-medium text-zinc-300">BGM Volume</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-purple-300 font-semibold">
                  {bgMusic.muted ? 'Muted' : `${Math.round((bgMusic.volume ?? 0.2) * 100)}%`}
                </span>
                <Button
                  type="button"
                  onClick={toggleBgmTestPlay}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Preview BGM"
                >
                  {isPreviewingBgm ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </Button>
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
                <Button
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
                </Button>
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
    </>
  );
}
