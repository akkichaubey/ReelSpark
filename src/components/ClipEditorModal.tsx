'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  Scissors,
  Play,
  Pause,
  RotateCcw,
  Download,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ClipCandidate, Project, TopicCategory } from '@/lib/types';
import { verifyCandidateContext } from '@/lib/context-verifier';
import { downloadSrtDirectly } from '@/lib/download-client';

interface ClipEditorModalProps {
  project: Project;
  candidate: ClipCandidate | null;
  onSave: (updatedCandidate: ClipCandidate) => void;
  onClose: () => void;
}

const TOPICS: TopicCategory[] = [
  'Motivation',
  'Philosophy',
  'Self-Respect',
  'Psychology',
  'Fear and Courage',
  'Meditation and Awareness',
  'Stories',
  'Other',
];

// Time formatting helpers
export function formatDetailedTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export function parseDetailedTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw numeric seconds (e.g. "12.5")
  if (!trimmed.includes(':')) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? null : Math.max(0, val);
  }

  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    return Math.max(0, h * 3600 + m * 60 + s);
  } else if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return Math.max(0, m * 60 + s);
  }
  return null;
}

export const ClipEditorModal: React.FC<ClipEditorModalProps> = ({
  project,
  candidate,
  onSave,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Initial candidate boundary snapshot for "Reset Trim"
  const initialStart = candidate?.start ?? 0;
  const initialEnd = candidate?.end ?? 30;

  // Metadata states
  const [title, setTitle] = useState(candidate?.titleEnglish || candidate?.title || '');
  const [titleHindi, setTitleHindi] = useState(candidate?.titleHindi || '');
  const [topic, setTopic] = useState<TopicCategory>(candidate?.topic || 'Motivation');

  // Boundary timestamps (in seconds)
  const [start, setStart] = useState<number>(initialStart);
  const [end, setEnd] = useState<number>(initialEnd);

  // String inputs for direct typing (e.g. 00:00:10.000)
  const [startInput, setStartInput] = useState<string>(formatDetailedTime(initialStart));
  const [endInput, setEndInput] = useState<string>(formatDetailedTime(initialEnd));

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(initialStart);
  const [isMuted, setIsMuted] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');

  // Timeline view range: 'focus' (±25s around clip) or 'full' (entire video)
  const [timelineZoom, setTimelineZoom] = useState<'focus' | 'full'>('focus');

  // Filmstrip thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // Dragging interaction state
  const [draggingMode, setDraggingMode] = useState<'start' | 'end' | 'middle' | null>(null);
  const dragContextRef = useRef<{
    startX: number;
    initialStart: number;
    initialEnd: number;
    rectWidth: number;
  }>({ startX: 0, initialStart: 0, initialEnd: 0, rectWidth: 0 });

  // Total source duration
  const totalDuration = Math.max(
    60,
    project.videoMetadata?.duration || project.timelineCoverage?.totalSeconds || 7200
  );

  // Calculate timeline window
  const windowPadding = 25;
  const viewStart = timelineZoom === 'full' ? 0 : Math.max(0, start - windowPadding);
  const viewEnd =
    timelineZoom === 'full'
      ? totalDuration
      : Math.min(totalDuration, Math.max(viewStart + 40, end + windowPadding));
  const viewSpan = Math.max(1, viewEnd - viewStart);

  // Derived duration & validation limits
  const duration = Math.max(0, end - start);
  const isTooLong = duration > 60;
  const isTooShort = duration < 3;
  const isValidDuration = !isTooLong && !isTooShort;

  // Real-time context verification
  const verification = verifyCandidateContext(
    start,
    end,
    candidate?.transcript || '',
    project.transcript,
    60
  );

  // Video source determination
  const relativeVideoPath =
    candidate?.renderStatus === 'completed' && candidate?.renderedVideoPath
      ? candidate.renderedVideoPath.split('storage/')[1] ||
        candidate.renderedVideoPath.split('storage\\')[1]
      : project.localVideoPath?.split('storage/')[1] ||
        project.localVideoPath?.split('storage\\')[1];

  const videoSrc = relativeVideoPath ? `/api/files/${relativeVideoPath}` : null;

  // Synchronize string inputs when numeric bounds update
  const updateStart = useCallback((newStart: number) => {
    const clamped = Math.max(0, Math.min(end - 3, Math.round(newStart * 100) / 100));
    setStart(clamped);
    setStartInput(formatDetailedTime(clamped));
  }, [end]);

  const updateEnd = useCallback((newEnd: number) => {
    const clamped = Math.min(
      totalDuration,
      Math.max(start + 3, Math.round(newEnd * 100) / 100)
    );
    setEnd(clamped);
    setEndInput(formatDetailedTime(clamped));
  }, [start, totalDuration]);

  // Steppers (frame accurate 1f ≈ 0.04s, 0.1s, 0.5s, 1s)
  const nudgeStart = (deltaSec: number) => {
    const next = Math.max(0, Math.min(end - 3, Math.round((start + deltaSec) * 100) / 100));
    updateStart(next);
    if (videoRef.current) {
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    }
  };

  const nudgeEnd = (deltaSec: number) => {
    const next = Math.min(
      totalDuration,
      Math.max(start + 3, Math.round((end + deltaSec) * 100) / 100)
    );
    updateEnd(next);
    if (videoRef.current) {
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    }
  };

  // Set boundaries directly from playback position
  const handleSetStartToCurrent = () => {
    if (currentTime < end - 3) {
      updateStart(currentTime);
    }
  };

  const handleSetEndToCurrent = () => {
    if (currentTime > start + 3) {
      updateEnd(currentTime);
    }
  };

  const [syncedSegments, setSyncedSegments] = useState<
    Array<{ start: number; end: number; textHindi?: string; textEnglish?: string }>
  >((candidate as any)?.syncedSegments || []);

  // Dynamically sync clip audio & clause timestamps when modal opens
  useEffect(() => {
    if (!candidate || !project?.id) return;
    let active = true;
    const existing = (candidate as any)?.syncedSegments;
    if (Array.isArray(existing) && existing.length > 0) {
      setSyncedSegments(existing);
    }

    fetch(`/api/projects/${project.id}/clip-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clipId: candidate.id,
        start: candidate.start,
        end: candidate.end,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.success && Array.isArray(data.syncedSegments) && data.syncedSegments.length > 0) {
          setSyncedSegments(data.syncedSegments);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [candidate?.id, project?.id]);

  const resolveSubtitleAtTime = useCallback(
    (absOrRelTime: number) => {
      const isRenderedClip =
        candidate?.renderStatus === 'completed' && Boolean(candidate?.renderedVideoPath);
      const relTime = isRenderedClip ? absOrRelTime : absOrRelTime - start;
      const absTime = isRenderedClip ? start + absOrRelTime : absOrRelTime;

      if (syncedSegments.length > 0 && relTime >= 0 && relTime <= end - start + 0.5) {
        const seg = syncedSegments.find((s) => relTime >= s.start && relTime <= s.end);
        return seg ? seg.textHindi || seg.textEnglish || '' : '';
      }

      const activeSeg = project.transcript.find((s) => absTime >= s.start && absTime <= s.end);
      return activeSeg ? activeSeg.text : '';
    },
    [candidate?.renderStatus, candidate?.renderedVideoPath, start, end, syncedSegments, project.transcript]
  );

  // 60fps requestAnimationFrame subtitle & playhead sync while video is playing
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        const t = video.currentTime;
        setCurrentTime(t);
        setCurrentSubtitle(resolveSubtitleAtTime(t));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, resolveSubtitleAtTime]);

  // Pause video element before modal unmounts to prevent AbortError
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}
      }
    };
  }, []);

  // Video Time Update Listener
  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    setCurrentTime(t);

    // If Auditioning: loop or stop at trim end
    if (isAuditioning) {
      if (t >= end) {
        video.currentTime = start;
        video.play().catch(() => {});
      }
    }

    setCurrentSubtitle(resolveSubtitleAtTime(t));
  };

  // Playback Toggles
  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    setIsAuditioning(false);
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleAuditionTrim = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isAuditioning && isPlaying) {
      video.pause();
      setIsPlaying(false);
      setIsAuditioning(false);
    } else {
      video.currentTime = start;
      video.play().catch(() => {});
      setIsPlaying(true);
      setIsAuditioning(true);
    }
  };

  const handleResetTrim = () => {
    updateStart(initialStart);
    updateEnd(initialEnd);
    if (videoRef.current) {
      videoRef.current.currentTime = initialStart;
      setCurrentTime(initialStart);
    }
  };

  // Direct Time Inputs onBlur
  const handleStartInputCommit = () => {
    const parsed = parseDetailedTime(startInput);
    if (parsed !== null && parsed < end - 3) {
      updateStart(parsed);
      if (videoRef.current) {
        videoRef.current.currentTime = parsed;
        setCurrentTime(parsed);
      }
    } else {
      setStartInput(formatDetailedTime(start));
    }
  };

  const handleEndInputCommit = () => {
    const parsed = parseDetailedTime(endInput);
    if (parsed !== null && parsed > start + 3 && parsed <= totalDuration) {
      updateEnd(parsed);
      if (videoRef.current) {
        videoRef.current.currentTime = parsed;
        setCurrentTime(parsed);
      }
    } else {
      setEndInput(formatDetailedTime(end));
    }
  };

  // Extract Thumbnail Frames from Video File
  useEffect(() => {
    if (!videoSrc) return;
    let isMounted = true;

    const extractThumbnails = async () => {
      try {
        const offscreen = document.createElement('video');
        offscreen.src = videoSrc;
        offscreen.crossOrigin = 'anonymous';
        offscreen.muted = true;
        offscreen.playsInline = true;

        await new Promise<void>((resolve) => {
          offscreen.onloadedmetadata = () => resolve();
          offscreen.onerror = () => resolve();
          setTimeout(resolve, 2500); // Safety timeout
        });

        if (!isMounted || !offscreen.duration) {
          return;
        }

        const count = 12;
        const step = viewSpan / (count - 1);
        const canvas = document.createElement('canvas');
        canvas.width = 110;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const frames: string[] = [];
        for (let i = 0; i < count; i++) {
          if (!isMounted) return;
          const targetTime = Math.min(
            offscreen.duration,
            Math.max(0, viewStart + i * step)
          );

          await new Promise<void>((res) => {
            const onSeeked = () => {
              offscreen.removeEventListener('seeked', onSeeked);
              res();
            };
            offscreen.addEventListener('seeked', onSeeked);
            offscreen.currentTime = targetTime;
            setTimeout(res, 350); // Timeout fallback
          });

          ctx.drawImage(offscreen, 0, 0, 110, 64);
          frames.push(canvas.toDataURL('image/jpeg', 0.5));
        }

        if (isMounted) {
          setThumbnails(frames);
        }
      } catch {
        // Handled with graceful filmstrip fallback
      }
    };

    extractThumbnails();

    return () => {
      isMounted = false;
    };
  }, [videoSrc, viewStart, viewSpan]);

  // Pointer Event Dragging on Timeline (Start Handle, End Handle, and Middle Box)
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: 'start' | 'end' | 'middle'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const timeline = timelineRef.current;
    if (!timeline) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingMode(mode);
    dragContextRef.current = {
      startX: e.clientX,
      initialStart: start,
      initialEnd: end,
      rectWidth: timeline.getBoundingClientRect().width,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingMode) return;
    const { startX, initialStart, initialEnd, rectWidth } = dragContextRef.current;
    if (rectWidth <= 0) return;

    const deltaX = e.clientX - startX;
    const deltaSec = (deltaX / rectWidth) * viewSpan;

    if (draggingMode === 'start') {
      const nextStart = Math.max(
        0,
        Math.min(initialEnd - 3, Math.round((initialStart + deltaSec) * 100) / 100)
      );
      updateStart(nextStart);
      if (videoRef.current) {
        videoRef.current.currentTime = nextStart;
        setCurrentTime(nextStart);
      }
    } else if (draggingMode === 'end') {
      const nextEnd = Math.min(
        totalDuration,
        Math.max(initialStart + 3, Math.round((initialEnd + deltaSec) * 100) / 100)
      );
      updateEnd(nextEnd);
      if (videoRef.current) {
        videoRef.current.currentTime = nextEnd;
        setCurrentTime(nextEnd);
      }
    } else if (draggingMode === 'middle') {
      const clipLength = initialEnd - initialStart;
      let targetStart = initialStart + deltaSec;
      let targetEnd = targetStart + clipLength;

      if (targetStart < 0) {
        targetStart = 0;
        targetEnd = targetStart + clipLength;
      }
      if (targetEnd > totalDuration) {
        targetEnd = totalDuration;
        targetStart = targetEnd - clipLength;
      }

      const cleanStart = Math.round(targetStart * 100) / 100;
      const cleanEnd = Math.round(targetEnd * 100) / 100;
      updateStart(cleanStart);
      updateEnd(cleanEnd);

      if (videoRef.current) {
        videoRef.current.currentTime = cleanStart;
        setCurrentTime(cleanStart);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingMode) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture release edge case
      }
      setDraggingMode(null);
    }
  };

  // Direct Click on Timeline to Seek Playhead
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const timeline = timelineRef.current;
    if (!timeline || draggingMode) return;

    const rect = timeline.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = viewStart + pct * viewSpan;

    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  // Save changes
  const handleSave = () => {
    if (!candidate || !isValidDuration) return;

    const newStart = Math.round(start * 100) / 100;
    const newEnd = Math.round(end * 100) / 100;
    const boundsChanged =
      Math.abs(newStart - candidate.start) > 0.05 || Math.abs(newEnd - candidate.end) > 0.05;

    const updated: ClipCandidate = {
      ...candidate,
      title: title.trim() || candidate.title,
      titleEnglish: title.trim() || candidate.title,
      titleHindi: titleHindi.trim() || candidate.titleHindi,
      topic,
      start: newStart,
      end: newEnd,
      duration: Math.round(duration * 100) / 100,
      contextVerification: verification,
      renderStatus: 'idle', // Mark for fresh FFmpeg rendering
      ...(boundsChanged ? { syncedSegments: undefined } : {}),
    } as any;

    if (boundsChanged && project?.id) {
      fetch(`/api/projects/${project.id}/clip-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: candidate.id,
          start: newStart,
          end: newEnd,
        }),
      }).catch(() => {});
    }

    onSave(updated);
    onClose();
  };

  if (!candidate) return null;

  // Calculate percentages for CSS positioning
  const startPct = Math.max(0, Math.min(100, ((start - viewStart) / viewSpan) * 100));
  const endPct = Math.max(0, Math.min(100, ((end - viewStart) / viewSpan) * 100));
  const selectionWidthPct = Math.max(0, endPct - startPct);
  const playheadPct = Math.max(
    0,
    Math.min(100, ((currentTime - viewStart) / viewSpan) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[94vh] bg-zinc-950/95 text-white">
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Edit Clip & Video Trimming
              </h3>
              <p className="text-[11px] text-zinc-400">
                Visual timeline trimming & frame-precise boundaries (CapCut / VN Editor)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/10 transition-colors"
            title="Close editor (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Titles & Topic Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                English Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Nature of Truth"
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                Hindi Title (हिंदी शीर्षक)
              </label>
              <input
                type="text"
                value={titleHindi}
                onChange={(e) => setTitleHindi(e.target.value)}
                placeholder="उदा. सत्य का स्वरूप"
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-400 mb-1">
                Topic Category
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as TopicCategory)}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400 transition-colors"
              >
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. Video Preview Player with Synchronized Subtitles */}
          <div className="relative rounded-2xl bg-black border border-white/10 overflow-hidden shadow-2xl flex flex-col items-center justify-center max-h-[320px] aspect-video w-full mx-auto group">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                muted={isMuted}
                onTimeUpdate={handleVideoTimeUpdate}
                onEnded={() => {
                  setIsPlaying(false);
                  setIsAuditioning(false);
                }}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="text-center p-8 text-zinc-400">
                <Scissors className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm font-semibold">Video preview stream unavailable</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Ensure source video file is uploaded to preview frames.
                </p>
              </div>
            )}

            {/* Subtitle Overlay */}
            {currentSubtitle && (
              <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none z-20">
                <span className="inline-block px-3.5 py-1 rounded-lg bg-black/85 text-white font-bold text-sm sm:text-base border border-white/15 shadow-2xl backdrop-blur-sm">
                  {currentSubtitle}
                </span>
              </div>
            )}

            {/* Quick Play/Pause Center Button on Hover */}
            <button
              type="button"
              onClick={handleTogglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
            >
              <div className="p-3.5 rounded-full bg-white/90 text-zinc-950 shadow-2xl hover:scale-110 transition-transform">
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </div>
            </button>

            {/* Mute Button in Corner */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/10 transition-colors z-20"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-white" />}
            </button>
          </div>

          {/* 2. Playback & In/Out Quick Capture Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-zinc-900/90 border border-white/10 text-xs">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={handleAuditionTrim}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer ${
                  isAuditioning
                    ? 'bg-amber-400 text-zinc-950 border-amber-300 font-bold shadow-md'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
                }`}
                title="Preview only the selected trim range (loops between In and Out points)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAuditioning ? 'Auditioning Clip...' : 'Audition Trim'}</span>
              </button>
            </div>

            {/* Quick Set Start / Set End Buttons */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSetStartToCurrent}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors cursor-pointer"
                title="Set Start point (In) to current playback position"
              >
                <span>[ Set Start</span>
              </button>

              <button
                type="button"
                onClick={handleSetEndToCurrent}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors cursor-pointer"
                title="Set End point (Out) to current playback position"
              >
                <span>Set End ]</span>
              </button>

              <button
                type="button"
                onClick={handleResetTrim}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/10 transition-colors"
                title="Reset Trim to initial candidate bounds"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Current Position Display */}
            <div className="font-mono text-zinc-400 text-[11px] flex items-center space-x-1">
              <span>Pos:</span>
              <span className="font-bold text-white">{formatDetailedTime(currentTime)}</span>
            </div>
          </div>

          {/* 3. Interactive CapCut / VN Horizontal Timeline Trimming Track */}
          <div className="space-y-2 p-4 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-inner">
            <div className="flex items-center justify-between text-xs pb-1">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-bold text-white tracking-tight">Interactive Trim Filmstrip</span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  ({timelineZoom === 'focus' ? 'Focused ±25s' : 'Full Video View'})
                </span>
              </div>

              {/* Zoom Switcher */}
              <div className="flex items-center space-x-1 bg-zinc-950 p-0.5 rounded-lg border border-white/10 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTimelineZoom('focus')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    timelineZoom === 'focus'
                      ? 'bg-amber-400 text-zinc-950 font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Focus ±25 seconds around the clip for high precision dragging"
                >
                  Clip Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineZoom('full')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    timelineZoom === 'full'
                      ? 'bg-amber-400 text-zinc-950 font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="View full speech video timeline"
                >
                  Full Video
                </button>
              </div>
            </div>

            {/* Time Ruler Markers */}
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1 select-none">
              <span>{formatDetailedTime(viewStart)}</span>
              <span>{formatDetailedTime(viewStart + viewSpan * 0.25)}</span>
              <span>{formatDetailedTime(viewStart + viewSpan * 0.5)}</span>
              <span>{formatDetailedTime(viewStart + viewSpan * 0.75)}</span>
              <span>{formatDetailedTime(viewEnd)}</span>
            </div>

            {/* The Main Filmstrip Trimming Track */}
            <div
              ref={timelineRef}
              onClick={handleTimelineClick}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative w-full h-[74px] rounded-xl bg-zinc-950 border border-white/15 overflow-hidden select-none cursor-pointer group shadow-2xl"
            >
              {/* Thumbnail Strip Background */}
              <div className="absolute inset-0 flex items-stretch pointer-events-none">
                {thumbnails.length > 0 ? (
                  thumbnails.map((thumb, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-full border-r border-black/40 overflow-hidden relative bg-zinc-900"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={`frame-${idx}`}
                        className="w-full h-full object-cover opacity-85"
                      />
                    </div>
                  ))
                ) : (
                  // Elegant Fallback filmstrip while capturing or if synthetic
                  Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-full border-r border-white/5 bg-gradient-to-b from-zinc-800/80 via-zinc-900 to-zinc-950 flex flex-col justify-between p-1 opacity-70"
                    >
                      <div className="flex justify-between">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      </div>
                      <span className="text-[9px] font-mono text-zinc-600 text-center">
                        frame-{idx + 1}
                      </span>
                      <div className="flex justify-between">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Dimmed Left Mask (Excluded portion before Start) */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/80 backdrop-blur-[1px] pointer-events-none z-10 border-r border-amber-400/50"
                style={{ width: `${startPct}%` }}
              />

              {/* Dimmed Right Mask (Excluded portion after End) */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/80 backdrop-blur-[1px] pointer-events-none z-10 border-l border-amber-400/50"
                style={{ left: `${endPct}%` }}
              />

              {/* Active Selection Box (Middle draggable area) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'middle')}
                className="absolute top-0 bottom-0 border-y-2 border-amber-400 bg-amber-400/10 cursor-grab active:cursor-grabbing z-20 transition-colors hover:bg-amber-400/20 shadow-lg shadow-amber-500/10"
                style={{ left: `${startPct}%`, width: `${selectionWidthPct}%` }}
                title="Drag to slide the entire clip window"
              >
                {/* Duration Floating Badge */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-amber-400 text-zinc-950 font-mono font-bold text-[10px] shadow-md pointer-events-none whitespace-nowrap">
                  Selected: {duration.toFixed(1)}s
                </div>
              </div>

              {/* Start Handle (Left Boundary Bracket) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'start')}
                className="absolute top-0 bottom-0 w-5 rounded-l-lg bg-amber-400 text-zinc-950 flex flex-col items-center justify-center cursor-ew-resize hover:bg-amber-300 z-30 shadow-2xl active:scale-105 transition-transform"
                style={{ left: `calc(${startPct}% - 12px)` }}
                title="Drag Start Handle to adjust in-point"
              >
                <span className="text-[12px] font-black select-none leading-none">[</span>
                <div className="w-0.5 h-4 bg-zinc-950/70 rounded-full my-0.5" />
                <span className="text-[9px] font-bold select-none leading-none">IN</span>

                {/* Tooltip on Handle */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-zinc-950 text-amber-300 font-mono font-bold text-[9px] border border-amber-400/40 shadow-lg pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatDetailedTime(start)}
                </div>
              </div>

              {/* End Handle (Right Boundary Bracket) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'end')}
                className="absolute top-0 bottom-0 w-5 rounded-r-lg bg-amber-400 text-zinc-950 flex flex-col items-center justify-center cursor-ew-resize hover:bg-amber-300 z-30 shadow-2xl active:scale-105 transition-transform"
                style={{ left: `calc(${endPct}% - 8px)` }}
                title="Drag End Handle to adjust out-point"
              >
                <span className="text-[12px] font-black select-none leading-none">]</span>
                <div className="w-0.5 h-4 bg-zinc-950/70 rounded-full my-0.5" />
                <span className="text-[9px] font-bold select-none leading-none">OUT</span>

                {/* Tooltip on Handle */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-zinc-950 text-amber-300 font-mono font-bold text-[9px] border border-amber-400/40 shadow-lg pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatDetailedTime(end)}
                </div>
              </div>

              {/* Playhead Scrubber Line */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40 transition-transform"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="w-0.5 h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" />
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1 -mt-1 shadow-lg" />
              </div>
            </div>
          </div>

          {/* 4. Precise Timestamp Numeric Inputs & Sub-second / Frame Steppers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Start (In-Point) Precision Card */}
            <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase text-amber-400 tracking-wider">
                  Start (In-Point)
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">{start.toFixed(2)}s</span>
              </div>

              <input
                type="text"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={handleStartInputCommit}
                onKeyDown={(e) => e.key === 'Enter' && handleStartInputCommit()}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-400"
                placeholder="00:00:00.000"
              />

              {/* Nudge Buttons */}
              <div className="flex items-center justify-between pt-1 gap-1">
                <button
                  type="button"
                  onClick={() => nudgeStart(-1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move start point back 1 second"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeStart(-0.1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move start point back 0.1s"
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeStart(-0.04)}
                  className="px-1.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-amber-300"
                  title="Move start point back 1 frame (0.04s)"
                >
                  -1f
                </button>
                <button
                  type="button"
                  onClick={() => nudgeStart(0.04)}
                  className="px-1.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-amber-300"
                  title="Move start point forward 1 frame (0.04s)"
                >
                  +1f
                </button>
                <button
                  type="button"
                  onClick={() => nudgeStart(0.1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move start point forward 0.1s"
                >
                  +0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeStart(1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move start point forward 1 second"
                >
                  +1s
                </button>
              </div>
            </div>

            {/* End (Out-Point) Precision Card */}
            <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase text-amber-400 tracking-wider">
                  End (Out-Point)
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">{end.toFixed(2)}s</span>
              </div>

              <input
                type="text"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={handleEndInputCommit}
                onKeyDown={(e) => e.key === 'Enter' && handleEndInputCommit()}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-400"
                placeholder="00:00:00.000"
              />

              {/* Nudge Buttons */}
              <div className="flex items-center justify-between pt-1 gap-1">
                <button
                  type="button"
                  onClick={() => nudgeEnd(-1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move end point back 1 second"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeEnd(-0.1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move end point back 0.1s"
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeEnd(-0.04)}
                  className="px-1.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-amber-300"
                  title="Move end point back 1 frame (0.04s)"
                >
                  -1f
                </button>
                <button
                  type="button"
                  onClick={() => nudgeEnd(0.04)}
                  className="px-1.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-amber-300"
                  title="Move end point forward 1 frame (0.04s)"
                >
                  +1f
                </button>
                <button
                  type="button"
                  onClick={() => nudgeEnd(0.1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move end point forward 0.1s"
                >
                  +0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeEnd(1)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300"
                  title="Move end point forward 1 second"
                >
                  +1s
                </button>
              </div>
            </div>

            {/* Selected Duration & Validity Gauge Card */}
            <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/10 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase text-zinc-400 tracking-wider">
                    Selected Duration
                  </label>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Orig: {(initialEnd - initialStart).toFixed(1)}s
                  </span>
                </div>
                <div className="font-mono text-lg font-black text-white mt-1">
                  {formatDetailedTime(duration)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">
                    ({duration.toFixed(1)}s)
                  </span>
                </div>
              </div>

              <div
                className={`p-2 rounded-lg text-xs font-semibold flex items-center justify-between border ${
                  isTooLong
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : isTooShort
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <span>
                  {isTooLong
                    ? 'Exceeds 60s limit!'
                    : isTooShort
                    ? 'Min duration is 3s'
                    : 'Valid Duration'}
                </span>
                <span className="text-[10px] font-mono">
                  {isTooLong ? '> 60s' : isTooShort ? '< 3s' : '≤ 60s'}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Live AI Context Verification & Completeness Check */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-white/10 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Live AI Context Verification</span>
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {verification.contextConfidence}% Confidence
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">{verification.notes}</p>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3">
          {/* Download SRT Button */}
          <button
            type="button"
            onClick={() =>
              downloadSrtDirectly(project.transcript, start, end, title || candidate.title)
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 border border-amber-500/20 text-xs font-medium transition-colors"
            title="Download SRT subtitle file for this exact custom trimmed range"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Trim SRT</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isValidDuration}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-zinc-950 font-bold text-xs shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Apply Trim & Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
