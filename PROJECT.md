# PROJECT: ReelSpark — Local-First Video to Reels Studio

## 1. Project Overview

**ReelSpark** is a professional, local-first web application engineered to extract the most motivational, philosophical, and thought-provoking short clips from long-form speeches, podcasts, and interviews (optimized for Osho speeches, Alan Watts, J. Krishnamurti, and deep educational talks).

Every discovered clip is strictly capped at **60 seconds**, contextually verified to ensure complete thoughts without dangling pronouns, ranked across a 7-factor scoring engine, synchronized with local timeline subtitles, and rendered locally with FFmpeg into vertical 9:16 reels and horizontal formats.

---

## 2. Core Features

- **Two Ingestion Workflows**:
  - **Upload Video File**: Local upload (MP4, MOV, WEBM, AVI) with real-time stream inspection using FFprobe.
  - **Public YouTube URL**: Extract YouTube ID, query Gemini video semantics, and prompt for an authorized local file when ready for FFmpeg rendering.
- **Strict 60-Second Cap**: All generated candidates are hard-capped at 60 seconds, with configurable presets (`≤15s`, `≤30s`, `≤45s`, `≤60s`, `Auto best`).
- **7-Factor Editorial Scoring Engine (0 - 100)**:
  - Meaning & Depth (25 pts)
  - Standalone Completeness (20 pts)
  - Opening Strength / Hook (15 pts)
  - Emotional & Intellectual Impact (15 pts)
  - Clarity (10 pts)
  - Conciseness (10 pts)
  - Audio Quality (5 pts)
- **Context Verification Guard**:
  - Detects dangling antecedent pronouns (e.g., "Because of that...", "Therefore he...") and flags or adjusts boundaries.
  - Checks for abrupt trailing conjunctions ("because", "and").
  - Snaps clip start/end timestamps to sentence and speech boundaries.
- **Timestamped Subtitle & SRT Pipeline**:
  - Full source video transcript.
  - Clip-specific transcript.
  - **Synchronized SRT files** where subtitles start at relative offset `00:00:00,000` of each clip.
  - **Burned-in Subtitles** via Advanced SubStation Alpha (`.ass`) rendering with customizable font size, outline, color, and vertical placement.
- **Local FFmpeg Rendering Engine**:
  - Original aspect ratio or Vertical 9:16 (Center crop or aesthetic blurred backdrop padding preserving speaker visibility).
  - Audio normalization using the EBU R128 standard (`loudnorm=I=-16:TP=-1.5:LRA=11`).
  - Output validation via FFprobe (duration ≤ 60s, streams, codecs, non-corrupt check).
- **Play, Download & Edit Studio Workflow**:
  - **Play Clip**: Dedicated high-visibility playback from card or header, with boundary looping, speed control (`1x`, `1.25x`, `1.5x`, `2x`), and live synchronized subtitle overlay.
  - **Edit Clip**: Millisecond precision trimmer with numeric inputs, quick-nudge buttons (`-1s`, `-0.5s`, `+0.5s`, `+1s`), topic selector, real-time context verification recalculation, live trim audition player, and custom cut SRT export.
  - **Download Clip**: One-click download for MP4 video (auto-renders if needed) and instant download for relative-synchronized SRT subtitle files.
- **Batch Export**:
  - Individual MP4 clip download.
  - Individual SRT subtitle download.
  - Batch ZIP export bundling all selected MP4s, SRTs, `manifest.json`, and `manifest.csv`.
- **Semantic Transcript Search**:
  - Natural language queries (e.g. *"Find the strongest moments where Osho explains fear and self-respect"*) with instant timestamp jumping and clip creation.
- **Timeline Coverage Tracker**:
  - Visual ruler displaying covered sections, analyzed percentages, and candidate marker pins.

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Next.js App Router                     │
│          (TypeScript, React 19, Tailwind CSS v4)          │
└─────────────┬───────────────────────────────┬─────────────┘
              │                               │
              ▼                               ▼
    ┌──────────────────┐            ┌──────────────────┐
    │  Client Browser  │            │  Local Backend   │
    │  - Dark Studio   │            │  Route Handlers  │
    │  - Scrubber/Trim │            │  - Upload/Probe  │
    │  - Video Preview │            │  - Analysis/STT  │
    │  - Subtitle Mod  │            │  - FFmpeg Render │
    │  - Export ZIP    │            │  - Safe Storage  │
    └──────────────────┘            └─────────┬────────┘
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    ▼                                                  ▼
         ┌─────────────────────┐                            ┌─────────────────────┐
         │  Google Gemini API  │                            │    Local Binaries   │
         │  - Video Semantics  │                            │  - FFmpeg 9.0.2     │
         │  - Audio STT (Hindi,│                            │  - FFprobe 9.0.2    │
         │    English, Hingl.) │                            │  - Local Filesystem │
         │  - Schema Validation│                            │  - Project Storage  │
         └─────────────────────┘                            └─────────────────────┘
```

- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js Next.js Route Handlers.
- **Media Engine**: Native local binaries `bin/ffmpeg.exe` and `bin/ffprobe.exe` (Gyan.dev full build with `libass`, `libx264`, `libopus`, `libfreetype`).
- **AI Processing**: Official `@google/genai` SDK communicating with Google Gemini server-side.
- **Local Workspace**: Isolated per-project directory structure inside `storage/projects/{id}/`.

---

## 4. AI Analysis Pipeline

1. **Inspection**: FFprobe inspects duration, stream codecs, fps, and audio channels.
2. **Speech-to-Text Pipeline**: FFmpeg extracts audio to a 16kHz mono audio track and uses Gemini multimodal audio transcription (supporting Hindi, English, and Hinglish speech).
3. **Chunking**: Transcripts are partitioned into 180-second overlapping windows with 30-second margins.
4. **Chronological Analysis**: Every section is analyzed to discover memorable moments, stories, and philosophical thoughts.
5. **Context Verification**: Candidates are checked for thought completeness, dangling pronouns, and boundary snapping.
6. **Editorial Scoring**: 7 factors evaluated to produce a 0-100 total score.
7. **Deduplication**: Eliminates overlapping candidate moments with >65% timeline collision.
8. **Coverage Calculation**: Records exact coverage percentages across the source video.

---

## 5. Video Input Methods

### A. Upload Video File
- Drag-and-drop or file picker.
- Supports MP4, MOV, WEBM, AVI, and MKV.
- Original source file is kept unaltered in `storage/projects/{id}/original/`.

### B. YouTube Public URL
- Extracts 11-character video ID.
- Analyzes video semantics via Gemini.
- If original video file is not stored locally, displays prompt:
  > *"AI analysis is available, but local clip rendering requires the original video file. Upload a copy you are authorized to use."*
- Allows attaching an authorized local video file anytime.

---

## 6. Local FFmpeg Rendering Studio

- **Command Generation**: Exact frame-accurate cuts using `-ss [start] -to [end] -i [input]`.
- **Vertical Formatting Options**:
  - `original`: Keeps original framing.
  - `vertical_crop`: 9:16 center crop scaled to 1080x1920.
  - `vertical_blur`: 9:16 blurred background padding:
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
- **Audio Normalization**: Broadcast loudnorm filter `loudnorm=I=-16:TP=-1.5:LRA=11`.
- **Burned Subtitles**: Compiles `.ass` file and injects `ass='path'` video filter.
- **Validation**: Inspects rendered output with FFprobe to ensure valid streams, non-corruption, and duration ≤ 60s.

---

## 7. Subtitle Generation & Synchronization

- **Relative Offset Calculation**: If clip starts at `00:12:30.000` in the source video, subtitle entries in the generated `.srt` and `.ass` file begin at relative time `00:00:00.000`.
- **Styling Customization**:
  - Font size (18px - 44px)
  - Primary color (HEX)
  - Outline color & border width
  - Vertical alignment (`bottom`, `middle`, `top`)

---

## 8. Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only) | Required for API mode |
| `GEMINI_MODEL` | Gemini Model identifier | `gemini-3.8-flash` |
| `FFMPEG_PATH` | Path to FFmpeg binary | `./bin/ffmpeg.exe` |
| `FFPROBE_PATH` | Path to FFprobe binary | `./bin/ffprobe.exe` |
| `PORT` | Local dev / production port | `3000` |

---

## 9. Installation & Startup

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env.local` and add your Google Gemini API key:
```bash
copy .env.example .env.local
```

### Step 3: Start the Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 10. Automated Testing

Run the full automated unit test suite (covering URL validation, timestamps, SRT offsets, context verification, 60s duration cap, security, and real FFmpeg rendering):
```bash
pnpm test
```

Run the end-to-end integration test against the running studio:
```bash
pnpm test:e2e
```

---

## 11. Security & Storage Safety

- **Path Traversal Guard**: All file access is validated with `assertSafePath` to prevent directory traversal attacks.
- **Safe Filenames**: Strict character whitelisting via `sanitizeFilename`.
- **Isolated Storage**:
  - `storage/projects/{id}/original/`
  - `storage/projects/{id}/rendered/`
  - `storage/projects/{id}/transcripts/`
  - `storage/projects/{id}/srt/`
  - `storage/projects/{id}/zips/`
- **Temp Cleanup**: Automated eviction of temporary processing files.

---

## 12. Troubleshooting

- **FFmpeg not found**: Verify that `bin/ffmpeg.exe` exists in the project root or specify `FFMPEG_PATH` in `.env.local`.
- **Gemini Quota Exceeded**: The application automatically logs rate limits and operates in local heuristic mode if credentials are unset.
- **Browser Video Playback**: Ensure the video format is browser-supported (H.264/AAC MP4 or VP8/VP9 WebM).

---

## 13. Privacy & Copyright Considerations

- Media is processed **locally** on your computer.
- Only audio/transcript segments sent for Gemini analysis leave your machine; final MP4 rendering and subtitle burning occur 100% locally.
- Respect copyright laws and only render videos you have authorization or fair use rights to adapt.

---

## 14. AI Reel Caption Video Maker (Image + Audio → Animated Caption Video)

The **AI Reel Caption Video Maker** is a dedicated studio (`/caption-maker`) for turning any voice recording or spoken clip plus a background image into a high-engagement, animated caption video ready for Instagram Reels, YouTube Shorts, TikTok, and Square feeds.

### Core Workflow:
```text
Upload Image + Audio (or Click "Create Reel" from any Clip Card)
      ↓
Transcribe with Word-Level Timestamps (Verbatim speech preservation)
      ↓
Auto-Detect Emotional & Motivational Keywords (Editable)
      ↓
Customize Caption Mode (Word-by-Word / Phrase Highlight / Kinetic)
      ↓
Select Platform Preset (9:16 Reel, 4:5 Portrait, 1:1 Square, 16:9 Landscape)
      ↓
Real-Time Canvas Preview with Interactive Scrubber & Waveform Timeline
      ↓
Local FFmpeg Rendering (Compositing Image + Audio + Burned-in ASS Subtitles)
      ↓
Download MP4 & Word/Phrase-level SRT
```

### Key Technical Capabilities:
1. **Word-Level Timestamps**: Strict timestamp synchronization (`{ id, text, start, end, isImportant }`) preserving verbatim speech in Hindi, Hinglish, and English without unauthorized translation.
2. **Keyword Emphasis Engine**: High-impact dictionary detecting emotional words (e.g. *Zindagi*, *Haar*, *Jeet*, *Focus*, *Dream*, *Success*) with 1-click manual override.
3. **Caption Modes**:
   - **Phrase Highlight**: Multi-word phrase with active word glow and scale punch.
   - **Word-by-Word**: High-tempo single word popup synced with the voice beat.
   - **Kinetic**: Dynamic scaling, pop, and kinetic emphasis.
4. **Platform Presets & Fit Modes**:
   - 9:16 Vertical (1080×1920) for Instagram Reels & YouTube Shorts.
   - 4:5 Portrait (1080×1350) for Instagram feed posts.
   - 1:1 Square (1080×1080) for feed carousels.
   - 16:9 Landscape (1920×1080) for YouTube.
   - Image fit modes: Cover, Contain, and Blurred enlarged backdrop.
5. **Interactive Studio Controls**:
   - Full timeline scrubber with simulated waveform bars and word duration tags.
   - Undo/Redo stack (`Ctrl+Z`, `Ctrl+Shift+Z`) and local storage persistence.
   - Keyboard shortcuts (`Space` to toggle play/pause, `←/→` to seek, `R` to render, `Ctrl+S` to save).
6. **"Create Reel" Card Bridge**:
   - Every candidate card in the AI Clip Finder features a **Create Reel** button that automatically loads the clip's transcript, title, audio, and duration into the Caption Maker.

