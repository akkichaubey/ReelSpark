import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  TimelinePlan,
  TimelineClip,
  TimelineAsset,
  TimelineTrack,
} from "../lib/timeline/model";
import { clipEnvelope } from "../lib/timeline/model";
import { clipMotionStyle } from '../lib/timeline/motion';
import { audioGain, trackAudible, audioTrack, hasAudibleSpeech } from '../lib/timeline/audio';
import type { RemotionCaptionProps } from "./types";
import { GsapAnimatedCaptions } from "./GsapAnimatedCaptions";
import { getCssObjectPosition } from "./BackgroundLayer";

function SourceMedia({
  clip,
  asset,
  children,
}: {
  clip: TimelineClip;
  asset: TimelineAsset;
  children: React.ReactNode;
}) {
  const { fps } = useVideoConfig();
  if (!clip.loop || !asset.durationMs || asset.mediaType === "image")
    return <>{children}</>;
  const offset =
    Math.round((clip.sourceStartMs * fps) / 1000) %
    Math.max(1, Math.round((asset.durationMs * fps) / 1000));
  return (
    <Sequence
      from={-offset}
      durationInFrames={Math.ceil((clip.durationMs * fps) / 1000) + offset}
      layout="none"
    >
      <Loop
        durationInFrames={Math.max(
          1,
          Math.round((asset.durationMs * fps) / 1000),
        )}
      >
        {children}
      </Loop>
    </Sequence>
  );
}

function ClipMedia({
  clip,
  asset,
  track,
  absoluteTime,
  plan,
  zIndex,
}: {
  clip: TimelineClip;
  asset: TimelineAsset;
  track: TimelineTrack;
  absoluteTime: number;
  plan: TimelinePlan;
  zIndex: number;
}) {
  const { fps } = useVideoConfig();
  let opacity = clipEnvelope(clip, absoluteTime);
  const motionStyle = clipMotionStyle(clip, absoluteTime);
  // An incoming cross dissolve covers its outgoing neighbour; avoid double-fading the lower layer.
  if (
    plan.timeline.clips.some(
      (next) =>
        next.trackId === clip.trackId &&
        next.id !== clip.id &&
        next.transitionIn === "crossfade" &&
        next.startMs > clip.startMs &&
        absoluteTime >= next.startMs &&
        absoluteTime < clip.startMs + clip.durationMs,
    )
  )
    opacity = 1;
  const entering = clip.fadeInMs
    ? Math.min(1, Math.max(0, (absoluteTime - clip.startMs) / clip.fadeInMs))
    : 1;
  const startFrom =
    clip.loop && asset.durationMs
      ? 0
      : Math.round((clip.sourceStartMs * fps) / 1000);
  const visual = !["audio", "music"].includes(track.kind);
  const speaking = track.kind === 'music' && clip.ducking !== false && hasAudibleSpeech(plan, absoluteTime);
  const volume =
    !trackAudible(plan.timeline, track) || clip.muted
      ? 0
      : audioGain(clip, absoluteTime, asset.durationMs) *
        (track.kind === "music" && clip.ducking !== false && speaking
          ? 0.32
          : 1);
  const transform =
    clip.transitionIn === "slide"
      ? `translateX(${(1 - entering) * 100}%)`
      : clip.transitionIn === "zoom"
        ? `scale(${1.15 - entering * 0.15})`
        : undefined;
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit:
      asset.fitMode === "contain" || asset.fitMode === "blur"
        ? "contain"
        : "cover",
    objectPosition: getCssObjectPosition(asset.position),
    transform: `scale(${(asset.scale || 100) / 100})`,
  };
  return (
    <>
      {visual && (
        <AbsoluteFill
          style={{
            opacity: opacity * (motionStyle.opacity as number ?? 1),
            transform: transform || motionStyle.transform ? `${transform || ''} ${motionStyle.transform || ''}`.trim() : undefined,
            filter: motionStyle.filter,
            zIndex,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {asset.fitMode === "blur" && (
            <AbsoluteFill
              style={{ filter: "blur(22px)", transform: "scale(1.1)" }}
            >
              <SourceMedia clip={clip} asset={asset}>
                {asset.mediaType === "video" ? (
                  <OffthreadVideo
                    src={asset.fileUrl}
                    startFrom={startFrom}
                    muted
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <Img
                    src={asset.fileUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                )}
              </SourceMedia>
            </AbsoluteFill>
          )}
          <SourceMedia clip={clip} asset={asset}>
            {asset.mediaType === "video" ? (
              <OffthreadVideo
                src={asset.fileUrl}
                startFrom={startFrom}
                muted
                style={mediaStyle}
              />
            ) : (
              <Img src={asset.fileUrl} style={mediaStyle} />
            )}
          </SourceMedia>
        </AbsoluteFill>
      )}
      {asset.mediaType !== "image" &&
        asset.hasAudio !== false &&
        !track.muted &&
        !clip.muted && (
          <SourceMedia clip={clip} asset={asset}>
            <Audio src={asset.fileUrl} startFrom={startFrom} volume={volume} />
          </SourceMedia>
        )}
    </>
  );
}

export function TimelineScene({
  plan,
  captionStyle,
  outputSettings,
  speaker1Color,
  speaker2Color,
  sfxCues,
}: { plan: TimelinePlan } & Pick<
  RemotionCaptionProps,
  | "captionStyle"
  | "outputSettings"
  | "speaker1Color"
  | "speaker2Color"
  | "sfxCues"
>) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = (frame * 1000) / fps;
  const assets = new Map(
    plan.timeline.assets.map((asset) => [asset.id, asset]),
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {(plan.timeline.tracks.some(t => t.solo && !t.hidden && audioTrack(t)) ? [] : (sfxCues || plan.sfxCues || [])).map((cue) => (
        <Sequence
          key={cue.id}
          from={Math.round(cue.time * fps)}
          durationInFrames={Math.round(1.5 * fps)}
          layout="none"
        >
          <Audio
            src={cue.audioSrc || `/audio/sfx/${cue.type}.mp3`}
            volume={Math.max(0, Math.min(1, cue.volume ?? 0.7))}
          />
        </Sequence>
      ))}
      {plan.timeline.tracks.map((track, index) =>
        track.hidden
          ? null
          : plan.timeline.clips
              .filter((clip) => clip.trackId === track.id)
              .sort((a, b) => a.startMs - b.startMs)
              .map((clip, order) => {
                const duration = Math.max(
                  1,
                  Math.round((clip.durationMs * fps) / 1000),
                );
                const asset = clip.assetId
                  ? assets.get(clip.assetId)
                  : undefined;
                const zIndex =
                  (plan.timeline.tracks.length - index) * 100 + order;
                if (track.kind === "captions") {
                  const groups = plan.captionGroups.filter((group) =>
                    group.id.startsWith(`${clip.id}_`),
                  );
                  // Caption times are already in the global timebase, so keep this layer outside Sequence's local clock.
                  return time >= clip.startMs &&
                    time < clip.startMs + clip.durationMs ? (
                    <AbsoluteFill key={clip.id} style={{ zIndex, ...clipMotionStyle(clip, time) }}>
                      <GsapAnimatedCaptions
                        words={groups.flatMap((group) => group.words)}
                        captionGroups={groups}
                        style={captionStyle}
                        width={outputSettings.width}
                        height={outputSettings.height}
                        speaker1Color={speaker1Color}
                        speaker2Color={speaker2Color}
                      />
                    </AbsoluteFill>
                  ) : null;
                }
                if (track.kind === "text" && clip.text) {
                  if (
                    time < clip.startMs ||
                    time >= clip.startMs + clip.durationMs
                  )
                    return null;
                  const keyframeStyle = clipMotionStyle(clip, time);
                  const progress = clip.fadeInMs
                    ? Math.min(1, (time - clip.startMs) / clip.fadeInMs)
                    : 1;
                  const movement =
                    clip.transitionIn === "slide"
                      ? ` translateY(${(1 - progress) * 40}px)`
                      : clip.transitionIn === "zoom"
                        ? ` scale(${0.8 + progress * 0.2})`
                        : "";
                  return (
                    <AbsoluteFill
                      key={clip.id}
                      style={{
                        zIndex,
                        ...keyframeStyle,
                        opacity: clipEnvelope(clip, time) * (keyframeStyle.opacity as number ?? 1),
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: `${clip.text.x}%`,
                          top: `${clip.text.y}%`,
                          transform: `translate(-50%,-50%)${movement}`,
                          color: clip.text.color,
                          background: clip.text.background,
                          fontFamily: clip.text.fontFamily,
                          fontSize: clip.text.fontSize,
                          fontWeight: 700,
                          padding: "8px 16px",
                          borderRadius: 8,
                          textAlign: "center",
                          whiteSpace: "pre-wrap",
                          maxWidth: "95%",
                          wordBreak: "break-word",
                        }}
                      >
                        {clip.text.value}
                      </div>
                    </AbsoluteFill>
                  );
                }
                return asset ? (
                  <Sequence
                    key={clip.id}
                    from={Math.round((clip.startMs * fps) / 1000)}
                    durationInFrames={duration}
                    layout="none"
                  >
                    <ClipMedia
                      clip={clip}
                      asset={asset}
                      track={track}
                      absoluteTime={time}
                      plan={plan}
                      zIndex={zIndex}
                    />
                  </Sequence>
                ) : null;
              }),
      )}
    </AbsoluteFill>
  );
}
