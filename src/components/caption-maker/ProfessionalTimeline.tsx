"use client";

import { DialogSurface, DialogTitle } from '@/components/ui/dialog';
import { createPortal } from 'react-dom';
import { ThumbnailCoverControls } from './ThumbnailCover';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { naturalTransitionKinds, naturalTransitionNames, type NaturalTransitionKind } from '@/lib/auto-cut/natural-transitions';
import { setNaturalTimelineBoundary } from '@/lib/timeline/natural-transitions';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import {
  Play,
  Plus,
  Pause,
  Scissors,
  Copy,
  CopyPlus,
  Clipboard,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Undo2,
  Redo2,
  Magnet,
  Flag,
  Film,
  Type,
  Link,
  Unlink,
  GripVertical,
  Settings2,
  MousePointer2,
  Upload,
  Loader2,
  Sparkles,
  Download,
  Image as ImageIcon,
} from "lucide-react";
import type { CaptionProject, ImageAsset, AudioAsset } from "@/lib/caption-maker/types";
import { uploadFileWithProgress, UploadCancelledError } from "@/lib/upload-with-progress";
import { CaptionTimeline } from "./CaptionTimeline";
import { TimelineMediaPicker } from "./TimelineMediaPicker";
import { hoverSeekTime } from "@/lib/timeline/pointer";
import { AudioClipControls } from './AudioClipControls';
import { detachTimelineAudio, resyncDetachedAudio, audioGain, audioTrack } from '@/lib/timeline/audio';
import { AudioClipInspector } from './AudioClipInspector';
import { TimelineCaptionWords } from './TimelineCaptionWords';
import { ClipMotionInspector } from './ClipMotionInspector';
import type { ClipMotion } from '@/lib/timeline/motion';
import { captionClipGroups } from '@/lib/timeline/caption-edits';
import { VideoThumbnailStrip } from './VideoThumbnailStrip';
import { HoverFramePreview, type HoverFrame } from './HoverFramePreview';
import { clipSourceTime } from '@/lib/timeline/thumbnails';
import { rippleTrim, rollEdit, slipEdit, slideEdit, rippleDelete, removeTimelineGaps, duplicateTimelineClips, type TimelineEditMode } from '@/lib/timeline/advanced-edits';
import {
  commitTimeline,
  compatibleAsset,
  createTimelineClip,
  createTimelineTrack,
  deleteTimelineClips,
  deleteTimelineTrack,
  frameTime,
  groupTimelineClips,
  linkedSelection,
  makeTimelineId,
  moveTimelineClips,
  pasteTimelineClips,
  projectTimelineAssets,
  snapTimelineTime,
  splitTimelineClips,
  timelineEnd,
  timelineFromProject,
  trimTimelineClip,
  type ReelTimeline,
  type TimelineAsset,
  type TimelineClip,
  type TrackKind,
  type TimelineTrack,
} from "@/lib/timeline/model";

type Preview = {
  sourceUrl?: string;
  peaks: number[];
  thumbnails: string[];
  durationMs: number;
  hasAudio?: boolean;
  thumbnailTimesMs?: number[];
};
const previewCache = new Map<string, Preview>();
const subscribeViewportHeight = (notify: () => void) => {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
};
const viewportHeightSnapshot = () => window.innerHeight;
const serverViewportHeight = () => 900;
const clock = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${((ms / 1000) % 60).toFixed(2).padStart(5, "0")}`;
const colors: Record<TrackKind, string> = {
  video: "border-sky-400/60 bg-sky-950",
  intro: "border-violet-400/60 bg-violet-950",
  overlay: "border-cyan-400/60 bg-cyan-950",
  audio: "border-emerald-400/60 bg-emerald-950",
  music: "border-teal-400/60 bg-teal-950",
  text: "border-orange-400/60 bg-orange-950",
  captions: "border-amber-400/60 bg-amber-950",
};

export function ProfessionalTimeline({
  project,
  currentTime,
  isPlaying,
  onSeek,
  onTogglePlay,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onEditCaptions,
  onRemoveMedia,
  onTrimChange,
  onOpenSmartEditor,
  onCaptionSourceChange,
  onAutoSyncCaptions,
  isSyncingCaptions = false,
  onCaptionEffects,
  thumbnailCoverUrl,
  thumbnailCoverError,
  onThumbnailCoverChange,
  onEditThumbnail,
  allowTimelineThumbnail = false,
  onOpenTrackPanel,
  trackSettingsTarget,
}: {
  project: CaptionProject;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onChange: (timeline: ReelTimeline) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onEditCaptions: () => void;
  onRemoveMedia?: (assetId: string) => void | Promise<void>;
  onTrimChange: (start: number, end: number) => void;
  onOpenSmartEditor: () => void;
  onCaptionSourceChange?: (assetId: string, groups: import('@/lib/caption-maker/types').CaptionGroup[]) => void;
  onAutoSyncCaptions?: () => void;
  isSyncingCaptions?: boolean;
  onCaptionEffects?: () => void;
  thumbnailCoverUrl?: string;
  thumbnailCoverError?: string;
  onThumbnailCoverChange?: (cover: NonNullable<CaptionProject['thumbnailCover']>) => void;
  onEditThumbnail?: () => void;
  allowTimelineThumbnail?: boolean;
  onOpenTrackPanel?: (kind: TrackKind) => void;
  trackSettingsTarget?: HTMLDivElement | null;
}) {
  const base = useMemo(() => timelineFromProject(project), [project]);
  const [draft, setDraft] = useState<ReelTimeline | null>(null);
  const timeline = draft || base;
  const [selected, setSelected] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<TimelineClip[]>([]);
  const [zoom, setZoom] = useState(40);
  const [snap, setSnap] = useState(true);
  const [editMode, setEditMode] = useState<TimelineEditMode>('move');
  const [hoverScrub, setHoverScrub] = useState(false);
  const playheadGrab = useRef<{ x: number; time: number } | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const hoverTarget = useRef<number | null>(null);
  const lastHoverFrame = useRef<number | null>(null);
  const cancelHover = () => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = null;
    hoverTarget.current = null;
    lastHoverFrame.current = null;
  };
  useEffect(
    () => () => {
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );
  const [height, setHeight] = useState(220);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const bgUploadInputRef = useRef<HTMLInputElement>(null);
  const [bgUploadTrackId, setBgUploadTrackId] = useState<string | null>(null);
  const directUploadAbort = useRef<AbortController | null>(null);
  const [isUploadingDirectMedia, setIsUploadingDirectMedia] = useState(false);
  const [directUploadProgress, setDirectUploadProgress] = useState<number | null>(null);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);

  useEffect(() => () => {
    directUploadAbort.current?.abort();
  }, []);
  const viewportHeight = useSyncExternalStore(subscribeViewportHeight, viewportHeightSnapshot, serverViewportHeight);
  const resizeGrab = useRef<{ pointerId:number; y:number; height:number } | null>(null);
  const [simple, setSimple] = useState(false);
  const [error, setError] = useState("");
  const [mediaTrackId, setMediaTrackId] = useState<string | null>(null);
  const [inspector, setInspector] = useState<TimelineClip | null>(null);
  const [motionClipboard, setMotionClipboard] = useState<ClipMotion | null>(null);
  const [trackEditor, setTrackEditor] = useState<{
    track: TimelineTrack;
    index: number;
  } | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [previewStatus, setPreviewStatus] = useState<Record<string, 'processing' | 'ready' | 'error'>>({});
  const [previewRetry, setPreviewRetry] = useState(0);
  const [thumbnailHover, setThumbnailHover] = useState<HoverFrame | null>(null);
  const thumbnailHoverRaf = useRef<number | null>(null);
  const thumbnailHoverPending = useRef<HoverFrame | null>(null);
  const clearThumbnailHover = () => {
    if (thumbnailHoverRaf.current !== null) cancelAnimationFrame(thumbnailHoverRaf.current);
    thumbnailHoverRaf.current = null; thumbnailHoverPending.current = null; setThumbnailHover(null);
  };
  const showThumbnailHover = (frame: HoverFrame) => {
    thumbnailHoverPending.current = frame;
    if (thumbnailHoverRaf.current !== null) return;
    thumbnailHoverRaf.current = requestAnimationFrame(() => { thumbnailHoverRaf.current = null; setThumbnailHover(thumbnailHoverPending.current); });
  };
  useEffect(() => () => {
    if (thumbnailHoverRaf.current !== null) cancelAnimationFrame(thumbnailHoverRaf.current);
    thumbnailHoverRaf.current = null; thumbnailHoverPending.current = null;
  }, []);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const audioGesture = useRef<{ base: ReelTimeline; next?: ReelTimeline } | null>(null);
  const drag = useRef<{
    id: string;
    ids: string[];
    x: number;
    y: number;
    edge?: "left" | "right";
    base: ReelTimeline;
    next?: ReelTimeline;
    error?: string;
    moved: boolean;
  } | null>(null);
  const selectedIds = useMemo(
    () => linkedSelection(timeline, selected),
    [timeline, selected],
  );
  const lockedCaptionAssets = useMemo(() => {
    const lockedTracks = new Set(timeline.tracks.filter(t => t.kind === 'captions' && t.locked).map(t => t.id));
    return new Set(timeline.clips.filter(c => lockedTracks.has(c.trackId)).map(c => c.assetId));
  }, [timeline.tracks, timeline.clips]);
  const waveforms = useMemo(
    () =>
      new Map(
        timeline.clips.map((clip) => {
          const stored = previews[clip.assetId || ""];
          const preview = stored?.sourceUrl === timeline.assets.find(a => a.id === clip.assetId)?.fileUrl ? stored : undefined;
          const points = preview?.peaks.length
            ? Array.from({ length: 200 }, (_, i) => {
                const source =
                  (clip.sourceStartMs + (clip.durationMs * i) / 200) %
                  (preview.durationMs || 1);
                const peak =
                  preview.peaks[
                    Math.min(
                      preview.peaks.length - 1,
                      Math.floor(
                        (source / (preview.durationMs || 1)) *
                          preview.peaks.length,
                      ),
                    )
                  ] || 0;
                return `M${i},${20 - peak * 19}v${Math.max(1, peak * 38)}h1V${20 - peak * 19}`;
              }).join(" ")
            : "";
          return [clip.id, points];
        }),
      ),
    [timeline.clips, timeline.assets, previews],
  );
  const [viewport, setViewport] = useState({ left: 0, width: 1600 });
  const trackEnds = useMemo(() => {
    const ends = new Map<string, number>();
    for (const clip of timeline.clips) {
      ends.set(clip.trackId, Math.max(ends.get(clip.trackId) || 0, clip.startMs + clip.durationMs));
    }
    return ends;
  }, [timeline.clips]);
  const duration = Math.max(10_000, timelineEnd(timeline) + 2000);
  const width = Math.max(600, (duration / 1000) * zoom, (timelineEnd(timeline) / 1000) * zoom + 64);
  const px = zoom / 1000;
  const run = (action: () => ReelTimeline) => {
    try {
      const next = commitTimeline(action());
      onChange(next);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to edit timeline");
      return false;
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const wanted = base.assets.filter(
      (a) =>
        a.mediaType !== "image" &&
        (a.fileUrl.startsWith("/api/files/") ||
          a.fileUrl.startsWith("/audio/bgm/")),
    );
    let stopped = false;
    void (async () => {
      await Promise.resolve();
      for (const asset of wanted) {
        if (stopped) break;
        try {
          setPreviewStatus(previous => ({ ...previous, [asset.id]: 'processing' }));
          let result = previewCache.get(asset.fileUrl);
          if (!result) {
            const response = await fetch(
              "/api/caption-maker/timeline-preview",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileUrl: asset.fileUrl }),
                signal: controller.signal,
              },
            );
            const body = await response.json();
            if (!response.ok) throw new Error('Preview generation failed');
            result = body;
            previewCache.set(asset.fileUrl, result!);
          }
          if (!stopped) {
            setPreviews((previous) => ({ ...previous, [asset.id]: { ...result!, sourceUrl: asset.fileUrl } }));
            setPreviewStatus(previous => ({ ...previous, [asset.id]: 'ready' }));
          }
        } catch {
          /* A missing preview never prevents editing the original media. */
          if (!stopped) setPreviewStatus(previous => ({ ...previous, [asset.id]: 'error' }));
        }
      }
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [base.assets, previewRetry]);
  const copy = () =>
    setClipboard(
      structuredClone(
        timeline.clips.filter((c) =>
          linkedSelection(timeline, selected).has(c.id),
        ),
      ),
    );
  const remove = () => run(() => deleteTimelineClips(timeline, selected));
  const split = () =>
    run(() =>
      splitTimelineClips(
        timeline,
        selected.length ? selected : timeline.clips.map((c) => c.id),
        currentTime * 1000,
      ),
    );
  const paste = () =>
    run(() => pasteTimelineClips(timeline, clipboard, currentTime * 1000));
  const timeAt = (clientX: number) =>
    Math.max(
      0,
      (clientX - (canvas.current?.getBoundingClientRect().left || 0)) / px,
    );
  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    clip: TimelineClip,
    edge?: "left" | "right",
  ) => {
    cancelHover();
    event.stopPropagation();
    if (event.button !== 0) return;
    const ids =
      event.ctrlKey || event.metaKey || event.shiftKey
        ? selected.includes(clip.id)
          ? selected.filter((id) => id !== clip.id)
          : [...selected, clip.id]
        : selected.includes(clip.id)
          ? selected
          : [clip.id];
    setSelected(ids);
    if (timeline.tracks.find((t) => t.id === clip.trackId)?.locked) {
      setError("Unlock this track to edit it.");
      return;
    }
    // Keep click/double-click targeting on the clip until a real drag starts.
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: clip.id,
      ids,
      x: event.clientX,
      y: event.clientY,
      edge,
      base: timeline,
      moved: false,
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    let delta = (event.clientX - state.x) / px;
    const distance = state.edge ? Math.abs(event.clientX - state.x) : Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (distance < 3 && !state.moved) return;
    if (!state.moved && scroll.current) {
      scroll.current.setPointerCapture(event.pointerId);
      scroll.current.focus({ preventScroll: true });
    }
    state.moved = true;
    const clip = state.base.clips.find((c) => c.id === state.id)!;
    const anchor =
      state.edge === "right" ? clip.startMs + clip.durationMs : clip.startMs;
    if (snap && editMode !== 'slip')
      delta =
        snapTimelineTime(
          state.base,
          anchor + delta,
          currentTime * 1000,
          linkedSelection(state.base, state.ids),
          8 / px,
        ) - anchor;
    try {
      if (editMode === 'slide' && !state.edge && linkedSelection(state.base, state.ids).size !== linkedSelection(state.base, [state.id]).size)
        throw new Error('Select one clip or linked group for Slide.');
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
      state.next = editMode === 'slip' && !state.edge
        ? slipEdit(state.base, state.ids, delta)
        : editMode === 'slide' && !state.edge
        ? slideEdit(state.base, state.id, delta)
        : editMode === 'ripple' && state.edge
        ? rippleTrim(state.base, state.id, state.edge, delta)
        : editMode === 'roll' && state.edge
        ? rollEdit(state.base, state.id, state.edge, delta)
        : state.edge
        ? trimTimelineClip(state.base, state.id, state.edge, delta)
        : moveTimelineClips(
            state.base,
            state.ids,
            delta,
            target ? { clipId: state.id, trackId: target } : undefined,
          );
      setDraft(state.next);
      state.error = undefined;
      setError("");
    } catch (e) {
      state.next = undefined;
      setDraft(state.base);
      // Show failed-drop feedback after release; inserting a banner mid-drag
      // shifts track geometry underneath the captured pointer.
      state.error = e instanceof Error ? e.message : 'Invalid move';
    }
  };
  const hoverSeek = (event: PointerEvent<HTMLDivElement>) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const time = hoverSeekTime({
      enabled: hoverScrub,
      playing: isPlaying,
      dragging: Boolean(drag.current),
      pointerType: event.pointerType,
      buttons: event.buttons,
      clientX: event.clientX,
      canvasLeft: rect.left,
      pixelsPerSecond: zoom,
      durationMs: timelineEnd(timeline),
      fps: timeline.fps,
    });
    if (time === null || time === lastHoverFrame.current) return;
    hoverTarget.current = time;
    if (hoverFrame.current !== null) return;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = null;
      const next = hoverTarget.current;
      if (next !== null) {
        lastHoverFrame.current = next;
        onSeek(next);
      }
    });
  };
  const finish = () => {
    const state = drag.current;
    drag.current = null;
    setDraft(null);
    if (state?.moved && state.error) setError(state.error);
    else if (state?.moved && state.next) run(() => state.next!);
  };
  const addAsset = (
    trackId: string,
    assetId?: string,
    start = currentTime * 1000,
  ) =>
    run(() => {
      const all = projectTimelineAssets(project).map((asset) =>
        previews[asset.id]?.sourceUrl === asset.fileUrl
          ? { ...asset, hasAudio: previews[asset.id].hasAudio }
          : asset,
      );
      const track = timeline.tracks.find((t) => t.id === trackId)!;
      if (track.locked) throw new Error("Unlock this track first.");
      const asset = all.find((a) => a.id === assetId);
      if (
        track.kind !== "text" &&
        (!asset || !compatibleAsset(track.kind, asset))
      )
        throw new Error("Choose compatible media for this track.");
      const clip = createTimelineClip(
        track,
        asset,
        frameTime(start, timeline.fps),
        Math.max(
          Math.floor(1000 / timeline.fps),
          Math.floor(
            (Math.floor(
              ((asset?.mediaType === "image"
                ? 3000
                : asset?.durationMs || 3000) *
                timeline.fps) /
                1000,
            ) *
              1000) /
              timeline.fps,
          ),
        ),
      );
      return { ...timeline, assets: all, clips: [...timeline.clips, clip] };
    });

  const handleDirectMediaUpload = async (
    file: File,
    mode: "default" | "video_and_audio" | "audio_only" | "video_only" = "default",
  ) => {
    if (directUploadAbort.current) return;
    const request = new AbortController();
    directUploadAbort.current = request;
    setIsUploadingDirectMedia(true);
    setDirectUploadProgress(0);
    setError("");

    try {
      const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      const isVid = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);

      const uploadType: "image" | "video" | "audio" = isImg
        ? "image"
        : isVid
          ? mode === "audio_only"
            ? "audio"
            : "video"
          : "audio";

      const result = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: ImageAsset | AudioAsset;
        type?: "image" | "video" | "audio";
      }>("/api/caption-maker/upload", file, setDirectUploadProgress, uploadType, request.signal);

      if (request.signal.aborted) return;
      if (!result.success || !result.asset) {
        throw new Error(result.error || "Upload failed. Please retry.");
      }

      const source = result.asset;
      const visual = "fitMode" in source ? source : undefined;
      const durationMs = Math.round((source.duration || (uploadType === "image" ? 3 : 0)) * 1000);

      const hasAudio =
        mode === "video_only"
          ? false
          : uploadType !== "image" && (source as { hasAudio?: boolean }).hasAudio !== false;

      const timelineAsset: TimelineAsset = {
        id: source.id,
        fileName: source.fileName,
        fileUrl: source.fileUrl,
        mediaType: result.type || uploadType,
        durationMs,
        width: visual?.width,
        height: visual?.height,
        fitMode: visual?.fitMode,
        position: visual?.position,
        scale: visual?.scale,
        hasAudio,
      };

      const isTimelineEmpty = timeline.clips.length === 0;

      run(() => {
        const targetKind: TrackKind =
          uploadType === "audio" || mode === "audio_only" ? "audio" : "video";
        let targetTrack = timeline.tracks.find(
          (t) =>
            !t.locked &&
            (targetKind === "audio"
              ? ["audio", "music"].includes(t.kind)
              : ["video", "intro", "overlay"].includes(t.kind)),
        );

        let nextTracks = [...timeline.tracks];
        if (!targetTrack) {
          targetTrack = {
            ...createTimelineTrack(targetKind),
            id: makeTimelineId(`track_${targetKind}`),
          };
          nextTracks = [targetTrack, ...nextTracks];
        }

        // When audio_only, ensure an overlay or video track also exists so user can add background visuals
        if (mode === "audio_only") {
          const hasVisualTrack = nextTracks.some((t) => ["video", "overlay"].includes(t.kind));
          if (!hasVisualTrack) {
            const bgTrack = {
              ...createTimelineTrack("overlay"),
              id: makeTimelineId("track_overlay"),
            };
            nextTracks = [bgTrack, ...nextTracks];
          }
        }

        const startMs = isTimelineEmpty ? 0 : (trackEnds.get(targetTrack.id) || 0);
        const clipDuration = Math.max(
          Math.floor(1000 / timeline.fps),
          Math.floor((Math.floor(((durationMs || 3000) * timeline.fps) / 1000) * 1000) / timeline.fps),
        );

        const clip = {
          ...createTimelineClip(
            targetTrack,
            timelineAsset,
            frameTime(startMs, timeline.fps),
            clipDuration,
          ),
          muted: mode === "video_only",
        };

        const nextClips = [...timeline.clips, clip];
        if (targetKind === "video" && hasAudio && mode !== "video_only") {
          let audioTrack = nextTracks.find((t) => t.kind === "audio" && !t.locked);
          if (!audioTrack) {
            audioTrack = {
              ...createTimelineTrack("audio", "Main audio / Voice"),
              id: makeTimelineId("track_audio"),
            };
            nextTracks = [...nextTracks, audioTrack];
          }
          const hasAudioClip = nextClips.some((c) => c.trackId === audioTrack!.id);
          if (!hasAudioClip) {
            const voiceClip = {
              ...createTimelineClip(
                audioTrack,
                timelineAsset,
                frameTime(startMs, timeline.fps),
                clipDuration,
              ),
              name: `${timelineAsset.fileName} (Audio)`,
              muted: false,
              volume: 1,
            };
            nextClips.push(voiceClip);
          }
        }

        const nextAssets = [
          ...projectTimelineAssets(project).filter((a) => a.id !== timelineAsset.id),
          timelineAsset,
        ];

        return {
          ...timeline,
          tracks: nextTracks,
          assets: nextAssets,
          clips: nextClips,
        };
      });

      if (isTimelineEmpty) {
        onSeek(0);
      }

      if (durationMs > 0 && scroll.current) {
        const totalDurationSec = durationMs / 1000;
        const fitZoom = Math.max(5, Math.min(200, (scroll.current.clientWidth - 160) / (totalDurationSec + 2)));
        setZoom(fitZoom);
      }
    } catch (cause) {
      if (!request.signal.aborted && !(cause instanceof UploadCancelledError)) {
        setError(cause instanceof Error ? cause.message : "Upload failed. Please retry.");
      }
    } finally {
      if (directUploadAbort.current === request) directUploadAbort.current = null;
      if (!request.signal.aborted) {
        setIsUploadingDirectMedia(false);
        setDirectUploadProgress(null);
      }
    }
  };
  const removeTrack = (id:string) => run(() => {
    const next = deleteTimelineTrack(timeline,id);
    setSelected(previous=>previous.filter(id=>next.clips.some(clip=>clip.id===id)));
    setTrackEditor(null);
    return next;
  });
  const updateTrack = (
    id: string,
    changes: Partial<ReelTimeline["tracks"][number]>,
  ) =>
    run(() => ({
      ...timeline,
      tracks: timeline.tracks.map((t) =>
        t.id === id ? { ...t, ...changes } : t,
      ),
    }));
  const originalVideoAsset = useMemo(() => {
    if (project.audio?.sourceVideo) {
      return (
        timeline.assets.find((a) => a.id === project.audio?.sourceVideo?.id) || {
          id: project.audio.sourceVideo.id,
          fileUrl: project.audio.sourceVideo.fileUrl,
          fileName: project.audio.sourceVideo.fileName,
          mediaType: "video" as const,
          durationMs: Math.round(
            (project.audio.sourceVideo.duration || project.audio.duration || 30) * 1000,
          ),
          hasAudio: true,
          width: project.audio.sourceVideo.width,
          height: project.audio.sourceVideo.height,
          fitMode: project.audio.sourceVideo.fitMode,
          position: project.audio.sourceVideo.position,
          scale: project.audio.sourceVideo.scale,
        }
      );
    }
    if (project.image?.mediaType === "video" && project.image.id) {
      const found = timeline.assets.find((a) => a.id === project.image!.id);
      if (found) return found;
    }
    return (
      timeline.assets.find((a) => a.mediaType === "video" && a.hasAudio !== false) ||
      timeline.assets.find((a) => a.mediaType === "video")
    );
  }, [project.audio, project.image, timeline.assets]);

  const getMainVideoMode = (track: TimelineTrack): "video_and_audio" | "audio_only" => {
    if (track.mainVideoMode) return track.mainVideoMode;
    const clips = timeline.clips.filter((c) => c.trackId === track.id);
    const hasCustomBg = clips.some((c) => {
      const a = timeline.assets.find((asset) => asset.id === c.assetId);
      return (
        a?.mediaType === "image" ||
        (originalVideoAsset && a?.id !== originalVideoAsset.id && a?.mediaType === "video")
      );
    });
    return hasCustomBg ? "audio_only" : "video_and_audio";
  };

  const handleSwitchMainVideoMode = (
    trackId: string,
    targetMode: "video_and_audio" | "audio_only",
  ) => {
    run(() => {
      const track = timeline.tracks.find((t) => t.id === trackId);
      if (!track) return timeline;

      let nextTracks = timeline.tracks.map((t) =>
        t.id === trackId ? { ...t, mainVideoMode: targetMode } : t,
      );

      let nextAssets = [...timeline.assets];
      if (originalVideoAsset && !nextAssets.some((a) => a.id === originalVideoAsset.id)) {
        nextAssets.push(originalVideoAsset);
      }

      // 1. Ensure the original voice audio is preserved and synchronized on an audio track
      let audioTrack = nextTracks.find((t) => t.kind === "audio" && !t.locked);
      if (!audioTrack) {
        audioTrack = {
          ...createTimelineTrack("audio", "Main audio / Voice"),
          id: makeTimelineId("track_audio"),
        };
        nextTracks = [...nextTracks, audioTrack];
      }

      let nextClips = [...timeline.clips];
      const audioAssetId = project.audio?.id || (originalVideoAsset ? originalVideoAsset.id : undefined);

      if (audioAssetId) {
        const hasAudioClip = nextClips.some((c) => {
          const t = nextTracks.find((tr) => tr.id === c.trackId);
          return (
            t?.kind === "audio" &&
            (c.assetId === audioAssetId || c.assetId === project.audio?.id)
          );
        });

        if (!hasAudioClip) {
          const duration = Math.max(
            1000,
            Math.round(
              (project.audio?.duration ||
                (originalVideoAsset?.durationMs ? originalVideoAsset.durationMs / 1000 : 30)) * 1000,
            ),
          );
          const audioClip = {
            ...createTimelineClip(
              audioTrack,
              timeline.assets.find((a) => a.id === audioAssetId) || originalVideoAsset,
              0,
              duration,
            ),
            name: project.audio?.fileName || `${originalVideoAsset?.fileName || "Video"} (Audio)`,
            muted: false,
            volume: project.voiceVolume ?? 1,
            linkId: "primary_voice",
          };
          nextClips.push(audioClip);
        }
      }

      // 2. Adjust clips on the main video track based on targetMode
      const videoClips = nextClips.filter((c) => c.trackId === trackId);

      if (targetMode === "video_and_audio") {
        if (originalVideoAsset) {
          if (videoClips.length > 0) {
            nextClips = nextClips.map((c) =>
              c.trackId === trackId
                ? {
                    ...c,
                    assetId: originalVideoAsset.id,
                    name: originalVideoAsset.fileName,
                    loop: false,
                    muted: false,
                  }
                : c,
            );
          } else {
            const duration = Math.max(
              1000,
              originalVideoAsset.durationMs ||
                Math.round((project.audio?.duration || 30) * 1000),
            );
            nextClips.push({
              ...createTimelineClip(track, originalVideoAsset, 0, duration),
              loop: false,
              muted: false,
            });
          }
        }
      } else {
        // targetMode === 'audio_only'
        // If a custom background asset already exists in assets, use it
        const customBg = nextAssets.find(
          (a) =>
            a.id !== originalVideoAsset?.id &&
            (a.mediaType === "image" || a.mediaType === "video"),
        );
        if (customBg && videoClips.length > 0) {
          nextClips = nextClips.map((c) =>
            c.trackId === trackId
              ? {
                  ...c,
                  assetId: customBg.id,
                  name: customBg.fileName,
                  loop: customBg.mediaType === "image",
                  muted: true, // background video visuals are muted so original audio plays
                }
              : c,
          );
        }
      }

      return {
        ...timeline,
        tracks: nextTracks,
        assets: nextAssets,
        clips: nextClips,
      };
    });
  };

  const triggerBackgroundMediaUpload = (trackId: string) => {
    setBgUploadTrackId(trackId);
    if (bgUploadInputRef.current) {
      bgUploadInputRef.current.value = "";
      bgUploadInputRef.current.click();
    }
  };

  const handleBackgroundMediaUpload = async (file: File) => {
    const trackId = bgUploadTrackId || timeline.tracks.find((t) => t.kind === "video")?.id;
    if (!trackId || directUploadAbort.current) return;
    const request = new AbortController();
    directUploadAbort.current = request;
    setIsUploadingDirectMedia(true);
    setDirectUploadProgress(0);
    setError("");

    try {
      const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|tiff|tif|heic|heif)$/i.test(file.name);
      const isVid = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
      const uploadType: "image" | "video" = isImg ? "image" : "video";

      const result = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: ImageAsset;
        type?: "image" | "video";
      }>("/api/caption-maker/upload", file, setDirectUploadProgress, uploadType, request.signal);

      if (request.signal.aborted) return;
      if (!result.success || !result.asset) {
        throw new Error(result.error || "Background media upload failed.");
      }

      const source = result.asset;
      const durationMs = Math.round((source.duration || (uploadType === "image" ? 30 : 0)) * 1000);

      const bgAsset: TimelineAsset = {
        id: source.id,
        fileName: source.fileName,
        fileUrl: source.fileUrl,
        mediaType: uploadType,
        durationMs,
        width: source.width,
        height: source.height,
        fitMode: source.fitMode || "cover",
        position: source.position || "center",
        scale: source.scale ?? 100,
        hasAudio: false, // background visuals stay muted
      };

      run(() => {
        const track = timeline.tracks.find((t) => t.id === trackId);
        if (!track) return timeline;

        let nextTracks = timeline.tracks.map((t) =>
          t.id === trackId ? { ...t, mainVideoMode: "audio_only" as const } : t,
        );

        // Ensure original voice audio is on an audio track and in sync
        let audioTrack = nextTracks.find((t) => t.kind === "audio" && !t.locked);
        if (!audioTrack) {
          audioTrack = {
            ...createTimelineTrack("audio", "Main audio / Voice"),
            id: makeTimelineId("track_audio"),
          };
          nextTracks = [...nextTracks, audioTrack];
        }

        const nextAssets = [
          ...timeline.assets.filter((a) => a.id !== bgAsset.id),
          bgAsset,
        ];
        if (originalVideoAsset && !nextAssets.some((a) => a.id === originalVideoAsset.id)) {
          nextAssets.push(originalVideoAsset);
        }

        // Determine target duration from timeline audio or project
        const targetDuration = Math.max(
          1000,
          timelineEnd(timeline),
          Math.round((project.audio?.duration || 30) * 1000),
        );

        let nextClips = [...timeline.clips];

        // Ensure audio clip exists
        const audioAssetId = project.audio?.id || (originalVideoAsset ? originalVideoAsset.id : undefined);
        if (audioAssetId) {
          const hasAudioClip = nextClips.some((c) => {
            const t = nextTracks.find((tr) => tr.id === c.trackId);
            return (
              t?.kind === "audio" &&
              (c.assetId === audioAssetId || c.assetId === project.audio?.id)
            );
          });
          if (!hasAudioClip) {
            const audioClip = {
              ...createTimelineClip(
                audioTrack,
                nextAssets.find((a) => a.id === audioAssetId) || originalVideoAsset,
                0,
                targetDuration,
              ),
              name: project.audio?.fileName || `${originalVideoAsset?.fileName || "Video"} (Audio)`,
              muted: false,
              volume: project.voiceVolume ?? 1,
              linkId: "primary_voice",
            };
            nextClips.push(audioClip);
          }
        }

        const existingVideoClips = nextClips.filter((c) => c.trackId === trackId);

        if (existingVideoClips.length > 0) {
          nextClips = nextClips.map((c) =>
            c.trackId === trackId
              ? {
                  ...c,
                  assetId: bgAsset.id,
                  name: bgAsset.fileName,
                  loop: uploadType === "image",
                  muted: true, // background video visuals stay muted
                }
              : c,
          );
        } else {
          nextClips.push({
            ...createTimelineClip(track, bgAsset, 0, targetDuration),
            loop: uploadType === "image",
            muted: true,
          });
        }

        return {
          ...timeline,
          tracks: nextTracks,
          assets: nextAssets,
          clips: nextClips,
        };
      });
    } catch (err) {
      if (err instanceof UploadCancelledError) return;
      setError(err instanceof Error ? err.message : "Failed to upload background media");
    } finally {
      if (directUploadAbort.current === request) directUploadAbort.current = null;
      setIsUploadingDirectMedia(false);
      setDirectUploadProgress(null);
      setBgUploadTrackId(null);
    }
  };

  const button =
    "rounded-md border border-zinc-700/70 bg-zinc-900 p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-amber-300 disabled:opacity-30";
  const selectButton =
    "!h-7 !w-auto gap-1.5 !rounded-md !border-zinc-700/70 !bg-zinc-900 !px-2.5 !py-0 !text-xs !font-normal !text-zinc-300 hover:!bg-zinc-800 hover:!text-amber-300 focus-visible:!border-amber-400 focus-visible:!ring-1 focus-visible:!ring-amber-400/30 shadow-none [&>svg]:!size-3.5 [&>svg]:!text-zinc-400";
  const trackButton =
    "w-[22px] h-[22px] flex items-center justify-center p-0 rounded border border-zinc-700/70 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-amber-300 disabled:opacity-30 shrink-0";
  const icon = (
    title: string,
    action: () => void,
    node: React.ReactNode,
    disabled = false,
    cls = button,
  ) => (
    <Button
      type="button"
      title={title}
      aria-label={title}
      onClick={action}
      disabled={disabled}
      className={cls}
    >
      {node}
    </Button>
  );
  const tickStep = (zoom >= 50 ? 1 : Math.ceil(50 / zoom)) * 1000;
  const tickStart = Math.max(
    0,
    Math.floor((viewport.left - 160) / (tickStep * px)),
  );
  const ticks = Array.from(
    { length: Math.ceil(viewport.width / (tickStep * px)) + 3 },
    (_, i) => (tickStart + i) * tickStep,
  ).filter((t) => t * px <= width);
  const trackSettingsForm = trackEditor ? (
      <form
        aria-label="Track settings"
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-700 bg-zinc-950 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const current = timeline.tracks.find(t => t.id === trackEditor.track.id);
            if (!current) throw new Error("This track is no longer available.");
            const tracks = timeline.tracks.filter(t => t.id !== current.id);
            tracks.splice(trackEditor.index, 0, {
              ...current,
              name: trackEditor.track.name,
              height: trackEditor.track.height,
              mainVideoMode: trackEditor.track.mainVideoMode,
            });
            const modeChanged =
              current.kind === "video" &&
              trackEditor.track.mainVideoMode &&
              trackEditor.track.mainVideoMode !== current.mainVideoMode;
            if (modeChanged) {
              handleSwitchMainVideoMode(current.id, trackEditor.track.mainVideoMode!);
            } else {
              onChange(commitTimeline({ ...timeline, tracks }));
            }
            setTrackEditor(null);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid track");
          }
        }}
      >
        {onOpenTrackPanel ? <h3 className="text-sm font-bold text-amber-300">Track settings</h3> : (
          <DialogTitle className="text-base font-bold text-amber-300">Track settings</DialogTitle>
        )}
        <label className="block">
          Track name
          <Input
            className="mt-1 w-full rounded bg-zinc-900 p-2"
            value={trackEditor.track.name}
            onChange={(e) =>
              setTrackEditor({
                ...trackEditor,
                track: { ...trackEditor.track, name: e.target.value },
              })
            }
          />
        </label>
        <label className="block">
          Height (px)
          <Input
            type="number"
            min="36"
            max="160"
            className="mt-1 w-full rounded bg-zinc-900 p-2"
            value={trackEditor.track.height}
            onChange={(e) =>
              setTrackEditor({
                ...trackEditor,
                track: {
                  ...trackEditor.track,
                  height: Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label className="block">
          Layer order
          <select
            className="mt-1 w-full rounded bg-zinc-900 p-2"
            value={trackEditor.index}
            onChange={(e) =>
              setTrackEditor({
                ...trackEditor,
                index: Number(e.target.value),
              })
            }
          >
            {timeline.tracks.map((t, i) => (
              <option key={t.id} value={i}>
                {i + 1}
                {i === 0 ? " · Front layer" : ""} — {t.name}
              </option>
            ))}
          </select>
        </label>
        {trackEditor.track.kind === "video" && (
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <span className="block text-xs font-bold text-amber-300">Main Video Playback Mode</span>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
                <input
                  type="radio"
                  name="trackMainVideoMode"
                  checked={trackEditor.track.mainVideoMode !== "audio_only"}
                  onChange={() =>
                    setTrackEditor({
                      ...trackEditor,
                      track: { ...trackEditor.track, mainVideoMode: "video_and_audio" },
                    })
                  }
                  className="accent-amber-400"
                />
                <span>🎬 Video + Audio (Original video visuals & audio)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
                <input
                  type="radio"
                  name="trackMainVideoMode"
                  checked={trackEditor.track.mainVideoMode === "audio_only"}
                  onChange={() =>
                    setTrackEditor({
                      ...trackEditor,
                      track: { ...trackEditor.track, mainVideoMode: "audio_only" },
                    })
                  }
                  className="accent-cyan-400"
                />
                <span>🎵 Audio Only (Custom background video/image + voice)</span>
              </label>
            </div>
            {trackEditor.track.mainVideoMode === "audio_only" && (
              <div className="pt-2">
                <Button
                  type="button"
                  size="sm"
                  aria-label="Upload background video or image"
                  onClick={() => {
                    const id = trackEditor.track.id;
                    setTrackEditor(null);
                    triggerBackgroundMediaUpload(id);
                  }}
                  className="text-xs bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold"
                >
                  <Upload size={12} className="mr-1" />
                  Upload Background (Video / Image)
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-[10px] text-zinc-500">
          Upper visual tracks appear in front. Remove clips before deleting
          their track; Undo restores edits.
        </p>
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            className={button}
            onClick={() => {
              removeTrack(trackEditor.track.id);
            }}
          >
            Delete track
          </Button>
          <Button
            type="button"
            className={button}
            onClick={() => setTrackEditor(null)}
          >
            Cancel
          </Button>
          <Button
            className="rounded bg-amber-400 px-3 py-2 font-bold text-black"
            type="submit"
          >
            Apply
          </Button>
        </div>
      </form>
  ) : null;

  return (
    <section
      data-editor-timeline="true"
      aria-label="Professional multi-track timeline"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).matches("input,textarea,select"))
          return;
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        let handled = true;
        if (event.key === 'Escape' && drag.current) { drag.current = null; setDraft(null); }
        else if (event.code === "Space") onTogglePlay();
        else if (key === "delete" || key === "backspace") remove();
        else if (key === "s" && !mod) split();
        else if (mod && key === "c") copy();
        else if (mod && key === "x") {
          copy();
          remove();
        } else if (mod && key === "v") paste();
        else if (mod && key === "d")
          run(() => duplicateTimelineClips(timeline, selected));
        else if (mod && key === "z") {
          if (event.shiftKey) onRedo();
          else onUndo();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          onSeek(
            currentTime + (event.key === "ArrowRight" ? 1 : -1) / timeline.fps,
          );
        else handled = false;
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className="relative shrink-0 border-t border-zinc-700 bg-[#101113] text-xs text-zinc-200 outline-none focus-within:border-amber-500/50"
    >
      <div
        role="separator"
        aria-label="Resize timeline"
        aria-orientation="horizontal"
        tabIndex={0}
        aria-valuemin={180}
        aria-valuemax={Math.round(Math.max(height, 180, viewportHeight * .65))}
        aria-valuenow={Math.round(height)}
        aria-valuetext={`${Math.round(height)} pixels`}
        title="Drag up or down to resize the timeline. Arrow keys also resize."
        className="group flex h-3 cursor-row-resize touch-none select-none items-center justify-center bg-zinc-800/80 hover:bg-amber-500/30 focus-visible:outline focus-visible:outline-amber-400"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          cancelHover();
          resizeGrab.current = { pointerId:event.pointerId, y:event.clientY, height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event=>{
          const grab=resizeGrab.current;
          if (!grab || grab.pointerId!==event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          setHeight(Math.max(180,Math.min(Math.max(180,window.innerHeight*.65),grab.height+grab.y-event.clientY)));
        }}
        onPointerUp={event=>{
          if(resizeGrab.current?.pointerId!==event.pointerId)return;
          resizeGrab.current=null;
          if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={()=>{resizeGrab.current=null;}}
        onLostPointerCapture={()=>{resizeGrab.current=null;}}
        onKeyDown={event=>{
          if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
          event.preventDefault();event.stopPropagation();
          const maximum=Math.max(180,window.innerHeight*.65);
          setHeight(previous=>event.key==='Home'?180:event.key==='End'?maximum:Math.max(180,Math.min(maximum,previous+(event.key==='ArrowUp'?20:-20))));
        }}
      ><span aria-hidden="true" className="h-1 w-12 rounded-full bg-zinc-500 group-hover:bg-amber-400"/></div>
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-zinc-800 px-3 py-2">
        <span className="mr-2 flex items-center gap-2 font-semibold text-amber-400">
          <Film size={15} />
          Timeline
        </span>
        {icon(
          isPlaying ? "Pause" : "Play",
          onTogglePlay,
          isPlaying ? <Pause size={14} /> : <Play size={14} />,
        )}
        <Select
          value=""
          onValueChange={(value) => {
            if (allowTimelineThumbnail && value === 'thumbnail') { if (onEditThumbnail) onEditThumbnail(); else onThumbnailCoverChange?.({ enabled: true }); return; }
            if (value === 'background-video' || value === 'background-music' || value === 'spoken-voice') {
              setTrackEditor(null);
              if (onOpenTrackPanel) onOpenTrackPanel(value === 'background-video' ? 'video' : value === 'background-music' ? 'music' : 'audio');
              return;
            }
            const kind = value as TrackKind;
            const track = createTimelineTrack(kind);
            const added = run(() => ({
              ...timeline,
              tracks: [track, ...timeline.tracks],
            }));
            if (added && onOpenTrackPanel) {
              onOpenTrackPanel(kind);
              setTrackEditor({ track, index: 0 });
            }
          }}
        >
          <SelectTrigger aria-label="Add track" className={selectButton}><SelectValue placeholder="+ Add track" /></SelectTrigger>
          <SelectContent>
            {allowTimelineThumbnail && onThumbnailCoverChange && <SelectItem value="thumbnail">Thumbnail</SelectItem>}
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="overlay">Overlay</SelectItem>
            <SelectItem value="captions">Captions</SelectItem>
            <SelectItem value="music">Music</SelectItem>
            <SelectItem value="intro">Intro</SelectItem>
            <SelectItem value="text">Text</SelectItem>
          </SelectContent>
        </Select>
        <span className="mr-2 rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-amber-100">
          {clock(currentTime * 1000)}{" "}
          <span className="text-zinc-500">
            / {clock(timelineEnd(timeline))}
          </span>
        </span>
        {icon("Undo", onUndo, <Undo2 size={14} />, !canUndo)}
        {icon("Redo", onRedo, <Redo2 size={14} />, !canRedo)}
        {icon(
          "Split at playhead (S)",
          split,
          <Scissors size={14} />,
          !timeline.clips.length,
        )}
        {icon("Copy (Ctrl+C)", copy, <Copy size={14} />, !selected.length)}
        <Button type="button" className={button} disabled={!onAutoSyncCaptions || isSyncingCaptions || !project.audio || lockedCaptionAssets.has(project.audio?.id)}
          title="Re-run speech recognition on the current spoken source; this may update transcript text and timing"
          onClick={onAutoSyncCaptions}>{isSyncingCaptions ? 'Syncing captions…' : 'Auto-sync speech'}</Button>
        <Button type="button" className={button} disabled={!timeline.clips.some(c => selected.includes(c.id) && timeline.tracks.some(t => t.id === c.trackId && !['audio', 'music'].includes(t.kind)))}
          title="Edit keyframes on the first selected visual clip" onClick={() => {
            const clip = timeline.clips.find(c => selected.includes(c.id) && timeline.tracks.some(t => t.id === c.trackId && !['audio', 'music'].includes(t.kind)));
            if (clip) setInspector(structuredClone(clip));
          }}>Keyframes</Button>
        {icon('Duplicate selected at timeline end (Ctrl+D)', () => run(() => duplicateTimelineClips(timeline, selected)), <CopyPlus size={14} />, !selected.length)}
        <Select value={editMode} onValueChange={value => setEditMode(value as TimelineEditMode)}>
          <SelectTrigger aria-label="Timeline edit mode" className={selectButton}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="move">Move / Trim</SelectItem>
            <SelectItem value="ripple">Ripple — drag edge</SelectItem>
            <SelectItem value="roll">Roll — drag shared edge</SelectItem>
            <SelectItem value="slip">Slip — drag clip</SelectItem>
            <SelectItem value="slide">Slide — drag clip</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" className={button} disabled={!selected.length} onClick={() => run(() => rippleDelete(timeline, selected))} title="Delete selection and close its empty time across tracks">Ripple delete</Button>
        <Button type="button" className={button} disabled={!timeline.clips.length} onClick={() => run(() => removeTimelineGaps(timeline))} title="Close intervals that are empty across every track">Remove gaps</Button>
        {icon(
          "Paste (Ctrl+V)",
          paste,
          <Clipboard size={14} />,
          !clipboard.length,
        )}
        {icon(
          "Delete selected",
          remove,
          <Trash2 size={14} />,
          !selected.length,
        )}
        {icon(
          "Group selected clips",
          () => run(() => groupTimelineClips(timeline, selected, true)),
          <Link size={14} />,
          selectedIds.size < 2,
        )}
        {icon(
          "Ungroup selected clips",
          () => run(() => groupTimelineClips(timeline, selected, false)),
          <Unlink size={14} />,
          !selected.length,
        )}
        <Button
          type="button"
          title="Snap to clips, markers and playhead"
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
          className={`${button} ${snap ? "!text-amber-400 !border-amber-500/40" : ""}`}
        >
          <Magnet size={14} />
        </Button>
        <Button
          type="button"
          aria-label="Hover scrub"
          aria-pressed={hoverScrub}
          title="Hover scrub: move the mouse over the ruler or tracks to preview that time while paused"
          onClick={() => {
            cancelHover();
            setHoverScrub((value) => !value);
          }}
          className={`${button} flex items-center gap-1 ${hoverScrub ? "!text-amber-400 !border-amber-500/40" : ""}`}
        >
          <MousePointer2 size={14} />
          <span>Hover scrub</span>
        </Button>
        {icon(
          "Add marker",
          () => {
            const name = window.prompt("Marker name", "Marker");
            if (name)
              run(() => ({
                ...timeline,
                markers: [
                  ...timeline.markers,
                  {
                    id: makeTimelineId("marker"),
                    timeMs: frameTime(currentTime * 1000, timeline.fps),
                    name,
                  },
                ],
              }));
          },
          <Flag size={14} />,
        )}
        <input
          ref={directUploadRef}
          type="file"
          hidden
          accept="video/*,audio/*,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const isVid = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
              if (isVid) {
                setPendingVideoFile(file);
              } else {
                void handleDirectMediaUpload(file, "default");
              }
            }
            e.target.value = "";
          }}
        />
        <input
          ref={bgUploadInputRef}
          type="file"
          hidden
          accept="video/*,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleBackgroundMediaUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          disabled={isUploadingDirectMedia}
          onClick={() => directUploadRef.current?.click()}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          title="Upload video or audio to automatically place it on the timeline and define the project duration"
        >
          {isUploadingDirectMedia ? (
            <>
              <Loader2 size={13} className="animate-spin text-amber-400" />
              <span>{directUploadProgress !== null ? `Uploading ${directUploadProgress}%` : "Uploading…"}</span>
            </>
          ) : (
            <>
              <Upload size={13} />
              <span>Upload Video / Audio</span>
            </>
          )}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            className={button}
            onClick={() =>
              setZoom(
                Math.max(
                  5,
                  Math.min(
                    200,
                    ((scroll.current?.clientWidth || 900) - 160) /
                      Math.max(10, timelineEnd(timeline) / 1000 + 2),
                  ),
                ),
              )
            }
          >
            Fit
          </Button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min="5"
            max="200"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 accent-amber-400"
          />
          <span className="w-10 font-mono text-zinc-500">
            {Math.round(zoom)}px/s
          </span>
          {!project.timeline?.enabled && (
            <Button
              type="button"
              onClick={() => setSimple(!simple)}
              className={button}
            >
              {simple ? "Tracks" : "Simple trim"}
            </Button>
          )}
        </div>
      </div>
      {thumbnailHover && <HoverFramePreview key={thumbnailHover.fileUrl} frame={thumbnailHover} />}
      {error && (
        <div
          role="alert"
          className="flex justify-between border-b border-rose-500/20 bg-rose-950/40 px-3 py-1 text-rose-200"
        >
          {error}
          <Button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </Button>
        </div>
      )}
      {allowTimelineThumbnail && onThumbnailCoverChange && (
        <ThumbnailCoverControls
          enabled={project.thumbnailCover?.enabled === true}
          url={thumbnailCoverUrl}
          error={thumbnailCoverError}
          onChange={onThumbnailCoverChange}
          onEdit={() => onEditThumbnail?.()}
        />
      )}
      {simple && !project.timeline?.enabled ? (
        <CaptionTimeline
          duration={project.audio?.duration || 0}
          groups={project.captionGroups}
          trimRange={project.trimRange}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
          onTrimChange={onTrimChange}
          showCaptionWords={false}
          waveformPeaks={project.audio && previews[project.audio.id]?.sourceUrl === project.audio.fileUrl ? previews[project.audio.id]?.peaks : undefined}
          onOpenSmartEditor={onOpenSmartEditor}
        />
      ) : (
        <div
          ref={scroll}
          tabIndex={-1}
          onPointerMove={event => { if (drag.current) move(event); }}
          onPointerUp={() => { if (drag.current) finish(); }}
          onPointerCancel={() => { if (drag.current) { drag.current = null; setDraft(null); } }}
          onLostPointerCapture={event => { if (event.target === event.currentTarget && drag.current) { drag.current = null; setDraft(null); } }}
          onScroll={(e) =>
            setViewport({
              left: e.currentTarget.scrollLeft,
              width: e.currentTarget.clientWidth,
            })
          }
          style={{ height }}
          className="overflow-auto overscroll-contain"
        >
          <div
            style={{ width: width + 160, minWidth: "100%" }}
            className="relative"
          >
            <div className="sticky top-0 z-40 flex h-8 border-b border-zinc-700 bg-[#191b1f]">
              <div className="sticky left-0 z-50 flex w-40 shrink-0 items-center border-r border-zinc-700 bg-[#191b1f] px-3 text-[10px] text-zinc-400">
                TRACKS{" "}
                <span className="ml-auto">{timeline.tracks.length} / 32</span>
              </div>
              <div
                className="relative flex-1 cursor-crosshair"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onSeek(
                    Math.min(timelineEnd(timeline), timeAt(e.clientX)) / 1000,
                  );
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1)
                    onSeek(
                      Math.min(timelineEnd(timeline), timeAt(e.clientX)) / 1000,
                    );
                  else hoverSeek(e);
                }}
                onPointerLeave={cancelHover}
              >
                {ticks.map((ms) => (
                  <div
                    key={ms}
                    className="absolute bottom-0 h-4 border-l border-zinc-600 pl-1 font-mono text-[9px] text-zinc-400"
                    style={{ left: ms * px }}
                  >
                    {clock(ms)}
                  </div>
                ))}
                {timeline.markers.map((marker) => (
                  <Button
                    key={marker.id}
                    title={`${marker.name} · right click to remove`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(marker.timeMs / 1000);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      run(() => ({
                        ...timeline,
                        markers: timeline.markers.filter(
                          (m) => m.id !== marker.id,
                        ),
                      }));
                    }}
                    style={{ left: marker.timeMs * px }}
                    className="absolute top-0 z-10 max-w-24 truncate border-l border-amber-400 bg-amber-500/20 px-1 text-[9px] text-amber-200"
                  >
                    ◆ {marker.name}
                  </Button>
                ))}
              </div>
            </div>
            <div
              ref={canvas}
              className="absolute bottom-0 left-40 top-8 pointer-events-none"
              style={{ width }}
            >
              <div
                className="absolute bottom-0 top-0 z-30 border-l border-amber-400"
                style={{ left: currentTime * 1000 * px }}
              >
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Timeline playhead"
                  aria-valuemin={0}
                  aria-valuemax={timelineEnd(timeline) / 1000}
                  aria-valuenow={currentTime}
                  title="Drag to move the playhead"
                  className="absolute -left-1.5 inset-y-0 w-3 cursor-ew-resize touch-none pointer-events-auto"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    cancelHover();
                    playheadGrab.current = { x: e.clientX, time: currentTime };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    if (isPlaying) onTogglePlay();
                  }}
                  onPointerMove={(e) => {
                    if (
                      e.buttons === 1 &&
                      e.currentTarget.hasPointerCapture(e.pointerId)
                    ) {
                      e.stopPropagation();
                      const origin = playheadGrab.current;
                      if (origin)
                        onSeek(
                          Math.max(
                            0,
                            Math.min(
                              timelineEnd(timeline) / 1000,
                              origin.time + (e.clientX - origin.x) / zoom,
                            ),
                          ),
                        );
                    } else if (e.buttons === 0) hoverSeek(e);
                  }}
                  onPointerUp={() => {
                    playheadGrab.current = null;
                  }}
                  onPointerCancel={() => {
                    playheadGrab.current = null;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      e.stopPropagation();
                      onSeek(
                        Math.max(
                          0,
                          Math.min(
                            timelineEnd(timeline) / 1000,
                            currentTime +
                              (e.key === "ArrowRight" ? 1 : -1) / timeline.fps,
                          ),
                        ),
                      );
                    }
                  }}
                />
                <span className="absolute -left-1.5 -top-1 text-amber-400 pointer-events-none">
                  ▼
                </span>
              </div>
            </div>
            {timeline.tracks.map((track, index) => {
              const trackHeight = track.kind === "video" ? Math.max(track.height || 52, 74) : (track.height || 52);
              return (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`relative flex border-b border-zinc-800 ${track.hidden ? "opacity-50" : ""}`}
                style={{ height: trackHeight }}
              >
                <div
                  className="sticky left-0 z-20 flex w-40 shrink-0 flex-col justify-between py-2 border-r border-zinc-700 bg-[#191b1f] px-2"
                  style={{ height: trackHeight }}
                >
                  <div className="flex items-center gap-1">
                    <GripVertical size={11} className="text-zinc-600" />
                    <Button
                      type="button"
                      className="flex-1 truncate text-left text-[11px] font-medium"
                      title="Select track"
                      onClick={() => {
                        onOpenTrackPanel?.(track.kind);
                        setTrackEditor({ track: structuredClone(track), index });
                      }}
                    >
                      {track.name}
                    </Button>
                    <Button
                      type="button"
                      aria-label={`Track settings: ${track.name}`}
                      title="Track height, order or delete"
                      onClick={() => {
                        onOpenTrackPanel?.(track.kind);
                        setTrackEditor({ track: structuredClone(track), index });
                      }}
                    >
                      <Settings2 size={11} />
                    </Button>
                  </div>
                  {track.kind === "video" && (
                    <div className="flex items-center w-full my-0.5">
                      <Select
                        value={getMainVideoMode(track)}
                        onValueChange={(val: "video_and_audio" | "audio_only") =>
                          handleSwitchMainVideoMode(track.id, val)
                        }
                      >
                        <SelectTrigger
                          className="!h-5 !w-full !rounded-md !border-zinc-700/80 !bg-zinc-900/90 !px-1.5 !py-0 text-[10px] text-zinc-200 hover:!border-amber-400/50 shadow-none cursor-pointer [&>svg]:!size-3"
                          aria-label={`Main video track mode: ${getMainVideoMode(track) === 'audio_only' ? 'Audio Only' : 'Video + Audio'}`}
                        >
                          <span className="flex items-center gap-1 truncate font-medium">
                            {getMainVideoMode(track) === "audio_only" ? (
                              <>
                                <Volume2 size={11} className="text-cyan-400 shrink-0" />
                                <span className="text-cyan-200 truncate text-[10px]">Audio Only</span>
                              </>
                            ) : (
                              <>
                                <Film size={11} className="text-amber-400 shrink-0" />
                                <span className="text-amber-200 truncate text-[10px]">Video + Audio</span>
                              </>
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 z-50 shadow-2xl">
                          <SelectItem
                            value="video_and_audio"
                            className="cursor-pointer focus:bg-amber-400/20 focus:text-amber-200"
                          >
                            <div className="flex items-center gap-2">
                              <Film size={12} className="text-amber-400 shrink-0" />
                              <div className="text-left">
                                <div className="font-semibold text-xs text-amber-200">Video + Audio</div>
                                <div className="text-[10px] text-zinc-400">Original video visuals & audio</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem
                            value="audio_only"
                            className="cursor-pointer focus:bg-cyan-400/20 focus:text-cyan-200"
                          >
                            <div className="flex items-center gap-2">
                              <Volume2 size={12} className="text-cyan-400 shrink-0" />
                              <div className="text-left">
                                <div className="font-semibold text-xs text-cyan-200">Audio Only</div>
                                <div className="text-[10px] text-zinc-400">Custom background (video/image) + voice</div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    {icon(
                      `${track.locked ? "Unlock" : "Lock"} ${track.name}`,
                      () => updateTrack(track.id, { locked: !track.locked }),
                      track.locked ? <Lock size={11} /> : <Unlock size={11} />,
                      false,
                      trackButton,
                    )}
                    {icon(
                      `${track.hidden ? "Show" : "Hide"} ${track.name}`,
                      () => updateTrack(track.id, { hidden: !track.hidden }),
                      track.hidden ? <EyeOff size={11} /> : <Eye size={11} />,
                      false,
                      trackButton,
                    )}
                    {!["text", "captions"].includes(track.kind) &&
                      icon(
                        `${track.muted ? "Unmute" : "Mute"} ${track.name}`,
                        () => {
                          const nextMuted = !track.muted;
                          if (track.kind === "video" && getMainVideoMode(track) === "video_and_audio") {
                            run(() => ({
                              ...timeline,
                              tracks: timeline.tracks.map((t) =>
                                t.id === track.id || t.kind === "audio"
                                  ? { ...t, muted: nextMuted }
                                  : t,
                              ),
                            }));
                          } else {
                            updateTrack(track.id, { muted: nextMuted });
                          }
                        },
                        track.muted ? (
                          <VolumeX size={11} />
                        ) : (
                          <Volume2 size={11} />
                        ),
                        false,
                        trackButton,
                      )}
                    {audioTrack(track) && (
                      <Button
                        type="button"
                        aria-label={`Solo ${track.name}`}
                        aria-pressed={track.solo === true}
                        title={`Solo ${track.name}`}
                        className={`${trackButton} text-[10px] font-bold leading-none ${track.solo ? '!text-amber-400 !border-amber-400' : ''}`}
                        onClick={() => {
                          const nextSolo = !track.solo;
                          if (track.kind === "video" && getMainVideoMode(track) === "video_and_audio") {
                            run(() => ({
                              ...timeline,
                              tracks: timeline.tracks.map((t) => {
                                if (t.id === track.id) return { ...t, solo: nextSolo };
                                if (t.kind === "audio") {
                                  return { ...t, solo: nextSolo, hidden: false, muted: false };
                                }
                                return t;
                              }),
                            }));
                          } else {
                            updateTrack(track.id, { solo: nextSolo });
                          }
                        }}
                      >
                        S
                      </Button>
                    )}
                    {track.kind === "text" &&
                      icon(
                        "Add text at playhead",
                        () => addAsset(track.id),
                        <Type size={11} />,
                        false,
                        trackButton,
                      )}
                    {track.kind === "captions" &&
                      icon(
                        "Edit transcript",
                        onEditCaptions,
                        <Type size={11} />,
                        false,
                        trackButton,
                      )}
                  </div>
                </div>
                <div
                  className="relative flex-1 bg-[#131518]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right,var(--timeline-grid,#ffffff06) 1px,transparent 1px)",
                    backgroundSize: `${zoom}px 100%`,
                  }}
                  onPointerDown={(e) => {
                    cancelHover();
                    if (e.target === e.currentTarget) {
                      setSelected([]);
                      onSeek(
                        Math.min(timelineEnd(timeline), timeAt(e.clientX)) /
                          1000,
                      );
                    }
                  }}
                  onPointerMove={hoverSeek}
                  onPointerLeave={cancelHover}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addAsset(
                      track.id,
                      e.dataTransfer.getData("application/reelspark-asset"),
                      timeAt(e.clientX),
                    );
                  }}
                >
                  {timeline.clips.filter((c) => c.trackId === track.id).length > 0 && (
                    <Button
                      type="button"
                      aria-label={`${track.kind === "text" ? "Add text" : track.kind === "captions" ? "Add captions" : "Add media"} to ${track.name}`}
                      title={track.locked ? "Unlock this track first" : track.kind === "text" ? "Append text to this track" : track.kind === "captions" ? "Open transcript editor" : "Append media to this track"}
                      disabled={track.locked}
                      onPointerDown={event => event.stopPropagation()}
                      onClick={() => {
                        cancelHover();
                        if (track.kind === "text") addAsset(track.id, undefined, trackEnds.get(track.id) || 0);
                        else if (track.kind === "captions") onEditCaptions();
                        else setMediaTrackId(track.id);
                      }}
                      style={{ left: (trackEnds.get(track.id) || 0) * px + 16 }}
                      className="absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-dashed border-zinc-600 text-zinc-400 transition-colors hover:border-amber-400 hover:bg-amber-400/10 hover:text-amber-300 focus-visible:outline focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </Button>
                  )}
                  {timeline.clips.filter((c) => c.trackId === track.id).length === 0 && (
                    <div className="absolute inset-y-0 left-3 flex items-center gap-2 z-10 pointer-events-auto">
                      {track.kind === "video" && getMainVideoMode(track) === "audio_only" && (
                        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-zinc-900/90 px-3 py-1 shadow-lg backdrop-blur-sm">
                          <Volume2 size={13} className="text-cyan-400 shrink-0" />
                          <span className="text-[11px] font-medium text-cyan-200">
                            Audio Only Active (Original Audio Synchronized)
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            aria-label="Upload Background Video or Image"
                            onClick={() => triggerBackgroundMediaUpload(track.id)}
                            className="flex items-center gap-1.5 rounded bg-cyan-500 hover:bg-cyan-400 px-2.5 py-1 text-[10px] font-bold text-zinc-950 transition-colors cursor-pointer shadow"
                          >
                            <Upload size={11} />
                            Upload Background Video or Image
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label="Choose background from media library"
                            onClick={() => setMediaTrackId(track.id)}
                            className="rounded border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-200 transition-colors"
                          >
                            Choose Media
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label="Restore Original Video"
                            onClick={() => handleSwitchMainVideoMode(track.id, "video_and_audio")}
                            className="text-[10px] text-zinc-400 hover:text-amber-300"
                          >
                            Restore Original Video
                          </Button>
                        </div>
                      )}
                      {track.kind === "video" && getMainVideoMode(track) === "video_and_audio" && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            aria-label="Upload Video"
                            onClick={() => directUploadRef.current?.click()}
                            className="h-7 px-3 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Film size={12} />
                            <span>Upload Main Video</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            aria-label="Choose Video"
                            onClick={() => setMediaTrackId(track.id)}
                            className="h-7 px-2.5 text-xs font-medium border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg flex items-center gap-1.5"
                          >
                            <span>Choose Media</span>
                          </Button>
                          {originalVideoAsset && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label="Switch to Audio Only"
                              onClick={() => handleSwitchMainVideoMode(track.id, "audio_only")}
                              className="text-[11px] text-zinc-400 hover:text-cyan-300"
                            >
                              Use Audio Only
                            </Button>
                          )}
                        </div>
                      )}
                      {track.kind === "audio" && (
                        <Button
                          type="button"
                          size="sm"
                          aria-label="Add Audio"
                          onClick={() => setMediaTrackId(track.id)}
                          className="h-7 px-2.5 text-xs font-medium border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Plus size={12} />
                          <span>Add Audio</span>
                        </Button>
                      )}
                      {track.kind === "captions" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!onAutoSyncCaptions || isSyncingCaptions}
                            onClick={() => onAutoSyncCaptions?.()}
                            className="h-7 px-3 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Automatically transcribe speech and generate synchronized captions"
                          >
                            {isSyncingCaptions ? (
                              <>
                                <Loader2 size={12} className="animate-spin text-zinc-950" />
                                <span>Transcribing Speech…</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={12} />
                                <span>Generate AI Captions</span>
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onEditCaptions?.()}
                            className="h-7 px-2.5 text-xs font-medium border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg flex items-center gap-1.5"
                          >
                            <Type size={12} className="text-zinc-400" />
                            <span>Manual Transcript</span>
                          </Button>
                        </>
                      )}
                      {track.kind === "music" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onOpenTrackPanel?.("music")}
                          className="h-7 px-3 text-xs font-semibold border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 rounded-lg flex items-center gap-1.5"
                        >
                          <Volume2 size={12} />
                          <span>Open BGM Library / Add Music</span>
                        </Button>
                      )}
                      {track.kind === "overlay" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setMediaTrackId(track.id)}
                          className="h-7 px-3 text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 rounded-lg flex items-center gap-1.5"
                        >
                          <Plus size={12} />
                          <span>Add Background Video / Photos</span>
                        </Button>
                      )}
                    </div>
                  )}
                  {timeline.clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => {
                      const asset = timeline.assets.find(
                        (a) => a.id === clip.assetId,
                      );
                      const storedPreview = previews[clip.assetId || ""];
                      const preview = storedPreview?.sourceUrl === asset?.fileUrl ? storedPreview : undefined;
                      const selectedClip = linkedSelection(
                        timeline,
                        selected,
                      ).has(clip.id);
                      return (
                        <div
                          key={clip.id}
                          tabIndex={0}
                          role="group"
                          aria-roledescription="timeline clip"
                          aria-label={`Clip: ${clip.name}`}
                          aria-describedby={`clip-selection-${clip.id}`}
                          title={`${clip.name}\n${clock(clip.startMs)} → ${clock(clip.startMs + clip.durationMs)}\nDouble click to edit · S to split`}
                          onDoubleClick={() => {
                            setInspector(structuredClone(clip));
                            setError("");
                          }}
                          onPointerDown={(e) => { clearThumbnailHover(); startDrag(e, clip); }}
                          onPointerMove={e => {
                            move(e);
                            if (e.buttons || e.pointerType === 'touch' || drag.current || asset?.mediaType !== 'video' || ['audio', 'music', 'captions'].includes(track.kind)) { clearThumbnailHover(); return; }
                            const localMs = (e.clientX - e.currentTarget.getBoundingClientRect().left) / px;
                            showThumbnailHover({ fileUrl: asset.fileUrl, name: clip.name, sourceMs: clipSourceTime(clip, localMs, preview?.durationMs || asset.durationMs),
                              timelineMs: clip.startMs + Math.max(0, Math.min(clip.durationMs, localMs)), durationMs: clip.durationMs, x: e.clientX, y: e.clientY });
                          }}
                          onPointerLeave={clearThumbnailHover}
                          onPointerUp={finish}
                          onPointerCancel={() => {
                            drag.current = null;
                            setDraft(null);
                          }}
                          data-timeline-clip="true"
                          data-clip-id={clip.id}
                          className={`absolute bottom-1 top-1 cursor-grab touch-none select-none overflow-hidden rounded-md border ${colors[track.kind]} ${selectedClip ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-black z-10" : ""} ${track.locked ? "cursor-not-allowed" : ""}`}
                          style={{
                            left: clip.startMs * px,
                            width: Math.max(3, clip.durationMs * px),
                          }}
                        >
                          <span id={`clip-selection-${clip.id}`} className="sr-only">{selectedClip ? 'Selected' : 'Not selected'}</span>
                          {asset?.mediaType === "image" ? (
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 opacity-60"
                              style={{
                                backgroundImage: `url(${JSON.stringify(asset.fileUrl)})`,
                                backgroundSize: "auto 100%",
                                backgroundRepeat: "repeat-x",
                                backgroundPosition: "left center",
                              }}
                            />
                          ) : asset?.mediaType === 'video' && !['audio', 'music', 'captions'].includes(track.kind) && preview ? (
                            <VideoThumbnailStrip clip={clip} preview={preview} pixelsPerMs={px} height={trackHeight}
                              visibleStartMs={(viewport.left - 160) / px} visibleEndMs={(viewport.left + viewport.width) / px} />
                          ) : null}
                          {preview?.peaks.length &&
                          audioTrack(track) && asset?.hasAudio !== false ? (
                            <svg
                              className="pointer-events-none absolute bottom-0 h-2/3 w-full opacity-70"
                              preserveAspectRatio="none"
                              viewBox="0 0 200 40"
                            >
                              <path
                                fill="currentColor"
                                className="text-emerald-300"
                                d={waveforms.get(clip.id)}
                              />
                            </svg>
                          ) : null}
                          {preview?.hasAudio && audioTrack(track) && <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 h-2/3 w-full" viewBox="0 0 200 40" preserveAspectRatio="none">
                            <polyline fill="none" stroke="#fbbf24" strokeWidth="1" points={Array.from({ length: 41 }, (_, i) => {
                              const local = Math.min(clip.durationMs - 1, clip.durationMs * i / 40);
                              return `${i * 5},${39 - audioGain({ ...clip, muted: false }, clip.startMs + local, asset?.durationMs) * 19}`;
                            }).join(' ')} />
                          </svg>}
                          {track.kind === 'captions' && <div title="Drag caption clip" aria-hidden="true" className="absolute inset-x-2 top-0 z-20 h-1 cursor-grab bg-amber-300/30" onPointerDown={e => startDrag(e, clip)} />}
                          {track.kind === 'captions' && clip.assetId && <TimelineCaptionWords clip={clip} groups={captionClipGroups(project, timeline, clip)}
                            pixelsPerMs={px} currentMs={currentTime * 1000} fps={timeline.fps} disabled={track.locked || !onCaptionSourceChange || isSyncingCaptions || lockedCaptionAssets.has(clip.assetId)} onSelect={() => setSelected([clip.id])}
                            visibleStartMs={(viewport.left - 160) / px - 500} visibleEndMs={(viewport.left + viewport.width) / px + 500}
                            onSeek={onSeek} onError={setError} onChange={groups => {
                              try { onCaptionSourceChange?.(clip.assetId!, groups); setError(''); }
                              catch (error) { setError(error instanceof Error ? error.message : 'Unable to edit captions'); }
                            }} />}
                          {asset?.mediaType === 'video' && !['audio', 'music', 'captions'].includes(track.kind) && (!preview || !preview.thumbnails.length) && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-zinc-900/40 px-2 text-[9px] text-zinc-400">
                              <span role="status">{previewStatus[asset.id] === 'error' || previewStatus[asset.id] === 'ready' ? 'Thumbnails unavailable' : previewStatus[asset.id] === 'processing' ? 'Processing thumbnails…' : asset.fileUrl.startsWith('/api/files/') ? 'Thumbnails queued…' : 'Thumbnails unavailable'}</span>
                              {previewStatus[asset.id] === 'error' && <Button type="button" className="rounded border border-zinc-600 px-1 text-[9px]" aria-label={`Retry thumbnails for ${clip.name}`}
                                onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setPreviewRetry(value => value + 1); }}>Retry</Button>}
                            </div>
                          )}
                          <span data-timeline-clip-label="true" className={`${track.kind === 'captions' ? 'hidden' : ''} pointer-events-none relative block truncate bg-black/30 px-2 py-1 text-[10px] font-medium text-white`}>
                            {clip.linkId ? "↔ " : ""}
                            {track.kind === "video" && getMainVideoMode(track) === "audio_only" ? "🎵 [Audio Only BG] " : ""}
                            {clip.text?.value || clip.name}
                            {clip.transitionIn === "crossfade" && (track.kind === "video" || track.kind === "intro") && (
                              <span className="ml-1 text-amber-200">· Dissolve {clip.fadeInMs} ms</span>
                            )}
                          </span>
                          {selectedClip && track.kind === "video" && (
                            <div className="absolute top-1 right-2 z-20 flex items-center gap-1 pointer-events-auto">
                              {getMainVideoMode(track) === "audio_only" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  aria-label="Change Background (Video / Image)"
                                  title="Upload or choose a different background video or image"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerBackgroundMediaUpload(track.id);
                                  }}
                                  className="h-5 px-2 text-[9px] font-semibold bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-200 border border-cyan-500/60 rounded flex items-center gap-1 shadow cursor-pointer"
                                >
                                  <Upload size={10} />
                                  <span>Change Background</span>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  aria-label="Switch to Audio Only"
                                  title="Switch to Audio Only to use a different video or image background"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSwitchMainVideoMode(track.id, "audio_only");
                                  }}
                                  className="h-5 px-2 text-[9px] font-semibold bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 border border-zinc-700 rounded flex items-center gap-1 shadow cursor-pointer"
                                >
                                  <Volume2 size={10} />
                                  <span>Audio Only</span>
                                </Button>
                              )}
                            </div>
                          )}
                          {selectedClip && audioTrack(track) && asset?.mediaType !== 'image' && preview?.hasAudio && (
                            <AudioClipControls clip={clip} disabled={track.locked}
                              onBegin={() => { cancelHover(); clearThumbnailHover(); audioGesture.current = { base: timeline }; }}
                              onEdit={patch => {
                                const base = audioGesture.current?.base || timeline;
                                const next = { ...base, clips: base.clips.map(c => c.id === clip.id ? { ...c, ...patch } : c) };
                                if (audioGesture.current) {
                                  try { audioGesture.current.next = commitTimeline(next); setDraft(audioGesture.current.next); }
                                  catch (e) { setError(e instanceof Error ? e.message : 'Invalid audio edit'); }
                                } else run(() => next);
                              }}
                              onEnd={() => { const next = audioGesture.current?.next; audioGesture.current = null; setDraft(null); if (next) run(() => next); }}
                              onCancel={() => { audioGesture.current = null; setDraft(null); }} />
                          )}
                          <span data-timeline-clip-duration="true" className="pointer-events-none absolute bottom-0 right-2 text-[8px] text-white/60">
                            {(clip.durationMs / 1000).toFixed(1)}s
                            {clip.motion ? ' · ◆ motion' : ''}
                            {clip.muted ? " · muted" : ""}
                          </span>
                          <div
                            title="Trim start"
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/15 hover:bg-amber-300/70"
                            onPointerDown={(e) => startDrag(e, clip, "left")}
                          />
                          <div
                            title="Trim end"
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/15 hover:bg-amber-300/70"
                            onPointerDown={(e) => startDrag(e, clip, "right")}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
      <div className="flex justify-between border-t border-zinc-800 px-3 py-1 text-[9px] text-zinc-500">
        <span>
          Drag to move · Edge to trim · Double click to edit · Ctrl+click
          multi-select · S split
        </span>
        <span className="hidden sm:block">
          {timeline.clips.length} clips · {timeline.fps} fps ·{" "}
          {project.timeline?.enabled
            ? "Multi-track composition"
            : "Original project · edits enable composition"}
        </span>
      </div>
      {mediaTrackId && (() => {
        const track = timeline.tracks.find(track => track.id === mediaTrackId);
        if (!track) return null;
        return <TimelineMediaPicker key={track.id} track={track} assets={projectTimelineAssets(project)}
          onDelete={onRemoveMedia}
          onClose={() => setMediaTrackId(null)}
          onAdd={assetId => {
            const isTimelineEmpty = timeline.clips.length === 0;
            const startMs = isTimelineEmpty ? 0 : (trackEnds.get(track.id) || 0);
            addAsset(track.id, assetId, startMs);
            if (isTimelineEmpty) {
              onSeek(0);
              const asset = projectTimelineAssets(project).find(a => a.id === assetId);
              if (asset?.durationMs && scroll.current) {
                const totalDurationSec = asset.durationMs / 1000;
                const fitZoom = Math.max(5, Math.min(200, (scroll.current.clientWidth - 160) / (totalDurationSec + 2)));
                setZoom(fitZoom);
              }
            }
            setMediaTrackId(null);
          }}
          onUpload={asset => {
            const isTimelineEmpty = timeline.clips.length === 0;
            const startMs = isTimelineEmpty ? 0 : (trackEnds.get(track.id) || 0);
            const all = [
              ...projectTimelineAssets(project).filter(existing => existing.id !== asset.id),
              asset,
            ];
            const clipDuration = Math.max(
              Math.floor(1000 / timeline.fps),
              Math.floor(
                (Math.floor(
                  ((asset.mediaType === "image" ? 3000 : asset.durationMs || 3000) * timeline.fps) / 1000
                ) * 1000) / timeline.fps
              )
            );
            const clip = createTimelineClip(
              track,
              asset,
              frameTime(startMs, timeline.fps),
              clipDuration
            );
            run(() => ({
              ...timeline,
              assets: all,
              clips: [...timeline.clips, clip],
            }));
            if (isTimelineEmpty) {
              onSeek(0);
              if (asset.durationMs > 0 && scroll.current) {
                const totalDurationSec = asset.durationMs / 1000;
                const fitZoom = Math.max(5, Math.min(200, (scroll.current.clientWidth - 160) / (totalDurationSec + 2)));
                setZoom(fitZoom);
              }
            }
            setMediaTrackId(null);
          }}/>;
      })()}
      {trackSettingsForm && (onOpenTrackPanel
        ? trackSettingsTarget && createPortal(trackSettingsForm, trackSettingsTarget)
        : <DialogSurface asChild onClose={() => setTrackEditor(null)} aria-describedby={undefined} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            {trackSettingsForm}
          </DialogSurface>
      )}
      {inspector && (
        <DialogSurface asChild onClose={() => setInspector(null)} aria-describedby={undefined} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const existing = timeline.clips.find(
                  (c) => c.id === inspector.id,
                )!;
                if (
                  timeline.tracks.find((t) => t.id === existing.trackId)?.locked
                )
                  throw new Error("Unlock this track first.");
                const submitter = (e.nativeEvent as SubmitEvent).submitter;
                if (submitter instanceof HTMLButtonElement && submitter.value === 'natural-boundary') {
                  const fields = new FormData(e.currentTarget);
                  const kind = fields.get('naturalBoundary');
                  const duration = Number(fields.get('naturalDuration'));
                  if (!naturalTransitionKinds.includes(kind as NaturalTransitionKind) || !Number.isInteger(duration) || duration < 67 || duration > 600) {
                    throw new Error('Choose a valid transition and a duration from 67 to 600 ms.');
                  }
                  onChange(setNaturalTimelineBoundary(timeline, existing.id, kind as NaturalTransitionKind, duration));
                  setInspector(null); setError('');
                  return;
                }
                const related = linkedSelection(timeline, [existing.id]);
                const next = commitTimeline({
                  ...timeline,
                  clips: timeline.clips.map((c) =>
                    c.id === inspector.id
                      ? inspector
                      : related.has(c.id)
                        ? {
                            ...c,
                            startMs:
                              c.startMs + inspector.startMs - existing.startMs,
                            sourceStartMs:
                              c.sourceStartMs +
                              inspector.sourceStartMs -
                              existing.sourceStartMs,
                            durationMs: inspector.durationMs,
                          }
                        : c,
                  ),
                });
                onChange(next);
                setInspector(null);
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Invalid clip");
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Edit timeline clip"
            className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
          >
            <DialogTitle asChild><h2 className="text-base font-semibold text-amber-300">
              Edit clip
            </h2></DialogTitle>
            {(() => {
              const asset = timeline.assets.find(
                (a) => a.id === inspector.assetId,
              );
              if (!asset || asset.mediaType === "image") return null;
              const props = {
                src: asset.fileUrl,
                controls: true,
                preload: "metadata",
                onLoadedMetadata: (
                  e: React.SyntheticEvent<HTMLMediaElement>,
                ) => {
                  e.currentTarget.currentTime = inspector.sourceStartMs / 1000;
                },
                onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
                  if (
                    e.currentTarget.currentTime >=
                    (inspector.sourceStartMs + inspector.durationMs) / 1000
                  ) {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime =
                      inspector.sourceStartMs / 1000;
                  }
                },
              };
              return asset.mediaType === "video" ? (
                <video
                  {...props}
                  className="max-h-40 w-full rounded bg-black"
                />
              ) : (
                <audio {...props} className="w-full" />
              );
            })()}

            <label className="block space-y-1">
              Name
              <Input
                value={inspector.name}
                onChange={(e) =>
                  setInspector({ ...inspector, name: e.target.value })
                }
                className="block w-full rounded border border-zinc-700 bg-zinc-900 p-2"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["startMs", "Timeline start"],
                  ["sourceStartMs", "Source in"],
                  ["durationMs", "Duration"],
                  ["fadeInMs", "Fade in"],
                  ["fadeOutMs", "Fade out"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label} (s)
                  <Input
                    type="number"
                    min="0"
                    step={1 / timeline.fps}
                    value={inspector[key] / 1000}
                    onChange={(e) =>
                      setInspector({
                        ...inspector,
                        [key]: frameTime(
                          Number(e.target.value) * 1000,
                          timeline.fps,
                        ),
                      })
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
                  />
                </label>
              ))}
              <label>
                Volume (%)
                <Input
                  type="number"
                  min="0"
                  max="200"
                  value={Math.round(inspector.volume * 100)}
                  onChange={(e) =>
                    setInspector({
                      ...inspector,
                      volume: Number(e.target.value) / 100,
                    })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
                />
              </label>
            </div>
            {(() => {
              const asset = timeline.assets.find(a => a.id === inspector.assetId);
              const track = timeline.tracks.find(t => t.id === inspector.trackId);
              return track && audioTrack(track) && asset && asset.mediaType !== 'image' ? <AudioClipInspector
                clip={inspector} asset={asset} currentMs={currentTime * 1000} fps={timeline.fps} music={track.kind === 'music'}
                onChange={setInspector} canDetach={!track.locked && previews[asset.id]?.sourceUrl === asset.fileUrl && previews[asset.id]?.hasAudio === true && ['video', 'intro', 'overlay'].includes(track.kind)}
                onResync={() => run(() => { const next = resyncDetachedAudio({ ...timeline, clips: timeline.clips.map(c => c.id === inspector.id ? inspector : c) }, inspector.id); setInspector(null); return next; })}
                onDetach={() => run(() => {
                  const next = detachTimelineAudio({ ...timeline, assets: timeline.assets.map(a => a.id === asset.id ? { ...a, hasAudio: true } : a), clips: timeline.clips.map(c => c.id === inspector.id ? inspector : c) }, inspector.id);
                  setInspector(null); return next;
                })} /> : null;
            })()}
            {timeline.tracks.some(t => t.id === inspector.trackId && !['audio', 'music'].includes(t.kind)) &&
              <ClipMotionInspector clip={inspector} currentMs={currentTime * 1000} clipboard={motionClipboard} onCopy={setMotionClipboard} onChange={setInspector} />}
            <div className="flex gap-4">
              <label>
                <input
                  type="checkbox"
                  checked={inspector.muted}
                  onChange={(e) =>
                    setInspector({ ...inspector, muted: e.target.checked })
                  }
                />{" "}
                Mute
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={inspector.loop}
                  onChange={(e) =>
                    setInspector({ ...inspector, loop: e.target.checked })
                  }
                />{" "}
                Loop source
              </label>
            </div>
            <label className="block">
              Transition
              <select
                value={inspector.transitionIn}
                onChange={(e) =>
                  setInspector({
                    ...inspector,
                    transitionIn: e.target
                      .value as TimelineClip["transitionIn"],
                    naturalTransition: undefined,
                  })
                }
                className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-2"
              >
                {["cut", "fade", "crossfade", "slide", "zoom"].map((value) => (
                  <option key={value} value={value}>{({ cut: 'Clean cut', fade: 'Fade', crossfade: 'Crossfade / dissolve', slide: 'Slide', zoom: 'Subtle zoom' })[value as TimelineClip["transitionIn"]]}</option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-zinc-500">
              Use Fade in / out for transition duration. Crossfade requires an
              overlap of the same duration on a video track.
            </p>
            {timeline.tracks.some(track => track.id === inspector.trackId && ['video', 'intro'].includes(track.kind)) &&
              timeline.clips.some(clip => clip.trackId === inspector.trackId && clip.startMs < inspector.startMs) && (
                <fieldset className="space-y-2 rounded border border-zinc-800 p-2">
                  <legend className="text-xs">Natural boundary transition</legend>
                  <Select name="naturalBoundary" defaultValue={inspector.naturalTransition?.kind ?? (inspector.transitionIn === 'crossfade' ? 'crossfade' : 'cut')}>
                    <SelectTrigger aria-label="Natural transition type"><SelectValue /></SelectTrigger>
                    <SelectContent>{naturalTransitionKinds.map(kind => <SelectItem key={kind} value={kind}>{naturalTransitionNames[kind]}</SelectItem>)}</SelectContent>
                  </Select>
                  <label className="ml-2">Blend (ms) <input name="naturalDuration" type="number" min={67} max={600}
                    defaultValue={Math.min(600, Math.max(67, inspector.fadeInMs || timeline.naturalTransitionSettings?.durationMs || 200))} className="ml-1 w-20 rounded bg-zinc-900 p-1" /></label>
                  {inspector.naturalTransition && <p className="text-xs text-zinc-400">{inspector.naturalTransition.reason}</p>}
                  <Button type="submit" value="natural-boundary" size="sm" variant="secondary">Apply boundary transition</Button>
                </fieldset>
              )}
            {inspector.text && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    Font
                    <Input
                      className="mt-1 w-full rounded bg-zinc-900 p-2"
                      value={inspector.text.fontFamily}
                      onChange={(e) =>
                        setInspector({
                          ...inspector,
                          text: {
                            ...inspector.text!,
                            fontFamily: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Background color
                    <Input
                      className="mt-1 w-full rounded bg-zinc-900 p-2"
                      value={inspector.text.background}
                      onChange={(e) =>
                        setInspector({
                          ...inspector,
                          text: {
                            ...inspector.text!,
                            background: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <label className="block">
                  Text
                  <Textarea
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
                    value={inspector.text.value}
                    onChange={(e) =>
                      setInspector({
                        ...inspector,
                        text: { ...inspector.text!, value: e.target.value },
                      })
                    }
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["fontSize", "x", "y"] as const).map((key) => (
                    <label key={key}>
                      {key}
                      <Input
                        type="number"
                        className="w-full rounded bg-zinc-900 p-2"
                        value={inspector.text![key]}
                        onChange={(e) =>
                          setInspector({
                            ...inspector,
                            text: {
                              ...inspector.text!,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Text color
                    <input
                      type="color"
                      value={inspector.text.color}
                      onChange={(e) =>
                        setInspector({
                          ...inspector,
                          text: { ...inspector.text!, color: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-rose-300">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  onSeek(Math.max(0, inspector.startMs / 1000 - (inspector.naturalTransition ? 0.65 : 0)));
                  if (!isPlaying) onTogglePlay();
                }}
                className={button}
              >
                Preview
              </Button>
              <Button
                type="button"
                onClick={() => setInspector(null)}
                className={button}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded bg-amber-400 px-4 py-2 font-bold text-black"
              >
                Apply
              </Button>
            </div>
          </form>
        </DialogSurface>
      )}
      {pendingVideoFile && (
        <DialogSurface
          asChild
          onClose={() => setPendingVideoFile(null)}
          aria-describedby={undefined}
          overlayClassName="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-5 shadow-2xl text-left">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle asChild>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-amber-400" />
                    Video Import Mode
                  </h3>
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-1 truncate max-w-xs">
                  {pendingVideoFile.name} ({(pendingVideoFile.size / (1024 * 1024)).toFixed(1)} MB)
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={() => setPendingVideoFile(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </Button>
            </div>

            <p className="text-xs text-zinc-300">
              Choose how you want to add this video to your Reel Maker timeline:
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  const file = pendingVideoFile;
                  setPendingVideoFile(null);
                  void handleDirectMediaUpload(file, "video_and_audio");
                }}
                className="w-full p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-left transition-all cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-amber-400/20 text-amber-300 shrink-0 mt-0.5">
                  <Film size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-200">1. Video + Original Audio</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-400 text-zinc-950">Recommended</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                    Use uploaded video for both footage visuals and original synchronized sound.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  const file = pendingVideoFile;
                  setPendingVideoFile(null);
                  void handleDirectMediaUpload(file, "audio_only");
                }}
                className="w-full p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-left transition-all cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 shrink-0 mt-0.5">
                  <Volume2 size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-100">2. Audio Only from Video</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Extract Voice</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    Extract voice/audio to Main Audio track without video visuals. Lets you add separate background videos or photos.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  const file = pendingVideoFile;
                  setPendingVideoFile(null);
                  void handleDirectMediaUpload(file, "video_only");
                }}
                className="w-full p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-left transition-all cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300 shrink-0 mt-0.5">
                  <VolumeX size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-100">3. Video Only (Mute Audio)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Silent Visuals</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    Use video footage as visuals with sound muted. Ideal for adding voiceover or background music.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPendingVideoFile(null)}
                className="text-xs text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogSurface>
      )}
    </section>
  );
}
