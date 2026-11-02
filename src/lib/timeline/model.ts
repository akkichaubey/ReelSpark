import type {
  CaptionProject,
  CaptionGroup,
  TranscriptWord,
  ImageFitMode,
  ImagePosition,
  SfxCue,
} from "../caption-maker/types";
import { validMotion, type ClipMotion } from './motion';

export type TrackKind =
  "video" | "intro" | "overlay" | "audio" | "music" | "text" | "captions";
export type TransitionKind = "cut" | "fade" | "crossfade" | "slide" | "zoom";
export interface TimelineAsset {
  id: string;
  fileUrl: string;
  fileName: string;
  mediaType: "video" | "audio" | "image";
  durationMs: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  fitMode?: ImageFitMode;
  position?: ImagePosition;
  scale?: number;
}
export interface TimelineTrack {
  id: string;
  name: string;
  kind: TrackKind;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo?: boolean;
  height: number;
}
export interface TimelineText {
  value: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string;
  x: number;
  y: number;
}
export interface TimelineClip {
  motion?: ClipMotion;
  id: string;
  trackId: string;
  assetId?: string;
  name: string;
  startMs: number;
  sourceStartMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  transitionIn: TransitionKind;
  linkId?: string;
  text?: TimelineText;
  ducking?: boolean;
  audioFadeInMs?: number;
  audioFadeOutMs?: number;
  /** Source-relative automation; retained across trim/split/slip edits. */
  audioKeyframes?: { timeMs: number; gain: number }[];
  detachedFromId?: string;
}
export interface ReelTimeline {
  version: 1;
  enabled: boolean;
  fps: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  assets: TimelineAsset[];
  captionSources: Record<
    string,
    {
      transcript: TranscriptWord[];
      captionGroups: CaptionGroup[];
      sfxCues?: SfxCue[];
    }
  >;
  markers: { id: string; timeMs: number; name: string }[];
}
export interface TimelinePlan {
  timeline: ReelTimeline;
  durationMs: number;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  sfxCues?: SfxCue[];
}
export const makeTimelineId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID()}`;
export const frameTime = (ms: number, fps: number) =>
  Math.round((Math.round((ms * fps) / 1000) * 1000) / fps);
export const timelineEnd = (timeline: ReelTimeline) =>
  timeline.clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0,
  );
export const visualTrack = (kind: TrackKind) =>
  ["video", "intro", "overlay", "text", "captions"].includes(kind);
export const compatibleAsset = (kind: TrackKind, asset: TimelineAsset) =>
  ["video", "intro", "overlay"].includes(kind)
    ? asset.mediaType !== "audio"
    : ["audio", "music"].includes(kind)
      ? asset.mediaType !== "image" && asset.hasAudio !== false
      : kind === "captions" && asset.mediaType !== "image";

export function projectTimelineAssets(
  project: CaptionProject,
): TimelineAsset[] {
  const assets = new Map<string, TimelineAsset>(
    (project.timeline?.assets || []).map((asset) => [asset.id, asset]),
  );
  for (const image of [
    ...(project.mediaAssets || []),
    ...(project.image ? [project.image] : []),
  ]) {
    assets.set(image.id, {
      id: image.id,
      fileUrl: image.fileUrl,
      fileName: image.fileName,
      mediaType: image.mediaType || "image",
      durationMs: Math.round(
        (image.duration || project.audio?.duration || 30) * 1000,
      ),
      width: image.width,
      height: image.height,
      fitMode: image.fitMode,
      position: image.position,
      scale: image.scale,
      hasAudio: image.mediaType === "video",
    });
  }
  if (project.audio)
    assets.set(project.audio.id, {
      id: project.audio.id,
      fileUrl: project.audio.fileUrl,
      fileName: project.audio.fileName,
      mediaType: "audio",
      durationMs: Math.round(project.audio.duration * 1000),
      hasAudio: true,
    });
  if (project.bgMusic)
    assets.set(project.bgMusic.id, {
      id: project.bgMusic.id,
      fileUrl: project.bgMusic.fileUrl,
      fileName: project.bgMusic.title,
      mediaType: "audio",
      durationMs: 0,
      hasAudio: true,
    });
  return [...assets.values()];
}

/** Keep the existing source/mixer controls connected to a composed project. */
export function synchronizeTimelineSources(
  previous: CaptionProject,
  next: CaptionProject,
): CaptionProject {
  if (previous === next || !next.timeline?.enabled) return next;
  const captionSources = { ...next.timeline.captionSources };
  if (previous.audio && previous.audio.id !== next.audio?.id)
    captionSources[previous.audio.id] = {
      transcript: previous.transcript,
      captionGroups: previous.captionGroups,
      sfxCues: previous.sfxCues,
    };
  const ratio = (value: number, before: number, after: number) =>
    Math.min(2, Math.max(0, before > 0 ? (value * after) / before : after));
  const clips = next.timeline.clips.flatMap((clip) => {
    const kind = next.timeline!.tracks.find(
      (track) => track.id === clip.trackId,
    )?.kind;
    if (
      kind === "music" &&
      previous.bgMusic &&
      clip.assetId === previous.bgMusic.id &&
      previous.bgMusic.id !== next.bgMusic?.id
    )
      return next.bgMusic
        ? [
            {
              ...clip,
              assetId: next.bgMusic.id,
              volume: next.bgMusic.volume,
              muted: Boolean(next.bgMusic.muted),
              sourceStartMs: Math.round((next.bgMusic.startOffset || 0) * 1000),
              loop: true,
              ducking: next.bgMusic.autoDucking !== false,
            },
          ]
        : [];
    if (next.audio && clip.assetId === next.audio.id && kind === "audio")
      return [
        {
          ...clip,
          ...(previous.voiceVolume !== next.voiceVolume
            ? {
                volume: ratio(
                  clip.volume,
                  previous.voiceVolume ?? 1,
                  next.voiceVolume ?? 1,
                ),
              }
            : {}),
          ...(previous.voiceMuted !== next.voiceMuted
            ? { muted: Boolean(next.voiceMuted) }
            : {}),
        },
      ];
    if (
      next.bgMusic &&
      clip.assetId === next.bgMusic.id &&
      previous.bgMusic !== next.bgMusic
    )
      return [
        {
          ...clip,
          volume: ratio(
            clip.volume,
            previous.bgMusic?.volume ?? next.bgMusic.volume,
            next.bgMusic.volume,
          ),
          muted: Boolean(next.bgMusic.muted),
          ducking: next.bgMusic.autoDucking !== false,
          ...(previous.bgMusic?.fadeInDuration !== next.bgMusic.fadeInDuration
            ? {
                fadeInMs: Math.min(
                  Math.floor(clip.durationMs / 2),
                  Math.round((next.bgMusic.fadeInDuration || 0) * 1000),
                ),
              }
            : {}),
          ...(previous.bgMusic?.fadeOutDuration !== next.bgMusic.fadeOutDuration
            ? {
                fadeOutMs: Math.min(
                  Math.floor(clip.durationMs / 2),
                  Math.round((next.bgMusic.fadeOutDuration || 0) * 1000),
                ),
              }
            : {}),
        },
      ];
    return [clip];
  });
  let tracks = next.timeline.tracks;
  if (
    next.bgMusic &&
    previous.bgMusic?.id !== next.bgMusic.id &&
    !clips.some((clip) => clip.assetId === next.bgMusic!.id) &&
    timelineEnd(next.timeline) > 0
  ) {
    let track = tracks.find((track) => track.kind === "music" && !track.locked);
    if (!track && tracks.length < 32) {
      track = createTimelineTrack("music");
      tracks = [...tracks, track];
    }
    if (track) {
      const asset = projectTimelineAssets(next).find(
        (asset) => asset.id === next.bgMusic!.id,
      )!;
      clips.push({
        ...createTimelineClip(track, asset, 0, timelineEnd(next.timeline)),
        volume: next.bgMusic.volume,
        muted: Boolean(next.bgMusic.muted),
        loop: true,
        ducking: next.bgMusic.autoDucking !== false,
        sourceStartMs: Math.round((next.bgMusic.startOffset || 0) * 1000),
      });
    }
  }
  return {
    ...next,
    timeline: {
      ...next.timeline,
      tracks,
      assets: projectTimelineAssets(next),
      clips,
      captionSources,
    },
  };
}

export function createTimelineTrack(
  kind: TrackKind,
  name?: string,
): TimelineTrack {
  const names: Record<TrackKind, string> = {
    video: "Main video",
    intro: "Intro / Outro",
    overlay: "Overlay",
    audio: "Spoken voice",
    music: "Background music",
    text: "Text overlay",
    captions: "Captions",
  };
  return {
    id: makeTimelineId("track"),
    kind,
    name: name || names[kind],
    locked: false,
    hidden: false,
    muted: false,
    height: 52,
  };
}
export function createTimelineClip(
  track: TimelineTrack,
  asset: TimelineAsset | undefined,
  startMs: number,
  durationMs: number,
): TimelineClip {
  return {
    id: makeTimelineId("clip"),
    trackId: track.id,
    assetId: asset?.id,
    name: asset?.fileName || "Your text",
    startMs,
    sourceStartMs: 0,
    durationMs,
    volume: 1,
    muted: false,
    loop: asset?.mediaType === "image",
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: "cut",
    ...(track.kind === "text"
      ? {
          text: {
            value: "Your text",
            fontFamily: "Arial",
            fontSize: 64,
            color: "#ffffff",
            background: "#00000000",
            x: 50,
            y: 50,
          },
        }
      : {}),
  };
}

/** A legacy project stays untouched until a real multi-track edit is committed. */
export function timelineFromProject(project: CaptionProject): ReelTimeline {
  if (project.timeline) return project.timeline;
  const captions = { ...createTimelineTrack("captions"), id: "track_captions" };
  const video = { ...createTimelineTrack("video"), id: "track_video" };
  const voice = { ...createTimelineTrack("audio"), id: "track_voice" };
  const music = { ...createTimelineTrack("music"), id: "track_music" };
  const assets = projectTimelineAssets(project);
  const sourceStart = Math.round((project.trimRange?.start || 0) * 1000);
  const duration = Math.max(
    0,
    Math.round(
      (project.trimRange?.end ||
        project.audio?.duration ||
        project.image?.duration ||
        0) *
        1000 -
        sourceStart,
    ),
  );
  const clips: TimelineClip[] = [];
  const add = (
    track: TimelineTrack,
    id: string,
    options: Partial<TimelineClip>,
  ) => {
    const asset = assets.find((item) => item.id === id);
    if (!asset || !duration) return;
    clips.push({
      ...createTimelineClip(track, asset, 0, duration),
      id: `clip_${track.id}`,
      sourceStartMs: sourceStart,
      ...options,
    });
  };
  if (project.image)
    add(video, project.image.id, {
      muted: Boolean(project.audio) || project.image.muteSourceAudio === true,
      loop: true,
    });
  if (project.audio) {
    add(voice, project.audio.id, {
      volume: project.voiceVolume ?? 1,
      muted: Boolean(project.voiceMuted),
      linkId: "primary_voice",
    });
    if (project.transcript.length || project.captionGroups.length)
      add(captions, project.audio.id, { linkId: "primary_voice" });
  }
  if (project.bgMusic)
    add(music, project.bgMusic.id, {
      sourceStartMs: Math.round(
        ((project.bgMusic.startOffset || 0) + sourceStart / 1000) * 1000,
      ),
      loop: true,
      volume: project.bgMusic.volume,
      muted: Boolean(project.bgMusic.muted),
      ducking: project.bgMusic.autoDucking !== false,
      fadeInMs: Math.min(
        Math.floor(duration / 2),
        Math.round((project.bgMusic.fadeInDuration || 0) * 1000),
      ),
      fadeOutMs: Math.min(
        Math.floor(duration / 2),
        Math.round((project.bgMusic.fadeOutDuration || 0) * 1000),
      ),
    });
  return {
    version: 1,
    enabled: false,
    fps: project.outputSettings.fps || 30,
    tracks: [captions, video, voice, music],
    clips,
    assets,
    markers: [],
    captionSources: project.audio
      ? {
          [project.audio.id]: {
            transcript: project.transcript,
            captionGroups: project.captionGroups,
            sfxCues: project.sfxCues,
          },
        }
      : {},
  };
}

export function validateTimeline(timeline: ReelTimeline): string[] {
  const errors: string[] = [];
  if (
    !timeline ||
    !Array.isArray(timeline.tracks) ||
    !Array.isArray(timeline.clips) ||
    !Array.isArray(timeline.assets) ||
    !Array.isArray(timeline.markers) ||
    !timeline.captionSources ||
    typeof timeline.captionSources !== "object"
  )
    return ["Invalid timeline document."];
  const safeId = (value: unknown) =>
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
  if (
    [
      ...timeline.tracks,
      ...timeline.clips,
      ...timeline.assets,
      ...timeline.markers,
    ].some((item) => !item || !safeId(item.id))
  )
    return ["Invalid timeline IDs."];
  if (
    timeline.tracks.some(
      (track) =>
        typeof track.name !== "string" ||
        typeof track.locked !== "boolean" ||
        typeof track.hidden !== "boolean" ||
        typeof track.muted !== "boolean",
    ) ||
    timeline.clips.some(
      (clip) =>
        typeof clip.name !== "string" ||
        typeof clip.loop !== "boolean" ||
        typeof clip.muted !== "boolean",
    ) ||
    timeline.markers.some((marker) => typeof marker.name !== "string")
  )
    return ["Invalid track or clip settings."];
  if (timeline.tracks.some(track => track.solo !== undefined && typeof track.solo !== 'boolean'))
    errors.push('Invalid track solo setting.');
  for (const clip of timeline.clips) {
    if (clip.motion !== undefined && !validMotion(clip.motion)) errors.push('Invalid clip animation keyframes.');
    if ((clip.audioFadeInMs !== undefined && (!Number.isSafeInteger(clip.audioFadeInMs) || clip.audioFadeInMs < 0)) ||
      (clip.audioFadeOutMs !== undefined && (!Number.isSafeInteger(clip.audioFadeOutMs) || clip.audioFadeOutMs < 0)) ||
      ((clip.audioFadeInMs !== undefined || clip.audioFadeOutMs !== undefined) && (clip.audioFadeInMs ?? 0) + (clip.audioFadeOutMs ?? 0) > clip.durationMs))
      errors.push('Invalid audio fade duration.');
    if (clip.audioKeyframes !== undefined && (!Array.isArray(clip.audioKeyframes) || clip.audioKeyframes.length > 1000 ||
      clip.audioKeyframes.some((key, i, keys) => !key || !Number.isSafeInteger(key.timeMs) || key.timeMs < 0 || key.timeMs > 14_400_000 ||
        !Number.isFinite(key.gain) || key.gain < 0 || key.gain > 2 || (i > 0 && keys[i - 1].timeMs >= key.timeMs))))
      errors.push('Use ordered, unique audio keyframes with gain between 0 and 200%.');
    if (clip.detachedFromId !== undefined && !safeId(clip.detachedFromId)) errors.push('Invalid detached audio reference.');
    if (clip.ducking !== undefined && typeof clip.ducking !== 'boolean') errors.push('Invalid ducking setting.');
  }
  if (
    timeline.version !== 1 ||
    !Number.isFinite(timeline.fps) ||
    timeline.fps < 12 ||
    timeline.fps > 60
  )
    errors.push("Unsupported timeline version or frame rate.");
  if (
    timeline.tracks.length > 32 ||
    timeline.clips.length > 500 ||
    timeline.assets.length > 200 ||
    timeline.markers.length > 500
  )
    errors.push("Timeline exceeds the supported project limits.");
  const tracks = new Map(timeline.tracks.map((track) => [track.id, track]));
  const assets = new Map(timeline.assets.map((asset) => [asset.id, asset]));
  if (
    tracks.size !== timeline.tracks.length ||
    assets.size !== timeline.assets.length ||
    new Set(timeline.clips.map((clip) => clip.id)).size !==
      timeline.clips.length
  )
    errors.push("Timeline IDs must be unique.");
  const minDuration = Math.max(1, Math.floor(1000 / timeline.fps));
  for (const track of timeline.tracks)
    if (
      ![
        "video",
        "intro",
        "overlay",
        "audio",
        "music",
        "text",
        "captions",
      ].includes(track.kind) ||
      !track.name.trim() ||
      !Number.isFinite(track.height) ||
      track.height < 36 ||
      track.height > 160
    )
      errors.push("Invalid track settings.");
  for (const asset of timeline.assets)
    if (
      !asset.id ||
      !asset.fileUrl ||
      !["audio", "video", "image"].includes(asset.mediaType) ||
      !Number.isFinite(asset.durationMs) ||
      asset.durationMs < 0
    )
      errors.push("Invalid source media.");
  for (const clip of timeline.clips) {
    const track = tracks.get(clip.trackId);
    const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
    if (!track) {
      errors.push("A clip references a missing track.");
      continue;
    }
    if (
      ![
        clip.startMs,
        clip.sourceStartMs,
        clip.durationMs,
        clip.fadeInMs,
        clip.fadeOutMs,
      ].every(Number.isSafeInteger) ||
      clip.startMs < 0 ||
      clip.sourceStartMs < 0 ||
      clip.durationMs < minDuration ||
      clip.startMs + clip.durationMs > 14_400_000 ||
      clip.fadeInMs < 0 ||
      clip.fadeOutMs < 0 ||
      clip.fadeInMs + clip.fadeOutMs > clip.durationMs
    )
      errors.push(`Invalid time range for “${clip.name}”.`);
    if (
      !Number.isFinite(clip.volume) ||
      clip.volume < 0 ||
      clip.volume > 2 ||
      !["cut", "fade", "crossfade", "slide", "zoom"].includes(clip.transitionIn)
    )
      errors.push(`Unsupported volume or transition for “${clip.name}”.`);
    if (track.kind === "captions" && clip.loop)
      errors.push(
        "Caption clips follow their original source and cannot loop.",
      );
    if (track.kind === "text") {
      if (
        clip.text &&
        (![clip.text.color, clip.text.background].every(
          (color) =>
            typeof color === "string" &&
            (/^#[0-9a-f]{3,8}$/i.test(color) || color === "transparent"),
        ) ||
          typeof clip.text.fontFamily !== "string" ||
          !/^[a-z0-9 ,\'"_-]{1,200}$/i.test(clip.text.fontFamily))
      )
        errors.push("Use a valid font name and hex text/background colors.");
      if (
        !clip.text ||
        !clip.text.value.trim() ||
        clip.text.value.length > 3000 ||
        ![clip.text.fontSize, clip.text.x, clip.text.y].every(
          Number.isFinite,
        ) ||
        clip.text.fontSize < 8 ||
        clip.text.fontSize > 400 ||
        clip.text.x < 0 ||
        clip.text.x > 100 ||
        clip.text.y < 0 ||
        clip.text.y > 100
      )
        errors.push("Invalid text overlay.");
    } else if (!asset || !compatibleAsset(track.kind, asset))
      errors.push(`Media is not compatible with the ${track.kind} track.`);
    if (
      asset &&
      !clip.loop &&
      asset.mediaType !== "image" &&
      asset.durationMs > 0 &&
      clip.sourceStartMs + clip.durationMs > asset.durationMs + 1
    )
      errors.push(`“${clip.name}” extends past its original source.`);
  }
  for (const track of timeline.tracks.filter((track) =>
    ["video", "intro"].includes(track.kind),
  )) {
    const clips = timeline.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.startMs - b.startMs);
    for (let index = 1; index < clips.length; index++) {
      const previous = clips[index - 1],
        current = clips[index],
        overlap = previous.startMs + previous.durationMs - current.startMs;
      if (
        overlap > 1 &&
        (current.transitionIn !== "crossfade" ||
          Math.abs(overlap - current.fadeInMs) >
            Math.ceil(1000 / timeline.fps) ||
          overlap >= current.durationMs ||
          overlap >= previous.durationMs)
      )
        errors.push(
          "Video clips cannot overlap unless a cross dissolve matches their overlap.",
        );
      if (
        index > 1 &&
        clips[index - 2].startMs + clips[index - 2].durationMs > current.startMs
      )
        errors.push("Three-way video overlaps are not supported.");
    }
  }
  for (const marker of timeline.markers)
    if (
      !Number.isSafeInteger(marker.timeMs) ||
      marker.timeMs < 0 ||
      marker.timeMs > 14_400_000 ||
      !marker.name.trim()
    )
      errors.push("Invalid marker.");
  return [...new Set(errors)];
}

export function commitTimeline(timeline: ReelTimeline): ReelTimeline {
  const next = { ...timeline, enabled: true };
  const errors = validateTimeline(next);
  if (errors.length) throw new Error(errors[0]);
  return next;
}
export function linkedSelection(
  timeline: ReelTimeline,
  ids: string[],
): Set<string> {
  const links = new Set(
    timeline.clips
      .filter((clip) => ids.includes(clip.id) && clip.linkId)
      .map((clip) => clip.linkId),
  );
  return new Set(
    timeline.clips
      .filter(
        (clip) =>
          ids.includes(clip.id) ||
          Boolean(clip.linkId && links.has(clip.linkId)),
      )
      .map((clip) => clip.id),
  );
}
export function groupTimelineClips(
  timeline: ReelTimeline,
  ids: string[],
  group: boolean,
): ReelTimeline {
  const selected = linkedSelection(timeline, ids);
  assertEditable(timeline, selected);
  const linkId = group ? makeTimelineId("group") : undefined;
  return commitTimeline({
    ...timeline,
    clips: timeline.clips.map((clip) =>
      selected.has(clip.id) ? { ...clip, linkId } : clip,
    ),
  });
}

/** Remove only this track's clips; linked clips on other tracks stay intact. */
export function deleteTimelineTrack(timeline: ReelTimeline, trackId: string): ReelTimeline {
  const track = timeline.tracks.find(track => track.id === trackId);
  if (!track) throw new Error('Track not found.');
  if (track.locked) throw new Error('Unlock this track before deleting it.');
  const remaining = timeline.clips.filter(clip => clip.trackId !== trackId);
  const links = new Map<string, number>();
  for (const clip of remaining) if (clip.linkId) links.set(clip.linkId, (links.get(clip.linkId) || 0) + 1);
  return commitTimeline({ ...timeline, tracks: timeline.tracks.filter(track => track.id !== trackId), clips: remaining.map(clip => clip.linkId && links.get(clip.linkId) === 1 ? { ...clip, linkId: undefined } : clip) });
}

function assertEditable(timeline: ReelTimeline, ids: Set<string>) {
  if (
    timeline.clips.some(
      (clip) =>
        ids.has(clip.id) &&
        timeline.tracks.find((track) => track.id === clip.trackId)?.locked,
    )
  )
    throw new Error("Unlock the linked tracks before editing their clips.");
}
export function moveTimelineClips(
  timeline: ReelTimeline,
  ids: string[],
  deltaMs: number,
  target?: { clipId: string; trackId: string },
) {
  const selected = linkedSelection(timeline, ids);
  assertEditable(timeline, selected);
  if (
    target &&
    timeline.tracks.find((track) => track.id === target.trackId)?.locked
  )
    throw new Error("The destination track is locked.");
  return commitTimeline({
    ...timeline,
    clips: timeline.clips.map((clip) =>
      selected.has(clip.id)
        ? {
            ...clip,
            startMs: frameTime(clip.startMs + deltaMs, timeline.fps),
            trackId: target?.clipId === clip.id ? target.trackId : clip.trackId,
          }
        : clip,
    ),
  });
}
export function trimTimelineClip(
  timeline: ReelTimeline,
  id: string,
  edge: "left" | "right",
  deltaMs: number,
) {
  const selected = linkedSelection(timeline, [id]);
  assertEditable(timeline, selected);
  const delta = frameTime(deltaMs, timeline.fps);
  return commitTimeline({
    ...timeline,
    clips: timeline.clips.map((clip) =>
      selected.has(clip.id)
        ? edge === "left"
          ? {
              ...clip,
              startMs: clip.startMs + delta,
              sourceStartMs: clip.sourceStartMs + delta,
              motion: clip.motion ? { ...clip.motion, offsetMs: (clip.motion.offsetMs || 0) + delta } : undefined,
              durationMs: clip.durationMs - delta,
            }
          : { ...clip, durationMs: clip.durationMs + delta }
        : clip,
    ),
  });
}
export function splitTimelineClips(
  timeline: ReelTimeline,
  ids: string[],
  timeMs: number,
) {
  const selected = linkedSelection(timeline, ids);
  assertEditable(timeline, selected);
  const time = frameTime(timeMs, timeline.fps);
  const clips: TimelineClip[] = [];
  const splitLinks = new Map<string, string>();
  const rightIds = new Map<string, string>();
  for (const clip of timeline.clips) {
    if (
      !selected.has(clip.id) ||
      time <= clip.startMs ||
      time >= clip.startMs + clip.durationMs
    ) {
      clips.push(clip);
      continue;
    }
    const left = time - clip.startMs;
    if (clip.linkId && !splitLinks.has(clip.linkId))
      splitLinks.set(clip.linkId, makeTimelineId("link"));
    clips.push({
      ...clip,
      durationMs: left,
      fadeOutMs: 0,
      audioFadeOutMs: clip.audioFadeOutMs === undefined ? undefined : 0,
      audioFadeInMs: clip.audioFadeInMs === undefined ? undefined : Math.min(clip.audioFadeInMs, left),
      fadeInMs: Math.min(clip.fadeInMs, left),
    });
    const rightId = makeTimelineId('clip');
    rightIds.set(clip.id, rightId);
    clips.push({
      ...clip,
      id: rightId,
      linkId: clip.linkId ? splitLinks.get(clip.linkId) : undefined,
      startMs: time,
      sourceStartMs: clip.sourceStartMs + left,
      motion: clip.motion ? { ...clip.motion, offsetMs: (clip.motion.offsetMs || 0) + left } : undefined,
      durationMs: clip.durationMs - left,
      fadeInMs: 0,
      audioFadeInMs: clip.audioFadeInMs === undefined ? undefined : 0,
      audioFadeOutMs: clip.audioFadeOutMs === undefined ? undefined : Math.min(clip.audioFadeOutMs, clip.durationMs - left),
      transitionIn: "cut",
      fadeOutMs: Math.min(clip.fadeOutMs, clip.durationMs - left),
    });
  }
  const newIds = new Set(rightIds.values());
  return commitTimeline({ ...timeline, clips: clips.map(c => c.detachedFromId && newIds.has(c.id) && rightIds.has(c.detachedFromId)
    ? { ...c, detachedFromId: rightIds.get(c.detachedFromId) } : c) });
}
export function deleteTimelineClips(timeline: ReelTimeline, ids: string[]) {
  const selected = linkedSelection(timeline, ids);
  assertEditable(timeline, selected);
  return commitTimeline({
    ...timeline,
    clips: timeline.clips.filter((clip) => !selected.has(clip.id)),
  });
}
export function pasteTimelineClips(
  timeline: ReelTimeline,
  copied: TimelineClip[],
  atMs: number,
) {
  if (!copied.length) return timeline;
  const origin = Math.min(...copied.map((clip) => clip.startMs));
  const links = new Map<string, string>();
  const copiedIds = new Map(copied.map(clip => [clip.id, makeTimelineId('clip')]));
  const pasted = copied.map((clip) => {
    if (
      !timeline.tracks.some(
        (track) => track.id === clip.trackId && !track.locked,
      )
    )
      throw new Error("The copied clip’s track is missing or locked.");
    if (clip.linkId && !links.has(clip.linkId))
      links.set(clip.linkId, makeTimelineId("link"));
    return {
      ...structuredClone(clip),
      id: copiedIds.get(clip.id)!,
      detachedFromId: clip.detachedFromId ? copiedIds.get(clip.detachedFromId) || clip.detachedFromId : undefined,
      linkId: clip.linkId ? links.get(clip.linkId) : undefined,
      startMs: frameTime(atMs + clip.startMs - origin, timeline.fps),
    };
  });
  return commitTimeline({ ...timeline, clips: [...timeline.clips, ...pasted] });
}
export function snapTimelineTime(
  timeline: ReelTimeline,
  value: number,
  playhead: number,
  exclude: Set<string>,
  threshold: number,
): number {
  const points = [
    0,
    playhead,
    ...timeline.markers.map((marker) => marker.timeMs),
    ...timeline.clips
      .filter((clip) => !exclude.has(clip.id))
      .flatMap((clip) => [clip.startMs, clip.startMs + clip.durationMs]),
  ];
  const nearest = points.reduce(
    (best, point) =>
      Math.abs(point - value) < Math.abs(best - value) ? point : best,
    value + threshold + 1,
  );
  return Math.abs(nearest - value) <= threshold ? nearest : value;
}

/** One source-to-timeline mapping is used by preview, SRT, and both render entry points. */
export function compileTimeline(project: CaptionProject): TimelinePlan {
  const timeline = structuredClone(timelineFromProject(project));
  const errors = validateTimeline(timeline);
  if (errors.length) throw new Error(errors[0]);
  const groups: CaptionGroup[] = [];
  for (const track of timeline.tracks.filter(
    (track) => track.kind === "captions" && !track.hidden,
  ))
    for (const clip of timeline.clips.filter(
      (clip) => clip.trackId === track.id && clip.assetId,
    )) {
      const source =
        clip.assetId === project.audio?.id
          ? project
          : timeline.captionSources[clip.assetId!];
      if (!source) continue;
      const sourceGroups = source.captionGroups.length
        ? source.captionGroups
        : [
            {
              id: "ungrouped",
              start: 0,
              end: Number.MAX_SAFE_INTEGER,
              text: "",
              words: source.transcript,
            },
          ];
      for (const group of sourceGroups) {
        const words = group.words
          .filter(
            (word) =>
              word.end * 1000 > clip.sourceStartMs &&
              word.start * 1000 < clip.sourceStartMs + clip.durationMs,
          )
          .map((word) => ({
            ...word,
            id: `${clip.id}_${word.id}`,
            start:
              (clip.startMs +
                Math.max(0, word.start * 1000 - clip.sourceStartMs)) /
              1000,
            end:
              (clip.startMs +
                Math.min(
                  clip.durationMs,
                  word.end * 1000 - clip.sourceStartMs,
                )) /
              1000,
          }));
        if (words.length)
          groups.push({
            ...group,
            id: `${clip.id}_${group.id}`,
            words,
            text: words.map((word) => word.text).join(" "),
            start: Math.min(...words.map((word) => word.start)),
            end: Math.max(...words.map((word) => word.end)),
          });
      }
    }
  groups.sort((a, b) => a.start - b.start);
  const sfxCues: SfxCue[] = [];
  if (project.autoSfxEnabled !== false)
    for (const track of timeline.tracks.filter(
      (track) => track.kind === "audio" && !track.hidden,
    ))
      for (const clip of timeline.clips.filter(
        (clip) => clip.trackId === track.id,
      )) {
        const source =
          clip.assetId === project.audio?.id
            ? project
            : timeline.captionSources[clip.assetId || ""];
        for (const cue of source?.sfxCues || [])
          if (
            ["whoosh", "ding", "kaching", "pop", "impact"].includes(cue.type) &&
            cue.time * 1000 >= clip.sourceStartMs &&
            cue.time * 1000 < clip.sourceStartMs + clip.durationMs
          )
            sfxCues.push({
              ...cue,
              id: `${clip.id}_${cue.id}`,
              time:
                (clip.startMs + cue.time * 1000 - clip.sourceStartMs) / 1000,
              audioSrc: `/audio/sfx/${cue.type}.mp3`,
            });
      }
  return {
    timeline,
    durationMs: timelineEnd(timeline),
    captionGroups: groups,
    transcript: groups.flatMap((group) => group.words),
    sfxCues,
  };
}

export function clipEnvelope(clip: TimelineClip, timeMs: number): number {
  const local = timeMs - clip.startMs;
  if (local < 0 || local >= clip.durationMs) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      clip.fadeInMs ? local / clip.fadeInMs : 1,
      clip.fadeOutMs ? (clip.durationMs - local) / clip.fadeOutMs : 1,
    ),
  );
}
