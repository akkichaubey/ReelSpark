# Test Guide: AI Clip Finder Studio

This document describes the testing strategy and verification procedures for the **AI Clip Finder** application.

---

## 1. Automated Test Suite

Run the full automated test suite using:

```bash
pnpm test
```

### Automated Test Matrix

| Test Suite | File Tested | Verification Objective |
| :--- | :--- | :--- |
| **YouTube URL Validation** | `app/api/projects/[id]/youtube/route.ts` | Validates standard `watch?v=`, `youtu.be/`, `embed/`, and handles invalid URLs |
| **Timestamp Conversion** | `src/lib/srt.ts` | Tests millisecond accuracy for SRT (`HH:MM:SS,mmm`) and ASS (`H:MM:SS.cc`) |
| **SRT Offset Synchronization** | `src/lib/srt.ts` | Verifies subtitles in clips starting at e.g. 12:30 offset to `00:00:00,000` |
| **Subtitle Line Breaking** | `src/lib/srt.ts` | Checks multi-line wrap formatting for readability |
| **Context Verification Engine** | `src/lib/context-verifier.ts` | Checks dangling pronouns ("Because of this..."), trailing conjunctions, and sentence boundaries |
| **60-Second Cap Enforcement** | `src/lib/ranking.ts` | Confirms strict rejection of any candidate exceeding 60.0 seconds |
| **Candidate Deduplication** | `src/lib/ranking.ts` | Eliminates overlapping candidates (>65% collision) and preserves highest score |
| **Filesystem Security** | `src/lib/storage.ts` | Tests path traversal prevention (`../../`), directory isolation, and filename sanitization |
| **Timeline Coverage** | `src/lib/transcript.ts` | Verifies merged time ranges and percentage calculation |
| **Semantic Search** | `src/lib/transcript.ts` | Validates natural language and keyword matching over spoken text |
| **FFmpeg Media Rendering** | `src/lib/ffmpeg.ts` | Generates synthetic video, cuts clip, crops vertical 9:16, burns subtitles, normalizes audio, and validates via FFprobe |

---

## 2. End-to-End Manual Testing Workflow

### Scenario A: Video Upload and Clip Extraction
1. Start the dev server: `pnpm dev`.
2. Open `http://localhost:3000`.
3. In the creation dialog:
   - Enter a title (e.g. *Osho on Meditation & Ego*).
   - Drop a video file (MP4/MOV/WEBM).
   - Set max duration to `≤ 45s` and aspect ratio to `Vertical 9:16 (Center Crop)`.
   - Click **Launch Project**.
4. Observe the FFprobe inspection complete and metadata badges populate.
5. Click **Run Full AI Analysis**:
   - Watch the real processing states: `TRANSCRIBING` → `ANALYZING` → `VERIFYING` → `RANKING` → `COMPLETED`.
6. Inspect discovered clip cards:
   - Check the **Score Ring** (0-100) and click **Breakdown** to view the 7 editorial factors.
   - Check the **Context Verification** badge (ensuring complete thoughts).
7. Click **Trim** on a clip:
   - Adjust start and end timestamps.
   - Note the real-time duration counter guarding the 60s limit.
8. Click **Subtitles**:
   - Test changing font size, outline, and position.
   - Preview the simulated 9:16 reel frame.
9. Click **Render Clip**:
   - Verify FFmpeg re-encodes the clip locally.
   - Once completed, test downloading the MP4 and SRT.
10. Click **Export ZIP** in the header to download the complete archive with `manifest.json` and `manifest.csv`.

### Scenario B: Public YouTube URL Ingestion
1. Click **New Project**.
2. Select the **YouTube Public URL** tab.
3. Paste a public YouTube video URL (e.g., `https://www.youtube.com/watch?v=...`).
4. Click **Launch Project**.
5. Observe the clear warning banner:
   > *"AI analysis is available, but local clip rendering requires the original video file. Upload a copy you are authorized to use."*
6. Click **Upload Video** inside the banner to attach your authorized local video copy.
7. Once attached, local FFmpeg rendering unlocks immediately!
