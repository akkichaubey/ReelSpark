# ReelSpark — Professional AI Reel Studio & Local-First Clip Finder

> Transform long-form podcasts, speeches, and video recordings into high-impact, virally styled vertical reels (9:16) with synchronized karaoke captions, custom typography, sound design, and AI smart editing.

---

## ⚡ Highlights

### 1. Professional AI Reel Studio (`/caption-maker`)
- **Word-by-Word Kinetic & Highlight Captions**: Exact verbatim speech synchronization in English, Hindi, and Hinglish with active-word pop and color highlights (`#FCD905`).
- **AI Reel Social Media Post Copywriter**: Generate viral hooks, post captions, CTAs, and hashtags isolated strictly to the selected clip's transcript.
- **Custom Brand Style Presets ("Save As My Style")**: Create, save, and reuse custom typography, glow colors, shadows, borders, text case, and safe-zone positioning.
- **Multi-Format Subtitle Exporter**: One-click download of `.srt` (with relative offsets starting at `00:00:00,000`), `.vtt` (WebVTT for web players), and clean `.txt` transcripts.
- **Interactive Audio Waveform Trimmer**: Visual waveform scrubber with draggable start and end handles, word boundary snapping, and real-time playback auditioning.
- **Custom Background Music (BGM) Library**: Upload MP3/WAV tracks, custom library storage, volume controls, start offset adjustment, fade-in / fade-out (0-5s), and auto-ducking during speech.
- **Advanced Text Case & 9-Position Guides**: Transform caption casing (UPPERCASE, lowercase, Sentence case, or original) and align captions to any of 9 screen positions with Instagram Reels and YouTube Shorts safe-zone guides.
- **Word-Level Timing Adjustment Studio**: Fine-tune individual word timestamps (-100ms, -50ms, +50ms, +100ms), snap adjacent words, distribute durations, and highlight audio gaps.
- **Advanced Multi-Resolution Export**: Render at 720p, 1080p Full HD, 2K QHD, or 4K UHD at 24, 25, 30, or 60 FPS with CRF quality controls and bitrate presets.
- **AI Smart Editing & Silence Studio**: Detect dead-air pauses and verbal fillers ("umm", "uh"), apply jump-cut edits with seamless audio, and score viral hooks with auto-highlighting.
- **Project Autosave, Version History & Crash Recovery**: Debounced background autosave (1200ms), 10-snapshot version history, one-click duplicate, `.reelproj` JSON file export/import, and automatic crash recovery banner.

### 2. Local-First AI Clip Finder (`/`)
- **Context Verification Guard**: Automatically inspects clip candidates for complete thoughts, flags dangling pronouns (e.g. *"Because of that..."*), and snaps timestamps to sentence boundaries.
- **7-Factor Editorial Scoring**: Ranks discovered moments from 0 to 100 on hook strength, emotional impact, clarity, conciseness, and depth.
- **Strict 60-Second Cap**: Clips are strictly constrained under 60 seconds with configurable presets (`≤15s`, `≤30s`, `≤45s`, `≤60s`).
- **Semantic Transcript Search**: Query full transcripts naturally: *"Find the strongest moments where Osho explains fear and self-respect"*.
- **Seamless "Create Reel" Bridge**: Push any discovered clip directly into the AI Reel Studio with its transcript, audio bounds, and duration pre-loaded.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** 22 or 24 (pinned in `.nvmrc`)
- **pnpm** package manager
- **FFmpeg & FFprobe**: Included in `./bin/` or detected from system PATH.

### 2. Configuration
Copy `.env.example` to `.env.local`:
```bash
copy .env.example .env.local
```
Configure your Google Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
```
*(Note: ReelSpark includes an intelligent local speech heuristic engine, so it runs seamlessly even before configuring an external API key!)*

### 3. Run the Studio
```bash
pnpm dev
```
Navigate to:
- **AI Clip Finder**: [http://localhost:3000](http://localhost:3000)
- **AI Reel Caption Studio**: [http://localhost:3000/caption-maker](http://localhost:3000/caption-maker)

### 4. Run Automated Tests
```bash
# Run comprehensive 56-suite test runner
pnpm test

# Run Next.js production build check
pnpm build
```

---

## 📖 Complete Documentation

- See [PROJECT.md](PROJECT.md) for complete architectural documentation, AI pipeline details, FFmpeg filter graphs, and security design.
- See [TESTING.md](TESTING.md) for the automated test matrix covering all 56 verification suites.

---

## 🔒 Local-First Security & Privacy

ReelSpark is intentionally **local-only by default**. All video processing, FFmpeg rendering, and project persistence occur locally on your machine.
- File system access is protected against directory traversal attacks via path assertions.
- Media uploads are checked against supported extensions and size bounds.
- Subtitle rendering is executed using native local FFmpeg binaries (`bin/ffmpeg.exe`).
- To expose the server remotely, set `REELSPARK_ALLOW_REMOTE=true` only behind your own reverse proxy with authentication and HTTPS.
