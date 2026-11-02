# Advanced timeline editing

For word text and word-boundary edits inside caption clips, use the
[advanced caption timeline](timeline-caption-editing.md). For gain automation,
fades, detach and resync, see [audio editing](timeline-audio-editing.md). These
share the same source timing and history path as the clip operations below.

The editor keeps its version-1 project format. All edits pass through timeline
validation and the existing `onChange` history path; dragging previews a draft
and commits once on release. Invalid moves discard the draft and show an error.

- **Move / Trim:** drag a clip to move it or its edge to trim it. Compatible,
  unlocked destination tracks accept cross-track drops. Ctrl/Cmd or Shift-click
  selects multiple clips. Group/Ungroup uses the existing linked-selection model.
- **Ripple:** drag an edge to change the clip's duration and shift downstream
  clips across tracks. Left-edge edits retain the timeline start and alter source
  in. Clips crossing the cut must be split first. Linked clips must align.
- **Roll:** drag the shared edge between adjacent clips. One grows while the
  other shrinks; the pair's outer boundaries stay fixed.
- **Slip:** drag the clip body to adjust source in/out, retaining its timeline
  start and duration. Images and text have no temporal source and cannot slip.
- **Slide:** drag one clip or linked group between two adjacent neighbors. Its
  source and duration stay fixed; the neighbors trim to keep the outer span fixed.
  Every linked track must have aligned neighbors.
- **Duplicate / Ctrl+D:** append copies of the selection at the timeline end,
  preserving relative timing and creating new group IDs without overwriting clips.
- **Ripple delete:** delete selected linked clips and close only their newly
  empty time. Other tracks containing media prevent that time from collapsing.
- **Remove gaps:** close intervals empty across every track, including a leading
  gap. This intentionally preserves gaps covered by audio or overlays to retain
  synchronization. Timeline markers move with the compacted time.

Magnetic snapping remains optional. Slip ignores timeline snapping because it
changes source time, not timeline position. Source bounds, nonnegative timing,
minimum durations, locked affected tracks and supported overlaps are validated
atomically. Shortened fades are clamped inside their clips. No server restart,
schema migration or media rewrite is needed.

Verification: `npm run test:timeline-advanced`, timeline scrubbing and timeline
QA regression suites, and TypeScript checks. These cover model behavior and
rendered control contracts; full browser pointer QA is still pending.
