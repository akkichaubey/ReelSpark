# Professional Reel Maker timeline

## Implementation checkpoint — 2026-10-31

Thumbnail follow-up replaces the fixed 100-tile strip with viewport tiles,
adaptive cached samples and a throttled, muted source-frame hover player. The
existing authorization/cache/task path is retained. Browser QA is still pending;
see [sampling and verification](timeline-thumbnails.md).

Motion channels and inspector controls now cover transform/effect keyframes,
easing, Bezier handles, copy/paste, presets and animation-speed ramps. Existing
clip/source clocks stay unchanged; media playback-rate ramping remains pending.
See [motion details](timeline-motion.md) for verified paths and outstanding QA.

Caption follow-up adds word editing directly inside caption clips, constrained
boundary dragging, shared source updates, active-word highlighting and links to
the existing speech-sync/effects flows. See
[caption controls and pending QA](timeline-caption-editing.md). No caption data
schema or original preservation rules were replaced.

The initial audit below describes the pre-implementation state. Multi-track
editing, real waveforms, advanced ripple/roll/slip/slide operations and audio
automation are now implemented. Keep the original preservation and architecture
requirements below. See [advanced edits](advanced-timeline-editing.md),
[audio controls](timeline-audio-editing.md) and the
[verification record](professional-timeline-verification.md) for current scope
and remaining QA. Optional audio fields retain the version-1 project format.

Audit: the current Reel Maker has a single-source trim footer with simulated waveform bars. Studio has source trimming, audition, merge recipes and exports; Antigravity's latest commits add review/library controls, not a multi-track composition. Existing CaptionProject JSON, undo/redo, Saved Reels media retention and caption renderers are reusable.

The user's latest instruction places the professional timeline in Reel Maker, overriding the pasted brief's older Studio-only placement. Keep Studio and the legacy trim view available. Add an optional versioned timeline to CaptionProject, adapt old projects without rewriting their state, and only activate composition mode after an actual timeline edit.

Phases: pure millisecond track/clip operations and validated plan; cached FFmpeg waveform/thumb previews; themed timeline interaction and shared review inspector; shared Remotion composition in Player and export; ownership, persistence, cancellation and real render QA. All source media stays immutable. Caption mappings preserve source word edits; linked voice/caption segments move and split together. Advanced compositions use the existing Remotion renderer explicitly; the legacy FFmpeg renderer remains available for single-source projects and rejects advanced data rather than silently omitting it.
