# ReelSpark — Local-First Video to Reels Studio

> Extract high-impact, philosophical, and motivational short clips (under 60 seconds) from long-form speeches, podcasts, and interviews. Built for speeches like Osho, Alan Watts, and deep conversations.

---

## ⚡ Highlights

- **Local-First Processing**: Uses local FFmpeg 9.0.2 binaries for frame-accurate video cutting, vertical re-framing (9:16 center crop or blurred background padding), and broadcast audio normalization (`loudnorm`).
- **AI-Powered Discovery**: Powered by Google Gemini (`gemini-2.5-flash` / `gemini-2.0-flash`) with structured schema validation.
- **Context Verification Guard**: Automatically inspects clip candidates for complete thoughts, flags dangling pronouns (e.g. *"Because of that..."*), and snaps timestamps to sentence boundaries.
- **Synchronized Subtitles**: Produces standalone `.srt` subtitle files with relative offsets re-synchronized to `00:00:00,000`, as well as permanently burned-in `.ass` styled subtitles.
- **Batch Export**: Download individual MP4s, individual SRTs, or batch ZIP bundles containing clips and comprehensive JSON/CSV manifests.
- **Semantic Transcript Search**: Query full transcripts naturally: *"Find the strongest moments where Osho explains fear and self-respect"*.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ (tested on Node v24)
- **FFmpeg & FFprobe**: Included in `./bin/` or detected from system PATH.

### 2. Configuration
Copy `.env.example` to `.env.local`:
```bash
copy .env.example .env.local
```
Add your Google Gemini API key:
```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

*(Note: The application includes an intelligent local speech heuristic engine, so it runs seamlessly even before you configure an external API key!)*

### 3. Run the Studio
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

### 4. Run Automated Tests
```bash
# Unit & integration test suite (11/11 tests)
npm test

# End-to-end API & FFmpeg pipeline test
npm run test:e2e
```

---

## 📖 Complete Documentation

See [PROJECT.md](file:///d:/htdocs/Goal/react/ai-video/PROJECT.md) for full architectural documentation, FFmpeg filter pipeline details, and security features.
See [TESTING.md](file:///d:/htdocs/Goal/react/ai-video/TESTING.md) for the automated test matrix and manual test instructions.
