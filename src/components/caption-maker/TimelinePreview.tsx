"use client";
import { useEffect, useMemo, useRef } from "react";
import {
  Player,
  type PlayerRef,
  type CallbackListener,
} from "@remotion/player";
import { CaptionReel } from "@/remotion/CaptionReel";
import { compileTimeline } from "@/lib/timeline/model";
import type { CaptionProject } from "@/lib/caption-maker/types";

export function TimelinePreview({
  project,
  currentTime,
  playing,
  onTime,
  onPlaying,
  seekVersion = 0,
}: {
  project: CaptionProject;
  currentTime: number;
  playing: boolean;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  seekVersion?: number;
}) {
  const player = useRef<PlayerRef>(null);
  const reportedTime = useRef<number | null>(null);
  const seekRequest = useRef({ version: -1, fps: 0 });
  const result = useMemo(() => {
    try {
      return { plan: compileTimeline(project), error: "" };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "Invalid timeline",
      };
    }
  }, [project]);
  const hasPlan = Boolean(result.plan);
  const fps = project.outputSettings.fps || 30;
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    let notification: number | undefined;
    const time: CallbackListener<"frameupdate"> = (event) => {
      // While paused, the user's seek position owns the playhead. Delayed
      // decoded frames must not pull it back to an older hover/drag position.
      if (!instance.isPlaying()) return;
      const next = event.detail.frame / fps;
      if (reportedTime.current === next) return;
      reportedTime.current = next;
      if (notification !== undefined) cancelAnimationFrame(notification);
      notification = requestAnimationFrame(() => {
        if (instance.isPlaying()) onTime(next);
      });
    };
    const pause: CallbackListener<"pause"> = () => {
      if (notification !== undefined) cancelAnimationFrame(notification);
      onPlaying(false);
    };
    const play: CallbackListener<"play"> = () => onPlaying(true);
    instance.addEventListener("frameupdate", time);
    instance.addEventListener("pause", pause);
    instance.addEventListener("play", play);
    return () => {
      if (notification !== undefined) cancelAnimationFrame(notification);
      instance.removeEventListener("frameupdate", time);
      instance.removeEventListener("pause", pause);
      instance.removeEventListener("play", play);
    };
  }, [fps, onTime, onPlaying, hasPlan]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    // Playback reports never become seek commands. Only an explicit user
    // action advances this revision, including seeks while playback is running.
    if (
      seekRequest.current.version === seekVersion &&
      seekRequest.current.fps === fps
    )
      return;
    seekRequest.current = { version: seekVersion, fps };
    instance.seekTo(Math.round(currentTime * fps));
  }, [currentTime, fps, seekVersion, hasPlan]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    if (playing && !instance.isPlaying()) instance.play();
    if (!playing && instance.isPlaying()) instance.pause();
  }, [playing]);
  const inputProps = useMemo(
    () =>
      result.plan
        ? {
            timelinePlan: result.plan,
            transcript: result.plan.transcript,
            captionGroups: result.plan.captionGroups,
            captionStyle: project.captionStyle,
            outputSettings: project.outputSettings,
            speaker1Color: project.speaker1Color,
            speaker2Color: project.speaker2Color,
            durationInSeconds: result.plan.durationMs / 1000,
          }
        : null,
    [
      result.plan,
      project.captionStyle,
      project.outputSettings,
      project.speaker1Color,
      project.speaker2Color,
    ],
  );
  if (!result.plan || !inputProps)
    return (
      <p role="alert" className="text-sm text-red-300">
        {result.error}
      </p>
    );
  const plan = result.plan;
  return (
    <div data-theme-media="true" className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden">
      <Player
        ref={player}
        component={CaptionReel}
        inputProps={inputProps}
        durationInFrames={Math.max(
          1,
          Math.round((plan.durationMs * fps) / 1000),
        )}
        fps={fps}
        compositionWidth={project.outputSettings.width}
        compositionHeight={project.outputSettings.height}
        controls={false}
        loop
        clickToPlay
        spaceKeyToPlayOrPause={false}
        numberOfSharedAudioTags={32}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          width:
            project.outputSettings.width / project.outputSettings.height > 1
              ? "100%"
              : undefined,
          height:
            project.outputSettings.width / project.outputSettings.height <= 1
              ? "100%"
              : undefined,
          aspectRatio: `${project.outputSettings.width}/${project.outputSettings.height}`,
        }}
        errorFallback={({ error }) => (
          <div role="alert" className="p-3 text-sm text-red-300">
            Preview unavailable: {error.message}
          </div>
        )}
      />
    </div>
  );
}
