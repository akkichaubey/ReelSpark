import type { CSSProperties } from 'react';
import type { TimelineClip } from './model';

export const motionProperties = {
  x: { label: 'Position X (%)', initial: 0, min: -200, max: 200 },
  y: { label: 'Position Y (%)', initial: 0, min: -200, max: 200 },
  scale: { label: 'Scale (%)', initial: 100, min: 1, max: 500 },
  rotation: { label: 'Rotation (degrees)', initial: 0, min: -3600, max: 3600 },
  opacity: { label: 'Opacity (%)', initial: 100, min: 0, max: 100 },
  speed: { label: 'Animation speed (×)', initial: 1, min: 0.1, max: 4 },
  blur: { label: 'Blur (px)', initial: 0, min: 0, max: 60 },
  brightness: { label: 'Brightness (%)', initial: 100, min: 0, max: 300 },
  contrast: { label: 'Contrast (%)', initial: 100, min: 0, max: 300 },
  saturation: { label: 'Saturation (%)', initial: 100, min: 0, max: 300 },
} as const;
export type MotionProperty = keyof typeof motionProperties;
export type MotionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier';
export interface MotionKeyframe { timeMs: number; value: number; easing: MotionEasing; bezier?: [number, number, number, number] }
export interface ClipMotion { offsetMs?: number; channels: Partial<Record<MotionProperty, MotionKeyframe[]>> }
// Covers a four-hour clip, retained trim offset, and up to 4x animation velocity.
export const MAX_MOTION_TIME_MS = 115_200_000;
const easings = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bezier'];

export function validMotion(value: unknown): value is ClipMotion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as ClipMotion;
  if (m.offsetMs !== undefined && (!Number.isSafeInteger(m.offsetMs) || Math.abs(m.offsetMs) > 14_400_000)) return false;
  if (!m.channels || typeof m.channels !== 'object' || Array.isArray(m.channels)) return false;
  return Object.entries(m.channels).every(([name, keys]) => {
    if (!Object.hasOwn(motionProperties, name) || !Array.isArray(keys) || keys.length > 200) return false;
    const property = motionProperties[name as MotionProperty];
    return keys.every((key: MotionKeyframe, i: number) => key && Number.isSafeInteger(key.timeMs) && key.timeMs >= 0 && key.timeMs <= MAX_MOTION_TIME_MS &&
      Number.isFinite(key.value) && key.value >= property.min && key.value <= property.max && easings.includes(key.easing) &&
      (!i || keys[i - 1].timeMs < key.timeMs) && (key.bezier === undefined || Array.isArray(key.bezier) && key.bezier.length === 4 && key.bezier.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) &&
      (key.easing !== 'bezier' || key.bezier !== undefined));
  });
}
const cubic = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
export function easedProgress(key: MotionKeyframe, x: number) {
  x = Math.max(0, Math.min(1, x));
  if (key.easing === 'ease-in') return x * x;
  if (key.easing === 'ease-out') return 1 - (1 - x) ** 2;
  if (key.easing === 'ease-in-out') return x * x * (3 - 2 * x);
  if (key.easing === 'bezier' && key.bezier) {
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) { const middle = (low + high) / 2; if (cubic(middle, key.bezier[0], key.bezier[2]) < x) low = middle; else high = middle; }
    return cubic((low + high) / 2, key.bezier[1], key.bezier[3]);
  }
  return x;
}
export function motionValue(keys: MotionKeyframe[] | undefined, time: number, fallback: number) {
  if (!keys?.length) return fallback;
  if (time <= keys[0].timeMs) return keys[0].value;
  if (time >= keys[keys.length - 1].timeMs) return keys[keys.length - 1].value;
  let low = 1, high = keys.length - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (keys[middle].timeMs < time) low = middle + 1; else high = middle; }
  const left = keys[low - 1], right = keys[low];
  return left.value + (right.value - left.value) * easedProgress(left, (time - left.timeMs) / (right.timeMs - left.timeMs));
}
const velocityCache = new WeakMap<MotionKeyframe[], { cuts: number[]; sums: number[] }>();
function integrate(keys: MotionKeyframe[], a: number, b: number) {
  const step = (b - a) / 16;
  let sum = motionValue(keys, a, 1) + motionValue(keys, b, 1);
  for (let n = 1; n < 16; n++) sum += (n % 2 ? 4 : 2) * motionValue(keys, a + n * step, 1);
  return sum * step / 3;
}
/** Integrates animation velocity; media/audio/caption clocks remain unchanged. */
export function animationTime(motion: ClipMotion | undefined, localMs: number) {
  const time = Math.max(0, localMs + (motion?.offsetMs || 0)), keys = motion?.channels.speed;
  if (!keys?.length) return time;
  let cache = velocityCache.get(keys);
  if (!cache) {
    const cuts = [0, ...keys.map(k => k.timeMs).filter(t => t > 0)], sums = [0];
    for (let i = 1; i < cuts.length; i++) sums.push(sums[i - 1] + integrate(keys, cuts[i - 1], cuts[i]));
    cache = { cuts, sums }; velocityCache.set(keys, cache);
  }
  let low = 0, high = cache.cuts.length - 1;
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (cache.cuts[middle] <= time) low = middle; else high = middle - 1; }
  return cache.sums[low] + integrate(keys, cache.cuts[low], time);
}
export function clipMotionStyle(clip: TimelineClip, absoluteMs: number): CSSProperties {
  if (!clip.motion) return {};
  const time = animationTime(clip.motion, absoluteMs - clip.startMs);
  const value = (name: MotionProperty) => motionValue(clip.motion?.channels[name], time, motionProperties[name].initial);
  return { transform: `translate(${value('x')}%, ${value('y')}%) rotate(${value('rotation')}deg) scale(${value('scale') / 100})`,
    opacity: value('opacity') / 100,
    filter: `blur(${value('blur')}px) brightness(${value('brightness')}%) contrast(${value('contrast')}%) saturate(${value('saturation')}%)` };
}
export function putMotionKeyframe(motion: ClipMotion | undefined, property: MotionProperty, key: MotionKeyframe): ClipMotion {
  const result = { ...motion, channels: { ...motion?.channels, [property]: [...(motion?.channels[property] || []).filter(k => k.timeMs !== key.timeMs), key].sort((a, b) => a.timeMs - b.timeMs) } };
  if (!validMotion(result)) throw new Error('Invalid animation keyframe or curve.');
  return result;
}
export const motionPresets = ['Zoom in', 'Pan right', 'Rise and fade', 'Spin in', 'Focus reveal'] as const;
export function applyMotionPreset(name: typeof motionPresets[number], durationMs: number): ClipMotion {
  const pair = (start: number, end: number): MotionKeyframe[] => [{ timeMs: 0, value: start, easing: 'ease-in-out' }, { timeMs: Math.max(1, durationMs), value: end, easing: 'linear' }];
  const channels: ClipMotion['channels'] = name === 'Zoom in' ? { scale: pair(100, 120) } : name === 'Pan right' ? { x: pair(-10, 10), scale: pair(120, 120) }
    : name === 'Rise and fade' ? { y: pair(15, 0), opacity: pair(0, 100) } : name === 'Spin in' ? { rotation: pair(-90, 0), scale: pair(50, 100) }
    : { blur: pair(20, 0), opacity: pair(0, 100) };
  return { offsetMs: 0, channels };
}
