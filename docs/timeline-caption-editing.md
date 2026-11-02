# Advanced caption timeline — 2026-10-31

## Using the controls

Caption words appear inside existing caption clips, with no extra row. Click a
word to seek and select its clip. Double-click a word, or focus it and press
Enter, to edit text. Enter/blur saves; Escape cancels. Text edits retain word
timing, importance, speaker and other metadata. The left Transcript panel stays
available and uses the same source data.

Drag a word's start/end handle to adjust its source timing. Focus a handle and
use Left/Right for a one-frame adjustment. Boundaries clamp to clip in/out and
neighboring words; insufficient space produces an error. Drag release commits
one undo step, cancellation discards the draft. Use zoom for short words. The
small top grip still moves the whole caption clip; its outer trim edges remain.

Active-word highlighting follows the existing half-open timing evaluator: the
start is included, end excluded, and speech gaps have no active word. Timeline
word controls are virtualized around the horizontal viewport, retaining the
edited/dragged word while it is active.

**Auto-sync speech** runs the existing speech-recognition/transcription flow for
the current spoken source. It may replace transcript text and timing. It does
not transcribe a selected archived source. Its existing quality badge distinguishes
recognizer word timestamps from phrase estimates; no new precision claim is
made. Manual timing edits use the existing `phrase-estimated` provenance so they
are not presented as unchanged recognizer timestamps. Spelling edits retain
timing provenance. Word editing is disabled during synchronization.

**Caption effects** opens the existing styles panel, including caption mode,
spoken-word highlighting, typography, nine motion presets and seven highlight
effects. The shared caption renderer retains the existing animation behavior.

## Source data, locks and compatibility

Edits update the shared source, not an independent overlay. All clips reusing that
source see the same word changes; timeline placement, source offsets and trims
still map those words into each clip. Archived sources update their retained
snapshot without overwriting the current spoken transcript. Group text and
group envelopes are rebuilt together with the transcript.

Any locked caption track using that source blocks word edits. The existing
history path saves each edit, invalidates obsolete exports and supports
undo/redo. No new project fields or version migration were introduced. Saved
Reels and portable JSON retain the existing source/group data structure.

## Verification

`npm run test:timeline-captions` checks spelling/timing edits, frame/neighbor/clip
bounds, locks, source immutability, archived-source isolation, source-to-timeline
render mapping, import roundtrip, silence/end-boundary highlighting and slider
markup. Caption preview regression tests cover nine motion presets × seven
highlight effects × two modes. Existing timeline scrubbing tests also pass.
The main 63-test application suite passed. Shared caption modules are lint-clean;
type checking passed. Virtualized word controls and timing provenance also have
regression coverage.

New browser pointer/touch/keyboard and undo/reopen workflows remain pending.
The actual external speech-recognizer call and a fresh exported movie were not
run for this update. Do not interpret model/markup checks as browser verification.
No application server restart or production deployment was performed.
