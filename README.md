# ReelSpark — Professional AI Reel Studio & Local-First Clip Finder

> Transform long-form podcasts, speeches, and video recordings into high-impact, virally styled vertical reels (9:16) with synchronized karaoke captions, custom typography, sound design, and AI smart editing.

---

## ⚡ Highlights

### 1. Professional AI Reel Studio (`/reel-maker`)
- **Word-by-Word Kinetic & Highlight Captions**: Exact verbatim speech synchronization in English, Hindi, and Hinglish with active-word pop and color highlights (`#FCD905`).
- **Social Media Reel Safe-Zone Measurement Engine**: Verified boundary calculation and guides for **Instagram Reels** (14% top / 22% bottom / 15% rail / 35% warning), **Facebook Reels** (14% top / 26% bottom / 14% rail), **YouTube Shorts** (10% top / 23% bottom / 14% rail / 1.2% scrubber), and **Threads Video** (9% top / 20% bottom / no rail).
- **Unified Reel Caption & Thumbnail Safe-Zone Studio**: Interactive calibration sliders (Top, Bottom, Right margin, Left margin), real-time usable canvas computation ($853 \times 1229\,\text{px}$ to $950 \times 1363\,\text{px}$), 1-click reset to official specs, Instagram 1:1 profile grid center square ($1080 \times 1080\,\text{px}$) and 4:5 in-feed crop lines ($1080 \times 1350\,\text{px}$).
- **Two-Way Safe-Zone Synchronization**: Seamless real-time state synchronization between Video Reel caption playback and Thumbnail Cover creator with zero layout shifting.
- **Thumbnail Cover Design Studio**: 6 high-converting presets (Hormozi, Cyber, Minimal, Cinema, Alert, Glass Card), 6 studio gradient backdrops, 1:1 Instagram profile grid safe zone preview with follower/play mock overlay, and direct PNG/JPEG download.
- **AI Reel Social Media Post Copywriter**: Generate viral hooks, post captions, CTAs, and hashtags isolated strictly to the selected clip's transcript.
- **Custom Brand Style Presets ("Save As My Style")**: Create, save, and reuse custom typography, glow colors, shadows, borders, text case, and safe-zone positioning.
- **Multi-Format Subtitle Exporter**: One-click download of `.srt` (with relative offsets starting at `00:00:00,000`), `.vtt` (WebVTT for web players), and clean `.txt` transcripts.
- **Interactive Audio Waveform Trimmer**: Visual waveform scrubber with draggable start and end handles, word boundary snapping, and real-time playback auditioning.
- **Custom Background Music (BGM) Library**: Upload MP3/WAV tracks, custom library storage, volume controls, start offset adjustment, fade-in / fade-out (0-5s), and auto-ducking during speech.
- **Advanced Text Case & 9-Position Guides**: Transform caption casing (UPPERCASE, lowercase, Sentence case, or original) and align captions to any of 9 screen positions with Instagram Reels, Facebook Reels, and YouTube Shorts safe-zone guides.
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

For Google authentication setup and verification, see [Google sign-in](GOOGLE_SIGN_IN.md). Email/password login is retained; demo access is disabled by default.

For direct social publishing configuration, security fixes, queue recovery and actual
verification results, see [Social publishing verification](SOCIAL_PUBLISHING_REVIEW.md).
Local callbacks follow localhost/127.0.0.1 automatically. Render deployments can
detect their public URL, and the Blueprint generates a stable publishing key.
Cloud credentials, migrations and provider-approved callbacks still require initial
configuration. Check authenticated `/api/social-publishing/status` for missing setup.

For upload cancellation, server-side cleanup, storage usage monitoring, retention
defaults and the deployment storage limits, see [Storage lifecycle management](STORAGE_LIFECYCLE.md).

### 1. Prerequisites
- **Node.js**: `>=24.22.1 <25` (pinned to 24.22.1 via nvm).
- **npm** package manager

Windows: before npm commands, run `. .\scripts\use-project-node.ps1` in this
project's PowerShell terminal. This avoids the installed standalone Node
shadowing nvm. See [Node runtime setup and verification](NODE_RUNTIME.md).
- **FFmpeg & FFprobe**: Included in `./bin/` or detected from system PATH.

### 2. Configuration
Copy `.env.example` to `.env.local`:
```bash
copy .env.example .env.local
```
Configure your Ollama host and model:
```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```
*(Note: ReelSpark uses 100% free and local AI via Ollama with zero external API key requirements. Run `ollama serve` and `ollama pull llama3.2` on your machine!)*

### 3. Run the Studio
```bash
npm run dev
```
Navigate to:
- **AI Clip Finder**: [http://localhost:3000](http://localhost:3000)
- **AI Reel Maker**: [http://localhost:3000/reel-maker](http://localhost:3000/reel-maker)
- **AI Social Post Studio**: [http://localhost:3000/social-post](http://localhost:3000/social-post)

### 4. Run Automated Tests
```bash
# Run comprehensive core test runner
npm test

# Run social media safe-zone measurement system test
npm run test:safe-zone

# Run caption & thumbnail safe-zone two-way sync test
npm run test:safe-sync

# Run comprehensive preset analysis & isolation test
npm run test:presets

# Run TypeScript type check
npm run typecheck

# Run Next.js production build check
npm run build
```

### 5. Video & Audio Clipping Studio Services (Phase 1)
```bash
# Start standalone local media service on 127.0.0.1:4000
npm run media-service

# Apply Supabase database migrations (optional, local persistence active by default)
# See CLIPPING_STUDIO.md for instructions and SQL file
```

---

## ☁️ Cloud Deployment on Render (Recommended)

The production service runs on [Render](https://render.com) from the GitHub
repository's `codex/server-readiness` branch. Render uses the repository's
[`Dockerfile`](Dockerfile) and [`render.yaml`](render.yaml); commits pushed to
that connected branch trigger deployment. Check Render's Deploys page for the
actual live commit and build status.

Cloud media persistence requires server-only Cloudflare D1 and private R2
credentials, the migrations listed in [CLOUD_PERSISTENCE.md](CLOUD_PERSISTENCE.md),
and the cloud feature flags enabled in Render. Do not make the R2 bucket public.
The deployed Render Free service has ephemeral local disk and may sleep, so
uploads must be backed up to R2 to survive restarts; its in-process cleanup
timer only runs while the service is awake. A persistent disk or always-on
scheduled worker is a separate hosting capability and may incur charges.

The existing `cf:deploy` Pages upload is not a complete hosting path for this
Node application because native FFmpeg/Chromium processing and server storage
require a Node-capable server/container.

---

## 📖 Complete Documentation

- See [CLIPPING_STUDIO.md](CLIPPING_STUDIO.md) for the complete architecture, Supabase schema migrations, local media service, and development roadmap.
- See [PROJECT.md](PROJECT.md) for complete architectural documentation, AI pipeline details, FFmpeg filter graphs, and security design.
- See [TESTING.md](TESTING.md) for the automated test matrix covering all verification suites.

---

## 🔒 Local-First Security & Privacy

ReelSpark is intentionally **local-only by default**. All video processing, FFmpeg rendering, and project persistence occur locally on your machine.
- File system access is protected against directory traversal attacks via path assertions.
- Media uploads are checked against supported extensions and size bounds.
- Subtitle rendering is executed using native local FFmpeg binaries (`bin/ffmpeg.exe`).
- To expose the server remotely, set `REELSPARK_ALLOW_REMOTE=true` only behind your own reverse proxy with authentication and HTTPS.
See [CLOUD_PERSISTENCE.md](CLOUD_PERSISTENCE.md) for D1 project persistence,
private R2 media backup/restore, migrations, free-tier guard limits and the
current hosting limitations.
