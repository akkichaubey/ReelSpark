# Video thumbnail timeline — 2026-10-31

## Display and interaction

- Video clips display real cached JPEG frames inside the existing clip body.
  Name, duration, trim edges, waveform controls and motion markers remain.
  Image clips keep their natural-aspect repeated strip; audio/caption tracks do
  not acquire a video strip.
- Zoom increases the number of thumbnail tiles per second. Track height adjusts
  tile width to keep approximately 16:9 frame proportions. Only visible-area tiles
  plus a small margin are mounted, bounded at 512 tiles per clip. Long clips no
  longer become blank after the first 100 tiles.
- Hover a video clip with a mouse/pen to view its source frame, name, source time,
  timeline time and clip duration. One muted video element decodes hover frames;
  it never plays source audio. Source-in, trims and loops map the pointer position
  to the original source clock. The card remains inside the viewport and does
  not capture pointer input or alter composition data.
- Pointer state updates are animation-frame throttled; video seeks are throttled
  to approximately 60ms. Leaving the clip, starting a drag or adjusting audio
  dismisses the card. Touch does not trigger hover. The existing Hover Scrub
  toggle still independently controls seeking of the main composition preview.

## Loading, cache and sampling

Eligible owned media show queued, processing and unavailable states while the
existing preview endpoint works. Failed generation has a Retry action. Individual
frame images load lazily, decode asynchronously and show loading placeholders;
failed images show an unavailable fallback. Hover frames have their own loading
and decode-error state. Preview failures do not block editing the original media.

The FFmpeg preview cache now stores 4–24 representative frames according to source
duration, including a near-end sample, and explicit sample timestamps. Cache v2
regenerates derived previews without deleting source files or old cache data.
Existing four-frame client data still maps through the fallback timestamp rule.
Server ownership checks, duration limits, cancellation and task registration
remain in the existing media preview path.

Strips select the nearest cached sample; zoom does not generate a unique server
frame for every tile. Hover decodes the original video at the requested source
time instead of presenting a coarse cached thumbnail as an exact hover frame.
It shows source footage, not the composited motion/caption/effects output.

## Verification

PASS: typecheck, shared thumbnail module/component lint,
`npm run test:timeline-thumbnails`, `npm run test:timeline` and timeline scrubbing
regressions. Checks cover sample density/timestamps, source bounds and loops,
viewport bounds, tiles beyond index 100, lazy placeholders, real FFmpeg frame
generation, waveform/cache/access/cancellation behavior and Saved Reels retention.
The main application suite also passed 63/63 tests during this update. Client
preview entries are matched to source URLs to avoid stale frames after source
replacement.

Browser hover decoding, visual density at multiple zooms, loading/retry gestures
and touch interaction remain pending. Unit/static markup checks do not replace
that verification. No application server restart or deployment was performed.
Existing Markdown rules and project data are preserved.
