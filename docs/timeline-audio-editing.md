# Reel Maker audio waveform editing

## Controls

- Waveforms use cached FFmpeg PCM peaks. Audio, music and video clips with sound
  display the real source waveform. Silent source intervals stay flat.
- Select a clip with analyzed audio to reveal three range handles at its bottom:
  volume (0–200%), audio fade-in and audio fade-out. Pointer gestures preview a
  draft and produce one undo entry on release; cancellation discards the draft.
  Keyboard arrows adjust a focused handle. Narrow clips can use the inspector.
- Double-click for the inspector. Audio fades are independent of visual fades;
  old projects without audio fade fields retain their existing fades.
- Place the playhead inside the clip and choose **Add keyframe at playhead** in
  Audio automation. Edit gain or delete keys, then **Apply**. The gold line on
  the clip displays the envelope. Keys interpolate linearly and hold the nearest
  endpoint value outside their range.
- Keyframe gain multiplies clip volume; combined gain is capped at 200% before
  fades and ducking. A key gain of 100% leaves clip volume unchanged.
- Track **S** toggles solo; multiple tracks may solo. Mute overrides solo. Hidden
  tracks are excluded; caption/text tracks do not enter the mixer. Generated
  sound effects are suppressed while audio-capable tracks are soloed.
- Music's inspector exposes speech ducking. This uses timed transcript speech
  with an audible non-music clip and a 32% music level; muted or solo-excluded
  voice no longer ducks the music. It is not waveform-based
  automatic voice detection.

## Detach and sync

For a video with confirmed audio, **Detach audio · keep linked to video** creates
an audio track using the same source file, source in, timeline start, duration,
loop, volume and automation. The video clip is muted to avoid doubled sound.
Existing mute/hidden/solo state is respected. No upload, re-encoding or destructive
source change occurs.

The clips share a group, so move, trim, split and slip keep them synchronized.
Group/Ungroup remains available. **Resync with original video** restores an
independently edited audio clip's source in, timeline start, duration and loop,
then relinks the affected group. Missing/replaced video and locked tracks cause
an error. Split/copy operations remap detached references to the new video clips.
Repeated detach is rejected while its audio clip remains in the project.

## Data and compatibility

Optional version-1 fields: `TimelineTrack.solo`; `TimelineClip.audioFadeInMs`,
`audioFadeOutMs`, `audioKeyframes: { timeMs, gain }[]`, and `detachedFromId`.
Keyframe times are relative to the original source. Trim/split preserve the
curve; Slip changes the portion heard. Looping repeats the source-time curve.
Copies keep independent keyframe arrays. Player and Remotion export share the
same audio gain evaluator. Existing single-source integrations remain available.

Validation rejects malformed, duplicate or unordered keys, gain outside 0–200%,
negative fades and invalid solo settings. Up to 1,000 keys per clip are allowed.
Existing source, track, timing and clip limits continue to apply.

## Verification — 2026-10-31

`npm run test:timeline-audio` checks interpolation, source clocks after
trim/split/slip/loop, independent/legacy fades, gain limits, mute/solo, detachment,
idempotency, locks, no-audio guards, linked movement, resync, reference remapping,
immutable data and accessible native handles. See the timeline verification
guide for the results of additional regression and real-media checks.

Full browser pointer/keyboard/listening QA and a new export measuring automation
and solo remain pending. Shared renderer code does not replace those checks.
No application server restart or deployment was performed.
