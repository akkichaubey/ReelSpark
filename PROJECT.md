# PROJECT: ReelSpark — Local-First Video to Reels Studio

## 1. Project Overview

**ReelSpark** is a professional, local-first web application engineered to extract the most motivational, philosophical, and thought-provoking short clips from long-form speeches, podcasts, and interviews (optimized for Osho speeches, Alan Watts, J. Krishnamurti, and deep educational talks).

Every discovered clip is strictly capped at **60 seconds**, contextually verified to ensure complete thoughts without dangling pronouns, ranked across a 7-factor scoring engine, synchronized with local timeline subtitles, and rendered locally with FFmpeg into vertical 9:16 reels and horizontal formats.

---

## 2. Core Features

- **Two Ingestion Workflows**:
  - **Upload Media File**: Local upload supporting video (MP4, MOV, WEBM, AVI, MKV) and audio (MP3, WAV, M4A, AAC, OGG) up to 500MB with real-time stream inspection using FFprobe. Supports large files with Next.js 500MB proxy streaming.
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
- **Local-only by default**: Requests from non-local hosts are rejected unless
  `REELSPARK_ALLOW_REMOTE=true` is deliberately configured behind authentication.
- **Bounded uploads**: Media uploads are limited to 500 MB and checked against
  the supported extension set before disk processing.

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

## 14. AI Reel Maker (Image + Audio → Animated Caption Video)

The **AI Reel Maker** is a dedicated studio (`/reel-maker`) for turning any voice recording or spoken clip plus a background image into a high-engagement, animated caption video ready for Instagram Reels, YouTube Shorts, TikTok, and Square feeds.

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

---

## 15. Professional AI Reel Studio Engine (Advanced Capabilities)

The Studio upgrade adds 10 specialized, production-ready modules powering `/reel-maker`:

### 1. Dedicated AI Reel Social Media Post Copywriter Studio (`/social-post`, `generate-social/route.ts`)
- **Standalone Dedicated Page**: Accessible directly via `/social-post`, top navigation studio switcher, and clip cards.
- **Clip-Isolated Processing**: Strictly analyzes only the active clip's audio and transcript—guaranteed never to leak or reprocess the long source video.
- **Multilingual Support**: Hindi, English, and Hinglish generation.
- **6 Editorial Tones**: Motivational, Educational, Storytelling, Viral/Entertaining, Emotional, and Professional.
- **Structured Schema**: Produces 3 viral hook variations, 1 high-converting post caption with formatted emojis, 2 compelling calls to action (CTAs), and 15 targeted hashtags.
- **Context Preservation**: Bridges clip transcripts seamlessly from Clip Finder cards, Caption Maker projects in LocalStorage, or direct custom transcript entry.

### 2. Custom Brand Style Presets ("Save As My Style") (`custom-presets.ts`)
- Reusable typography and styling presets stored in browser LocalStorage.
- Built-in presets: Hormozi Pop, Devotional Gold, Beast Bold, Minimalist Modern, Cyberpunk Neon, and Elegant Serif.
- Users can customize font family, size, weights, glow, stroke, active word color, text effects, background style, and save as their own named brand preset.

### 3. Multi-Format Subtitle Exporter (`srt-generator.ts`)
- Standalone `.srt` generation with relative zero-based offsets (`00:00:00,000`).
- WebVTT (`.vtt`) format with cue indices, headers, and standard time formatting.
- Plain text (`.txt`) transcript export in both paragraph and sentence-break formats.

### 4. Interactive Waveform Drag Handles for Trimming (`CaptionTimeline.tsx`)
- Visual audio waveform canvas with draggable start and end handles.
- Snaps trim boundaries to speech word boundaries.
- Live audition playback scoped strictly within the active trim range.

### 5. Custom Background Music (BGM) Library (`custom-bgm.ts`)
- Upload custom MP3 and WAV background audio tracks with client-side file size and MIME validation.
- Persistent library storage in LocalStorage.
- Dual audio mixer with master voice volume (up to 200%), background music volume (0% - 100%), loop toggle, and start offset.
- Fade-in and fade-out envelope controls (0 to 5 seconds).
- Intelligent speech auto-ducking that reduces BGM volume by 70% during active spoken speech segments.

### 6. Text Transformations & 9-Position Safe Area Guides (`text-transform.ts`)
- Real-time text case transforms: `uppercase`, `lowercase`, `sentence`, or `original` case.
- Applied synchronously to Remotion/GSAP web preview and burned-in ASS FFmpeg subtitles.
- 9-position anchor grid (Top-Left, Top-Center, Top-Right, Center-Left, Center-Center, Center-Right, Bottom-Left, Bottom-Center, Bottom-Right) with customizable X and Y offset percentages.
- Instagram Reels & YouTube Shorts safe-zone overlay toggle (15% top margin, 20% bottom margin, 8% side margins).

### 7. Word-Level Timing Adjustment Studio (`timing-adjuster.ts`)
- Nudge individual word start/end timestamps by -100ms, -50ms, +50ms, or +100ms.
- Snap word starts to the preceding word's end timestamp.
- Distribute word durations evenly within phrases.
- Acoustic gap detection identifying awkward pauses (>300ms) between adjacent words.

### 8. Advanced Multi-Resolution Export Settings (`export-settings.ts`)
- **Resolution Presets**: 720p HD, 1080p Full HD, 2K QHD, 4K UHD.
- **Aspect Ratios**: 9:16 Vertical, 1:1 Square, 4:5 Portrait, 16:9 Landscape.
- **Frame Rate Selection**: 24 FPS (Cinematic), 25 FPS (PAL), 30 FPS (Standard), 60 FPS (Ultra Smooth).
- **Quality (CRF) Controls**: CRF 16 (Lossless/High), CRF 18 (Master), CRF 23 (Balanced), CRF 28 (Compact).
- **Encoder Tuning**: Ultrafast, fast, medium, and slower CPU presets with audio bitrate options from 128k to 320k.
- Automatic file size and render time estimations.

### 9. AI Smart Editing — Silence Studio & Viral Highlight Analyzer (`smart-editor.ts`)
- **Dead-Air & Silence Detection**: Scans transcript intervals and detects silences above a configurable threshold (0.3s to 2.0s).
- **Verbal Filler Removal**: Detects speech hesitations ("umm", "uh", "you know", "like") and flags them for excision.
- **Jump-Cut Audio Applicator**: Trims silences and filler segments while keeping word timestamps accurately synchronized.
- **AI Viral Highlight Analyzer**: Calculates hook score (0-100), overall viral score, and identifies punchline keywords to automatically mark with viral highlight styling.

### 10. Project Autosave, Version History Snapshots & Crash Recovery (`project-storage.ts`)
- **Debounced Autosave (1200ms)**: Automatically syncs active project state to LocalStorage.
- **Version History Snapshots**: Automatic and manual snapshot capture with FIFO capping at 10 snapshots.
- **Project Duplication**: 1-click duplication generating fresh project IDs and cloned state.
- **`.reelproj` JSON Export & Import**: Standardized project schema exchange format for backup and migration.
- **Crash Recovery Guard**: Detects unsaved sessions on reload and presents an immediate 1-click restore banner.

---

## 16. Multi-Platform Social Safe-Zone Engine & Overlay Studio (`safe-zone.ts`, `SafeAreaOverlay.tsx`)

A mathematically verified, responsive safe-zone measurement system built specifically for vertical Reels, Shorts, and Threads video:

### 1. Coordinate System & Base Canvas
- **Resolution**: $1080 \times 1920$ pixels (standard 9:16 portrait export canvas).
- **Even-Pixel Enforcement**: Dimensions divisible by 2 for H.264/H.265 encoder compatibility.
- **Normalized Percentages**: Invariant relative ratios scale smoothly across any responsive preview size without distortion or drift.

### 2. Platform Safe-Zone Specifications
| Platform | Top Danger Zone | Bottom Danger Zone | Right Action Rail | Usable Safe Canvas | Source Standard |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Instagram Reels** | 14.0% (~269px) | 22.0% (~422px) (35% warning) | 15.0% (~162px) | $853 \times 1229\,\text{px}$ | Meta Official Guidelines |
| **Facebook Reels** | 14.0% (~269px) | 26.0% (~499px) | 14.0% (~151px) | $864 \times 1152\,\text{px}$ | Meta Standard Specs |
| **YouTube Shorts** | 10.0% (~192px) | 23.0% (~442px) (+1.2% scrubber) | 14.0% (~151px) | $870 \times 1286\,\text{px}$ | YouTube Creator Docs |
| **Threads Video** | 9.0% (~173px) | 20.0% (~384px) | None (0%) | $950 \times 1363\,\text{px}$ | Threads Mobile Specs |

### 3. Dynamic Visual Guides
- **Viral Hook & Headline Box**: `Y: 16%–72%` horizontally centered.
- **Eye-Line Guide**: Rule-of-thirds eye level reference at `Y: 33.3%`.
- **4:5 In-Feed Crop Lines**: `Y: 14.84375%–85.15625%` ($1080 \times 1350\,\text{px}$) for Instagram/Facebook feed previews.
- **1:1 Profile Grid Center Square**: `Y: 21.875%–78.125%` ($1080 \times 1080\,\text{px}$) for profile grid displays.
- **9-Position Anchors**: Top-Left through Bottom-Right strictly clamped inside the calculated safe boundaries.

### 4. Interactive Calibration Controls
- Independent sliders for Top Danger, Bottom Danger, Right Margin, and Left Margin.
- Live pixel readouts and usable canvas calculation.
- 1-click **Reset to Official** button restoring platform-verified defaults.

---

## 17. Unified Caption & Thumbnail Cover Cohesion (`ThumbnailPreview.tsx`, `ThumbnailStylePanel.tsx`)

ReelSpark enforces unified safe-zone cohesion across both the video playback preview and the thumbnail cover creator:
1. **Two-Way Synchronization**: Platform selection or manual margin adjustments in either the Video Reel view or Thumbnail view instantly propagate to both with zero state divergence.
2. **Thumbnail Profile Grid Optimization**: The green 1:1 Profile Grid safe zone highlights the exact square tile visible on Instagram profiles, including simulated play counts (`▶ 1.2M`) in the lower left corner.
3. **Zero Layout Shift**: Both previews maintain a strict single-line `h-7` bottom status bar, preventing UI jumping when switching between video reel and thumbnail views.
4. **Export Cleanliness**: All overlay guides, grids, and labels exist purely in the editor DOM (`pointer-events-none`) and never appear in exported ASS subtitles, rendered MP4s, or downloaded PNG/JPEG thumbnail covers.


