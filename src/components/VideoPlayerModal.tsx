'use client';

import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Download, Scissors, Repeat, Award } from 'lucide-react';
import { ClipCandidate, Project } from '@/lib/types';
import { getBilingualCandidateData } from '@/lib/bilingual';

interface VideoPlayerModalProps {
  project: Project;
  candidate: ClipCandidate | null;
  onClose: () => void;
  onEdit?: (candidate: ClipCandidate) => void;
  onRenderClip?: (clipId: string) => void;
  onDownloadSrt?: (candidate: ClipCandidate) => void;
  isRendering?: boolean;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  project,
  candidate,
  onClose,
  onEdit,
  onRenderClip,
  onDownloadSrt,
  isRendering,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopClip, setLoopClip] = useState(true);
  const [playerLang, setPlayerLang] = useState<'en' | 'hi'>('en');
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');

  // Determine video source URL
  const isRendered = candidate ? (candidate.renderStatus === 'completed' && !!candidate.renderedVideoPath) : false;
  const relativeVideoPath = candidate
    ? (isRendered
        ? candidate.renderedVideoPath?.split('storage/')[1] || candidate.renderedVideoPath?.split('storage\\')[1]
        : project.localVideoPath?.split('storage/')[1] || project.localVideoPath?.split('storage\\')[1])
    : null;

  const videoSrc = relativeVideoPath ? `/api/files/${relativeVideoPath}` : null;
  const renderedDownloadUrl = candidate?.renderedVideoPath
    ? `/api/files/${candidate.renderedVideoPath.split('storage/')[1] || candidate.renderedVideoPath.split('storage\\')[1]}`
    : null;

  // Boundaries
  const clipStart = candidate ? (isRendered ? 0 : candidate.start) : 0;
  const clipEnd = candidate ? (isRendered ? candidate.duration : candidate.end) : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !candidate) return;

    const handleLoadedMetadata = () => {
      video.currentTime = clipStart;
      video.playbackRate = playbackRate;
      video.play().catch(() => {});
      setIsPlaying(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Loop or stop at clip boundary
      if (video.currentTime >= clipEnd) {
        if (loopClip) {
          video.currentTime = clipStart;
          video.play().catch(() => {});
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }

      // Update subtitle overlay
      const absoluteSec = isRendered ? candidate.start + video.currentTime : video.currentTime;
      const activeSeg = project.transcript.find(
        (s) => absoluteSec >= s.start && absoluteSec <= s.end
      );
      setCurrentSubtitle(activeSeg ? activeSeg.text : '');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [clipStart, clipEnd, isRendered, candidate, project.transcript, loopClip, playbackRate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!candidate) return null;

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const seekTime = parseFloat(e.target.value);
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const restartClip = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clipStart;
    video.play();
    setIsPlaying(true);
  };

  const changeSpeed = () => {
    const nextRate = playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const bData = getBilingualCandidateData(candidate, playerLang);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Pinned Top-Right Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/10 transition-all z-30 shadow-lg flex items-center justify-center cursor-pointer group"
          title="Close Player (Esc)"
          aria-label="Close Player"
        >
          <X className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>

        {/* Header with Title and Quick Actions */}
        <div className="p-4 pr-16 sm:pr-20 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 max-w-lg">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-200 font-semibold border border-white/10">
                {candidate.topic}
              </span>
              <span className="flex items-center space-x-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/40">
                <Award className="w-3 h-3 text-amber-400" />
                <span>Score: {candidate.scores.total}/100</span>
              </span>

              {/* Bilingual Toggle */}
              <div className="flex items-center p-0.5 rounded-lg bg-zinc-950 border border-white/10 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPlayerLang('en')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    playerLang === 'en'
                      ? 'bg-white text-zinc-950 font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerLang('hi')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    playerLang === 'hi'
                      ? 'bg-white text-zinc-950 font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  हिंदी
                </button>
              </div>

              {candidate.contextVerification.flaggedForReview ? (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md uppercase bg-amber-950/60 text-amber-400 border border-amber-800/50">
                  CONTEXT: REVIEW SUGGESTED
                </span>
              ) : (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                  CONTEXT: HIGH CONFIDENCE
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">{bData.title}</h3>
            <p className="text-xs text-zinc-400">
              {isRendered ? 'Rendered MP4 Reel' : 'Source Clip Preview'}: {formatSec(candidate.start)} → {formatSec(candidate.end)} ({candidate.duration.toFixed(1)}s)
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Edit Clip Button */}
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(candidate);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-white/10 transition-colors"
                title="Edit clip boundaries and title"
              >
                <Scissors className="w-3.5 h-3.5 text-zinc-300" />
                <span>Edit Clip</span>
              </button>
            )}

            {/* Download MP4 Button */}
            {isRendered && renderedDownloadUrl ? (
              <a
                href={renderedDownloadUrl}
                download={`${candidate.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs shadow-md shadow-white/5 transition-all hover:scale-[1.02]"
                title="Download MP4 video file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download MP4</span>
              </a>
            ) : onRenderClip ? (
              <button
                type="button"
                onClick={() => onRenderClip(candidate.id)}
                disabled={isRendering}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-xs shadow-md shadow-white/5 transition-all"
                title="Render and download MP4"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isRendering ? 'Rendering...' : 'Download MP4'}</span>
              </button>
            ) : null}

            {/* Download SRT Button */}
            {onDownloadSrt && (
              <button
                type="button"
                onClick={() => onDownloadSrt(candidate)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 border border-amber-500/20 font-medium text-xs transition-colors"
                title="Download synchronized SRT subtitle file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>SRT</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Canvas & Subtitles Overlay */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[360px] max-h-[550px] overflow-hidden">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              playsInline
              muted={isMuted}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="text-center p-8 text-zinc-400">
              <p>Source video stream unavailable.</p>
              <p className="text-xs mt-1 text-zinc-500">Upload authorized video file to preview.</p>
            </div>
          )}

          {/* Synchronized Subtitle Overlay */}
          {currentSubtitle && (
            <div className="absolute bottom-6 left-4 right-4 text-center pointer-events-none">
              <span className="inline-block px-4 py-1.5 rounded-lg bg-black/85 text-white font-bold text-base sm:text-lg border border-white/10 shadow-2xl tracking-wide backdrop-blur-sm">
                {currentSubtitle}
              </span>
            </div>
          )}
        </div>

        {/* Player Controls Bar */}
        <div className="p-4 bg-zinc-900/95 border-t border-white/10 space-y-3">
          {/* Progress Scrubber */}
          <div className="flex items-center space-x-3 text-xs font-mono text-zinc-400">
            <span>{formatSec(currentTime)}</span>
            <input
              type="range"
              min={clipStart}
              max={clipEnd}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-white cursor-pointer"
            />
            <span>{formatSec(clipEnd)}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="p-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 transition-all shadow-md active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              {/* Restart */}
              <button
                onClick={restartClip}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                title="Restart Clip"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Mute / Unmute */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Loop Toggle */}
              <button
                onClick={() => setLoopClip(!loopClip)}
                className={`p-2 rounded-xl border transition-colors ${
                  loopClip
                    ? 'bg-white text-zinc-950 border-white font-semibold'
                    : 'bg-zinc-800 text-zinc-400 border-white/5 hover:text-white'
                }`}
                title={loopClip ? 'Looping Enabled' : 'Looping Disabled'}
              >
                <Repeat className="w-4 h-4" />
              </button>

              {/* Speed Toggle */}
              <button
                onClick={changeSpeed}
                className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-semibold transition-colors"
                title="Change playback speed"
              >
                {playbackRate}x
              </button>
            </div>

            <div className="flex items-center space-x-3 text-xs text-zinc-400">
              <span>
                Score: <span className="font-bold text-white">{candidate.scores.total}</span>/100
              </span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">
                {candidate.contextVerification.contextConfidence}% Context Confidence
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
