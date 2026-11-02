# Reel Maker multi-track timeline

Thumbnail follow-up (2026-10-31): video strips are viewport-bounded and zoom
responsive; cached samples adapt from 4 to 24 with explicit timestamps. A muted
hover player decodes requested source positions. Loading/failure/retry states
and existing labels/durations are retained. Thumbnail, real-media/cache/access
and scrubbing tests pass; actual browser hover/zoom/retry/touch QA remains pending.
See [the thumbnail guide](timeline-thumbnails.md).

Motion follow-up (2026-10-31): optional per-clip transforms, opacity/effect
keyframes, easing/Bezier curves, animation velocity, copy/paste and five presets
are connected to the shared scene. Model/markup, phase continuity and JSON tests
pass, as do all 63 main tests. New browser and measured movie verification remain
pending. Animation-speed ramps do not retime video/audio. See
[motion scope and verification](timeline-motion.md).

Caption follow-up (2026-10-31): words are editable within caption clips, with
source-time boundary handles, active speech highlighting and shared Transcript
data. Existing sync/effects flows are reachable from the toolbar. New caption
model/markup, import and motion/highlight regression checks pass. Browser,
provider-call and fresh movie verification remain pending. See
[caption details](timeline-caption-editing.md); earlier browser proofs below do
not cover these additions.

## Audio update — 2026-10-31

Implemented: real waveforms on audio-bearing video clips; selected-clip volume
and independent audio fade handles; source-relative gain keyframes; track solo;
the existing speech-ducking toggle; linked, non-destructive audio detachment and
explicit source-video resync. Split/copy operations remap detached references.
Audio evaluation is shared by Player and Remotion. See
[the audio guide](timeline-audio-editing.md) for controls, schema and limitations.

PASS for this update: typecheck, `test:timeline-audio`, `test:timeline-advanced`,
timeline scrubbing tests, and `test:timeline` (real sine/silence peaks, media
preview/cache/access checks and independent Saved Reels retention).
The 63-test main suite, project import roundtrip and timeline QA regressions also
passed during this update. New shared audio modules and controls are lint-clean.
Browser listening, pointer/touch/keyboard handle checks, undo/reopen of automation
and a fresh measured keyframe/solo export are PENDING. The older completed
verification below is historical and must not be used as proof for those paths.
No application server was started/restarted or production deployment performed.

The editor is in the footer of `/reel-maker` (the existing `/caption-maker` bookmark still redirects there). Antigravity's commits contained source trimming and clip-review/library controls, but no existing multi-track composition to move. The implementation reuses CaptionProject, the caption renderer, Saved Reels retention, existing uploads and Remotion export.

## Editing

- Default tracks remain visible in an empty project. Existing single-source projects are adapted for display and keep their original playback/export behavior until a timeline edit enables composition mode. The original simple trim view remains available on those projects.
- Video, intro/outro, overlay, voice, music, text and caption tracks support names, layer order, adjustable height, lock, visibility and mute controls where applicable. Upper visual layers render in front.
- Drag to move, use the edges to trim, double-click for the inspector. Ctrl/Cmd-click selects multiple clips. Linked voice and captions move, trim, split, copy and delete together. Group/Ungroup makes that relationship explicit for other selections.
- Space plays/pauses, S splits at the playhead, Delete removes, Ctrl/Cmd+C/X/V copies/cuts/pastes, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes. Arrow keys step one frame. Locked tracks and invalid source ranges are rejected.
- The ruler supports dragging to seek, markers, snapping, zoom and Fit. Resize the timeline by dragging its top separator. The toolbar and canvas scroll independently on narrow screens.
- Media thumbnails and waveforms are generated from the actual files with FFmpeg and cached. PCM processing uses bounded peak buckets, not a full-file browser decode. Silence stays flat. Uploaded media and shipped BGM are authorized before preview generation.
- The inspector includes source preview, placement/source bounds, duration, volume, mute/loop, fades, transitions and text/font/color/position controls. Cut, fade, cross dissolve, slide and zoom are implemented. Cross dissolve requires a matching overlap. Unsupported speed changes are not offered.
- New uploads remain reusable source media; add them using the timeline Media shelf or drag them onto a compatible track. Existing captions remain editable in the left Transcript panel. Source media is immutable.

## Preview, export and persistence

One validated timeline plan maps source bounds, gaps, layers, audio, caption words and existing sound-effect cues. The same Remotion scene runs in Player and the existing server renderer. Explicit seek revisions prevent playback reports from seeking themselves back into Player. User edits are recorded once outside React state-updater functions, fixing duplicate undo entries under Strict Mode.

Advanced exports use Remotion. The legacy FFmpeg and single-source Remotion endpoints reject advanced payloads instead of exporting a partial composition. Single-source integrations remain available. Output edits invalidate stale exports. Media authorization, private backup/restore, cancellable storage tasks and existing cover merging remain in the render path. A scoped loopback server streams only the authorized files for that render, with range support and cleanup.

Saved Reels retains the complete timeline and independent media copies. Its playback and duration calculation understand composed projects. Global voice/music source controls remain connected, and replacing a spoken source retains the previous source's manually edited caption snapshot. The QA demo is an independent copy; the user's existing reel was not modified.

## Verification completed

- `npm run build`: passed, including TypeScript and 49 generated pages.
- `npm run test:timeline`: linked edits, group operations, locked tracks, source limits, overlap validation, captions, source replacement/mixer compatibility, real waveforms/thumbnails, cache, authorization, cancellation and independent retention.
- `npm run test:timeline-render`: real rendered gaps, red/blue sequencing, text pixels, cross-dissolve pixels, audio stream/duration and measured audio fades.
- `npm run test:caption-remotion`: legacy phrase and solo caption renders, including active/pause/active highlight frames.
- Existing Saved Reels, clip-review concurrency, unified Studio, voice/background upload, caption-sync, storage and private-media suites passed.
- Targeted ESLint for the new timeline modules and `git diff --check` passed. The broader Reel Maker lint check has zero errors and retains existing unused-symbol/dependency warnings. Three synchronous effect updates found during that check now use cancellable scheduled initialization/status updates.
- Browser: empty layout; adding a text track/clip; inspector and track settings; repeated playback loops; split 4→8 clips, undo 8→4, redo 4→8, final undo; independent save/reopen; authenticated export success and saved output; 390×844 mobile layout; resizing and Fit. Temporary viewport override was reset.

Desktop proof: `storage/professional-timeline-verified.png`. Mobile proof: `storage/professional-timeline-mobile.png`.

Windows rendering now uses the installed Chrome when available and the matching Remotion compositor/FFmpeg package. The existing postinstall patch also aligns the OffthreadVideo proxy's IPv4 host; Linux keeps its normal native package and configured Chromium path. A Linux container render was not executed in this Windows session.

No production deployment was performed for this implementation. Existing live data/configuration was not changed. Passing these checks is evidence for the tested paths, not a guarantee of every possible media/codec combination.
