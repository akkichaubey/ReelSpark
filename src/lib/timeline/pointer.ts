import { frameTime } from "./model";

/** Hover seeking never competes with playback, clip edits or touch scrolling. */
export function hoverSeekTime(input: {
  enabled: boolean;
  playing: boolean;
  dragging: boolean;
  pointerType: string;
  buttons: number;
  clientX: number;
  canvasLeft: number;
  pixelsPerSecond: number;
  durationMs: number;
  fps: number;
}): number | null {
  if (
    !input.enabled ||
    input.playing ||
    input.dragging ||
    input.pointerType !== "mouse" ||
    input.buttons !== 0 ||
    input.pixelsPerSecond <= 0 ||
    input.durationMs <= 0
  )
    return null;
  const lastFrame = Math.max(
    0,
    ((Math.ceil((input.durationMs * input.fps) / 1000) - 1) * 1000) / input.fps,
  );
  return (
    Math.min(
      lastFrame,
      Math.max(
        0,
        frameTime(
          ((input.clientX - input.canvasLeft) * 1000) / input.pixelsPerSecond,
          input.fps,
        ),
      ),
    ) / 1000
  );
}
