# Thumbnail cover and exports

In **Thumbnail Style & Cover Hook → Text**, use **AI Titles** beside
**Thumbnail Title Hook** to generate ideas from the reel transcript. It defaults
to Instagram Reels for cover-style hooks. Choose **Apply to Thumbnail** to update
the cover text and preview. The reel name is edited separately. The thumbnail
title follows the existing undo, save, and cover export workflow.

Choose **Brush Headline** at the top of **Presets**, or toggle it in **Text**.
The first line is black on a yellow brush stroke. The following lines alternate
white and yellow. Press Enter for a deliberate line break. The style works
with Hindi and Hinglish and carries through to preview, image download, and
configured video covers. Turn it off in **Text**, or choose another preset to
reset the treatment.

For the reference layout, choose **Use example text** in the Text tab while
Brush Headline is active. It fills the title with four editable lines. The
first line and its textured yellow brush tilt together. The second line is
large and white, and the remaining lines are smaller.

The Reel Maker timeline begins with a dedicated Thumbnail section. Choose
**Thumbnail** from Add track, or use Add thumbnail in that section. Edit opens
the existing Thumbnail Style editor. Replace accepts PNG/JPG/WebP (up to 5 MB)
and verifies that the file decodes before changing the project. Remove affects
only the cover. Undo/Redo, autosave, project JSON and Saved Reels retain the
optional `thumbnailCover` configuration.

The cover is a pre-playback poster, separate from editable clips. It appears
when the preview is paused at zero and disappears as playback starts. Video,
audio, captions, overlays, effects and transitions keep their original content
timestamps; no source clip is moved, trimmed or deleted to make room for it.
The cover section is shown before the content timeline rather than inserting
an editable 10 ms segment into every track.

## Export choices

- **Export with Thumbnail**: the default instant mode covers encoded frame zero
  and optionally attaches MP4 artwork. The next frame contains the original
  video. Audio packets, subtitle timestamps, frame count and duration stay
  unchanged. There is no concatenated intro, silence or playback delay.
- **Export without Thumbnail**: the renderer does not merge a cover or attach
  cover artwork. Download Thumbnail JPG / PNG exports the current cover
  independently, including a replacement image. This supports separate custom
  thumbnail uploads on platforms such as YouTube.

The requested duration is **0.01 seconds**. A constant-frame-rate MP4 cannot
represent a partial frame: the actual minimum is one frame (40 ms at 25 FPS,
33.3 ms at 30 FPS, 16.7 ms at 60 FPS). The export dialog shows this value. This
does not add time to the video; the first video frame is visually covered.
Container artwork and a platform's selected thumbnail are different: platforms
may ignore MP4 artwork or choose another frame, so a separately uploaded custom
thumbnail remains available.

Advanced cover settings preserve the earlier extended opening overlay and
artwork-only strategies. Choosing an extended overlay intentionally covers
more opening frames without retiming the original tracks.

Preview, downloads and configured-cover export use the same canvas generator,
so edits do not accidentally reuse a previous render's cached poster. Removing
or replacing a cover never calls media deletion. Uploaded replacement data uses
the existing safe custom-background image retention path for Saved Reels.

## Brush Headline verification — 2026-11-18

- **PASS** Reference-style follow-up checked the textured brush, shared tilt,
  line scale and colors, example text control, TypeScript, and scoped ESLint
  (zero errors, two warnings). Existing presets matched across four ratios.
- **PASS** The Presets placement follow-up verified the first card, active
  selection in Presets and Text, and isolation from the shared preset list.
- **PASS** TypeScript, scoped ESLint (zero errors, two warnings), Hindi and
  Hinglish line breaks and colors, and settings JSON round-trip.
- **PASS** Existing preset drawing commands matched the previous renderer
  across four aspect ratios, including the presets used by Thumbnail Creator.
- **FAIL** The production build stopped at the Turbopack CSS loader error
  while processing `theme.css`.
- **NOT RUN** Browser preview, responsive and theme checks, save/reopen,
  actual PNG/JPEG downloads, and MP4 cover export.

## AI Titles verification — 2026-11-18

- **PASS** TypeScript and scoped ESLint (zero errors, 22 warnings). A fixture
  checked button placement, cover title updates, project-name and caption
  preservation, and rejection of a stale reel.
- **FAIL** The production build stopped when the Turbopack CSS loader subprocess
  exited while processing `globals.css`.
- **NOT RUN** Browser generation, theme and responsive checks, undo, save/reopen,
  and exported cover preview.

## Verification — 2026-11-02

- Two browser cases passed: add/remove/undo/save/reopen and initial playback;
  invalid/valid image replacement; export option payloads; real JPG/PNG download
  file signatures.
- `npx tsx tests/thumbnail_cover_render.test.ts` exercised actual FFmpeg output at 25 and 60 FPS,
  including frame-only, frame-plus-artwork and artwork-only modes. It measured
  first/next-frame pixels, unchanged frame counts/start times/duration, and
  identical copied audio hashes. Original no-cover sources remained unchanged.
- Saved Reels retention/reload assertions include the optional cover data.
- Full browser regression, final types/lint/build results are recorded in the
  [QA/QC report](qa-qc-2026-11-01.md): 28/28 browser cases, 63/63 main tests,
  7/7 final responsive/cover cases, typecheck and production build passed.
  Changed-source lint passed with existing warnings; repository-wide lint debt
  and live-account integration limitations remain documented in that report.

Tests reuse the user's localhost:3000 server and isolated project fixtures;
they do not create live cloud accounts or publish media.
