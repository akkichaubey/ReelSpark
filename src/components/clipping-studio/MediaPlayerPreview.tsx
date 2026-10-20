'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FastForward,
  SkipBack,
  SkipForward,
  BookmarkPlus,
  Repeat,
  Film,
  Music,
  Maximize2,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import {
  formatMsToTimestamp,
  msToFrame,
  frameToMs,
  getMediaAssetWebUrl,
} from '@/lib/clipping-studio/contracts';

export const MediaPlayerPreview: React.FC = () => {
  const {
    activeProject,
    selectedAssetId,
    currentTimeMs,
    setCurrentTimeMs,
    inPointMs,
    outPointMs,
    setInPoint,
    setOutPoint,
    isPlaying,
    setIsPlaying,
    playbackCommand,
    auditionRange,
    auditioningClipId,
    auditionRangeAction,
  } = useClippingStore();

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoopingSelection, setIsLoopingSelection] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  };

  const selectedAsset = activeProject?.mediaAssets.find((a) => a.id === selectedAssetId) || null;
  const fps = selectedAsset?.metadata?.fps || 30;
  const durationMs = selectedAsset?.metadata?.durationMs || 60000;
  const mediaUrl = selectedAsset ? getMediaAssetWebUrl(selectedAsset) : '';

  // Synchronize playhead when time changes externally (scrubbing / jumps)
  useEffect(() => {
    if (!mediaRef.current) return;
    const currentMediaSec = mediaRef.current.currentTime;
    const targetSec = currentTimeMs / 1000;
    if (Math.abs(currentMediaSec - targetSec) > 0.08) {
      mediaRef.current.currentTime = targetSec;
    }
  }, [currentTimeMs]);

  // Handle playback commands from store (audition clip, audition range, play, pause)
  useEffect(() => {
    if (!playbackCommand || !mediaRef.current) return;
    const { action, startMs } = playbackCommand;

    if (action === 'pause') {
      if (!mediaRef.current.paused) {
        mediaRef.current.pause();
      }
      setIsPlaying(false);
    } else if (action === 'play') {
      if (mediaRef.current.currentTime >= outPointMs / 1000) {
        mediaRef.current.currentTime = inPointMs / 1000;
        setCurrentTimeMs(inPointMs);
      }
      mediaRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[Player] Play failed:', err);
          setIsPlaying(false);
        });
    } else if (action === 'audition_clip' || action === 'audition_range') {
      const targetSec = (startMs ?? inPointMs) / 1000;
      mediaRef.current.currentTime = targetSec;
      setCurrentTimeMs(Math.round(targetSec * 1000));
      mediaRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[Player] Audition play failed:', err);
          setIsPlaying(false);
        });
    }
  }, [playbackCommand, inPointMs, outPointMs, setCurrentTimeMs, setIsPlaying]);

  // When media source changes and becomes playable, continue audition if active
  const handleCanPlay = () => {
    const state = useClippingStore.getState();
    if (state.isPlaying && mediaRef.current && mediaRef.current.paused) {
      mediaRef.current.currentTime = state.currentTimeMs / 1000;
      mediaRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[Player] canplay play failed:', err);
        });
    }
  };

  // Handle media timeupdate & audition range boundary check
  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const currentMs = Math.round(mediaRef.current.currentTime * 1000);
    setCurrentTimeMs(currentMs);

    const storeState = useClippingStore.getState();
    const currentAudition = storeState.auditionRange;

    // Boundary check for clip audition or range audition
    if (currentAudition) {
      if (currentMs >= currentAudition.endMs) {
        if (isLoopingSelection) {
          mediaRef.current.currentTime = currentAudition.startMs / 1000;
          setCurrentTimeMs(currentAudition.startMs);
        } else {
          mediaRef.current.pause();
          setIsPlaying(false);
          useClippingStore.setState({ auditioningClipId: null, auditionRange: null });
          mediaRef.current.currentTime = currentAudition.startMs / 1000;
          setCurrentTimeMs(currentAudition.startMs);
        }
        return;
      }
    } else if (isLoopingSelection && currentMs >= outPointMs) {
      mediaRef.current.currentTime = inPointMs / 1000;
      setCurrentTimeMs(inPointMs);
    }
  };

  const togglePlayPause = useCallback(() => {
    if (!mediaRef.current) return;
    if (mediaRef.current.paused) {
      // If at end or beyond out point, wrap to in point
      if (currentTimeMs >= outPointMs) {
        mediaRef.current.currentTime = inPointMs / 1000;
        setCurrentTimeMs(inPointMs);
      }
      mediaRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[Player] Play failed:', err);
          setIsPlaying(false);
        });
    } else {
      mediaRef.current.pause();
      setIsPlaying(false);
      useClippingStore.setState({ auditioningClipId: null, auditionRange: null });
    }
  }, [currentTimeMs, inPointMs, outPointMs, setCurrentTimeMs, setIsPlaying]);

  // Step 1 Frame
  const stepFrame = (deltaFrames: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.pause();
    setIsPlaying(false);
    useClippingStore.setState({ auditioningClipId: null, auditionRange: null });

    const currentFrame = msToFrame(currentTimeMs, fps);
    const newFrame = Math.max(0, currentFrame + deltaFrames);
    const newMs = frameToMs(newFrame, fps);

    mediaRef.current.currentTime = newMs / 1000;
    setCurrentTimeMs(newMs);
  };

  // Step Seconds
  const stepSeconds = (seconds: number) => {
    if (!mediaRef.current) return;
    const newMs = Math.max(0, Math.min(currentTimeMs + seconds * 1000, durationMs));
    mediaRef.current.currentTime = newMs / 1000;
    setCurrentTimeMs(newMs);
  };

  // Play In to Out selection with automatic stop at outPointMs
  const playSelection = () => {
    auditionRangeAction(inPointMs, outPointMs);
  };

  // Keyboard Shortcuts: Space, I, O
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setOutPoint();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, setInPoint, setOutPoint, fps, currentTimeMs]);

  if (!selectedAsset) {
    return (
      <div className="aspect-video w-full rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-500 flex items-center justify-center">
          <Film className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-zinc-300">No Media Source Selected</p>
        <p className="text-xs text-zinc-500 max-w-sm">
          Select or import a media file from the Media Library to preview and mark clips.
        </p>
      </div>
    );
  }

  const isVideo = selectedAsset.metadata.hasVideo;
  const currentFrameNum = msToFrame(currentTimeMs, fps);

  return (
    <div id="media-player-preview" ref={containerRef} className="rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden shadow-2xl flex flex-col">
      {/* Player Display (Click to Play/Pause) */}
      <div
        onClick={togglePlayPause}
        title={isPlaying ? 'Click to Pause [Space]' : 'Click to Play [Space]'}
        className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden cursor-pointer group select-none"
      >
        {isVideo ? (
          <video
            id="clipping-studio-player-media"
            ref={mediaRef as any}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            onCanPlay={handleCanPlay}
            onEnded={() => {
              setIsPlaying(false);
              useClippingStore.setState({ auditioningClipId: null, auditionRange: null });
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="w-full h-full object-contain pointer-events-none"
            playsInline
          />
        ) : (
          /* Audio visualizer placeholder */
          <div className="w-full h-full flex flex-col items-center justify-center space-y-3 bg-gradient-to-b from-zinc-900 to-black p-6 pointer-events-none">
            <audio
              id="clipping-studio-player-media"
              ref={mediaRef as any}
              src={mediaUrl}
              onTimeUpdate={handleTimeUpdate}
              onCanPlay={handleCanPlay}
              onEnded={() => {
                setIsPlaying(false);
                useClippingStore.setState({ auditioningClipId: null, auditionRange: null });
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                isPlaying
                  ? 'bg-amber-400 text-zinc-950 shadow-amber-400/30 scale-110 ring-4 ring-amber-400/20'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
              }`}
            >
              <Music className={`w-8 h-8 ${isPlaying ? 'animate-bounce' : ''}`} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-white truncate max-w-md">{selectedAsset.filename}</p>
              <div className="flex items-center justify-center space-x-2 text-xs text-zinc-400">
                <span>Audio Source ({selectedAsset.metadata.audioCodec})</span>
                {isPlaying && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>PLAYING</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hover Center Play/Pause Ripple Indicator */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/75 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl transition-transform group-hover:scale-105">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </div>
        </div>

        {/* Timecode Overlay Badge */}
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center space-x-2 font-mono text-xs pointer-events-none">
          <span className="text-amber-400 font-bold">{formatMsToTimestamp(currentTimeMs)}</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400 text-[11px]">Frame {currentFrameNum}</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400 text-[11px]">{Math.round(fps)} fps</span>
        </div>

        {/* In / Out Selection Marker Pill */}
        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono flex items-center space-x-2 pointer-events-none">
          <span className="text-emerald-400 font-semibold">[{formatMsToTimestamp(inPointMs, false)}]</span>
          <span className="text-zinc-500">→</span>
          <span className="text-rose-400 font-semibold">[{formatMsToTimestamp(outPointMs, false)}]</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-200 font-bold">
            {formatMsToTimestamp(Math.max(0, outPointMs - inPointMs), false)}
          </span>
        </div>
      </div>

      {/* Media Player Controls Toolbar */}
      <div className="p-3 bg-zinc-900 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Playback Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Jump to In */}
          <button
            type="button"
            onClick={() => {
              if (mediaRef.current) mediaRef.current.currentTime = inPointMs / 1000;
              setCurrentTimeMs(inPointMs);
            }}
            title="Jump to In Point"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* -5s Shuttle */}
          <button
            type="button"
            onClick={() => stepSeconds(-5)}
            title="Step back 5s"
            className="px-1.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-mono text-[10px]"
          >
            -5s
          </button>

          {/* -1 Frame */}
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            title="Step back 1 frame [←]"
            className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px]"
          >
            -1f
          </button>

          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlayPause}
            title="Play / Pause [Space]"
            className="p-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold shadow-md shadow-white/5 transition-all"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* +1 Frame */}
          <button
            type="button"
            onClick={() => stepFrame(1)}
            title="Step forward 1 frame [→]"
            className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px]"
          >
            +1f
          </button>

          {/* +5s Shuttle */}
          <button
            type="button"
            onClick={() => stepSeconds(5)}
            title="Step forward 5s"
            className="px-1.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-mono text-[10px]"
          >
            +5s
          </button>

          {/* Jump to Out */}
          <button
            type="button"
            onClick={() => {
              if (mediaRef.current) mediaRef.current.currentTime = outPointMs / 1000;
              setCurrentTimeMs(outPointMs);
            }}
            title="Jump to Out Point"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* In / Out Markers Setting */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setInPoint()}
            title="Set In Point at playhead [ I ]"
            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs transition-colors flex items-center space-x-1"
          >
            <span>Set [ In ]</span>
          </button>

          <button
            type="button"
            onClick={() => setOutPoint()}
            title="Set Out Point at playhead [ O ]"
            className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs transition-colors flex items-center space-x-1"
          >
            <span>Set [ Out ]</span>
          </button>

          <button
            type="button"
            onClick={playSelection}
            title="Audition In-to-Out selection"
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors"
          >
            Audition Range
          </button>

          <button
            type="button"
            onClick={() => setIsLoopingSelection(!isLoopingSelection)}
            title="Toggle Selection Loop"
            className={`p-1.5 rounded-lg border transition-colors ${
              isLoopingSelection
                ? 'bg-amber-400 text-zinc-950 border-amber-400 font-bold'
                : 'bg-zinc-800 border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed & Volume */}
        <div className="flex items-center space-x-2">
          {/* Speed Selector */}
          <select
            value={playbackRate}
            onChange={(e) => {
              const rate = parseFloat(e.target.value);
              setPlaybackRate(rate);
              if (mediaRef.current) mediaRef.current.playbackRate = rate;
            }}
            className="px-2 py-1 rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 text-xs focus:outline-none"
          >
            <option value="0.5">0.5x</option>
            <option value="1.0">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2.0">2.0x</option>
          </select>

          {/* Mute Toggle */}
          <button
            type="button"
            onClick={() => {
              if (!mediaRef.current) return;
              const nextMuted = !isMuted;
              mediaRef.current.muted = nextMuted;
              setIsMuted(nextMuted);
            }}
            title="Toggle Mute"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
