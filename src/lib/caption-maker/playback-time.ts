/** Keep source trimming valid even for sub-half-second media and restored drafts. */
export function normalizeTrimRange(duration: number, range?: { start: number; end: number }) {
  const limit = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const minimum = Math.min(0.5, limit);
  const end = Number.isFinite(range?.end) && range!.end > 0
    ? Math.min(limit, Math.max(minimum, range!.end)) : limit;
  const start = Math.min(Math.max(0, Number.isFinite(range?.start) ? range!.start : 0), Math.max(0, end - minimum));
  return { start, end };
}

export function musicTime(time: number, offset: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const sourceTime = (Number.isFinite(time) ? time : 0) + (Number.isFinite(offset) ? offset : 0);
  return ((sourceTime % duration) + duration) % duration;
}
