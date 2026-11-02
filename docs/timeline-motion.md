# Clip keyframe animation — 2026-10-31

## Controls

Select a visual clip and choose **Keyframes**, or double-click its body/grip and
find **Clip keyframe animation** in the inspector. This supports video, image,
intro, overlay, text and caption clips. A motion indicator appears on the clip.
Edits remain in the inspector until **Apply**; Cancel retains the previous data.

- Properties: position X/Y (percent of the layer), scale, rotation, opacity,
  blur, brightness, contrast and saturation.
- Put the playhead inside the clip, choose a property, and **Add at playhead**.
  Edit its curve time/value, choose easing, or delete keys. Existing keys at the
  same timestamp are replaced. Numeric fields commit on blur or Enter; invalid
  values block submission.
- Easing belongs to the interval after each key: linear, ease-in, ease-out,
  ease-in-out or cubic Bezier. The graph previews the selected property's curve.
  Drag Bezier control handles, adjust their numeric coordinates, or focus a
  handle and use arrow keys. Coordinates remain in 0–1 without overshoot.
- **Animation speed** is a 0.1–4× velocity curve. Its integral advances the other
  transform/effect curves, producing animation-speed ramps. Speed keys use raw
  clip time; other keys use the resulting animation clock. Before/after a curve,
  the nearest key value is held. This does not change source media playback.
- **Copy keyframes / Paste keyframes** copies all motion/effect curves and their
  timing offset between clip inspectors. Clipboard data lasts for the current
  editor session, not the OS clipboard. Copies are independent. Timing is copied
  exactly; keys beyond a shorter target clip remain stored.
- Presets: Zoom in, Pan right, Rise and fade, Spin in, Focus reveal. **Apply
  motion preset** replaces this clip's motion channels and starts a new local
  animation clock. **Clear motion** removes the animation without changing media.

## Rendering, timing and compatibility

The same evaluator runs in Player and Remotion export. Opacity multiplies the
existing clip fade; transforms compose with existing transitions. Media fit,
position, crop, caption motion/highlights and source audio stay connected to their
existing controls. No motion data means no added transform/filter styles.

Optional version-1 `TimelineClip.motion` contains `offsetMs` and property channels
of `{ timeMs, value, easing, bezier? }` keys. Up to 200 ordered keys per property
are allowed. Numeric ranges and Bezier coordinates are validated at commit.
Curves are immutable; velocity integrals are cached and key lookup is binary.

Left trims, ripple trims, rolls, slides and splits retain the animation phase by
adjusting the offset. Moving a clip preserves its local animation; Slip changes
its source content while leaving animation placement unchanged. Duplicates and
portable JSON preserve curves without sharing mutable key arrays. Existing
track locks, validation, history, media ownership and project timing limits apply.

## Speed scope and verification

**Media playback-speed ramps are not implemented by this change.** Video/audio
remain at their original rate, preserving caption timing, waveform alignment and
linked audio sync. A separate media-retiming implementation is still required
for slow/fast-motion video with corresponding audio/caption mapping.

PASS: typecheck, `npm run test:timeline-motion`, advanced-edit/audio/caption
regressions, timeline scrubbing, caption motion/highlight combinations and all
63 main tests. The motion suite checks interpolation, Bezier curves, velocity
integration, presets, trim/split/roll/slide continuity, copy isolation, JSON
roundtrip, validation and unchanged legacy styles. Shared motion files are
lint-clean.

Pending: actual browser curve dragging/keyboard workflows, undo/reopen interaction
and freshly rendered movie/pixel checks for these new transforms/effects. Shared
renderer logic and model tests do not replace that QA. No application server
restart or production deployment was performed. Existing Markdown rules remain.
