# Professional Video & Audio Clipping Studio

## 1. Architecture Overview

ReelSpark's **Video & Audio Clipping Studio** is engineered as a local-first, desktop-class media editing studio running in your browser, backed by a secure local media service and Supabase PostgreSQL metadata storage.

```
+-----------------------------------------------------------------------------------+
|                            Browser UI (Next.js App)                              |
|                                                                                   |
|  [Projects Dashboard]  [Media Library]  [Timeline & Clips]  [Merge]  [Export]    |
|                             |                             |                       |
|                             v                             v                       |
|                 Zustand Studio State Store       IndexedDB / LocalStorage         |
+-----------------------------+-----------------------------+-----------------------+
                              |                             |
             Local HTTP / JSON API (127.0.0.1)     Supabase PostgreSQL (Optional Sync)
                              |                             |
                              v                             v
+-----------------------------+---------+  +----------------+-----------------------+
|  Local Media Service (Port 4000)       |  |  Supabase PostgreSQL Database          |
|                                       |  |                                        |
|  * Bound strictly to 127.0.0.1        |  |  * clipping_projects                   |
|  * Safe argument arrays (no shell)    |  |  * media_assets                        |
|  * Real FFmpeg & FFprobe inspection   |  |  * clips                               |
|  * Health check: GET /health          |  |  * merge_recipes & items               |
|  * Probe: POST /api/probe             |  |  * export_jobs                         |
|  * Path validator: POST /api/validate |  |  * export_sources (provenance)         |
+---------------------------------------+  +----------------------------------------+
```

---

## 2. Key Architectural Guarantees

1. **Non-Destructive Local Media Processing**:
   Original video/audio files on your PC are never modified, moved, or deleted. All cuts, clips, and merges generate new derivative files.
2. **Metadata vs. Binaries Separation**:
   Original heavy video and audio files remain strictly on your local PC disk. Supabase stores only structured metadata, timestamps, recipes, and export job records.
3. **Resilient Local-First Fallback**:
   When Supabase is not configured or temporarily unavailable, all project creation, editing, clipping, and exports continue functioning 100% locally via browser storage and disk cache. When credentials are supplied, data syncs cleanly.
4. **Process Security**:
   - Local media service binds strictly to `127.0.0.1` by default.
   - Origin and Host verification prevents unauthorized cross-origin requests.
   - All FFmpeg and FFprobe processes execute via safe argument arrays (`execFile`) rather than unsafe shell-string interpolation.
   - Supabase service-role keys are strictly server-side and never exposed to the browser client.

---

## 3. Prerequisites

- **Node.js**: `v20` to `v24`
- **pnpm**: `v10+` or `v12+` (or `npm`)
- **FFmpeg & FFprobe**: Installed and accessible in system `PATH` or located in `./bin/ffmpeg.exe` and `./bin/ffprobe.exe`.

---

## 4. Setup & Running the Services

### Step 1: Environment Variables Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your environment variables:
```ini
# Local Media Service Configuration
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://127.0.0.1:4000
MEDIA_SERVICE_HOST=127.0.0.1
MEDIA_SERVICE_PORT=4000

# Supabase PostgreSQL Configuration (Optional - Local persistence active if omitted)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### Step 2: Start the Local Media Service
Run the standalone local media service on `http://127.0.0.1:4000`:
```bash
pnpm media-service
# Or using npm
npm run media-service
```

Verify service health via curl or browser:
```bash
curl http://127.0.0.1:4000/health
```
Response:
```json
{
  "status": "ok",
  "service": "reelspark-media-service",
  "version": "1.0.0",
  "host": "127.0.0.1",
  "port": 4000,
  "uptimeSeconds": 12,
  "ffmpeg": { "available": true, "path": "ffmpeg", "version": "ffmpeg version 7.x..." },
  "ffprobe": { "available": true, "path": "ffprobe", "version": "ffprobe version 7.x..." }
}
```

> **Note**: Even if the standalone service is not launched, ReelSpark includes an automatic internal API route fallback (`/api/clipping-studio/health`) that checks FFmpeg directly on the server, guaranteeing zero downtime.

### Step 3: Apply Supabase PostgreSQL Migrations
To set up your Supabase database schema:
1. Open the **SQL Editor** in your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open and paste the contents of:
   [`supabase/migrations/20261020000000_create_clipping_studio_schema.sql`](supabase/migrations/20261020000000_create_clipping_studio_schema.sql)
3. Click **Run**.
4. The following tables with indexes and Row Level Security will be created:
   - `clipping_projects`
   - `media_assets`
   - `clips`
   - `merge_recipes`
   - `merge_recipe_items`
   - `export_jobs`
   - `export_sources`

Alternatively, if using the Supabase CLI:
```bash
supabase db push
# or
supabase migration up
```

### Step 4: Start the Web Application
```bash
pnpm dev
# App opens on http://localhost:3000
```

---

## 5. Development Roadmap & Completed Capabilities

- **Phase 1 (Completed)**:
  - Architecture foundation, typed contracts (`contracts.ts`), and Zod validation schemas.
  - Standalone Node.js Media Service (`services/media-service/server.ts`) bound strictly to `127.0.0.1:4000`.
  - Supabase PostgreSQL migration (`20261020000000_create_clipping_studio_schema.sql`) with RLS and lineage indexes.
  - Local project/job persistence (`local-persistence.ts`) and Zustand store (`use-clipping-store.ts`).
  - Studio navigation bar and project dashboard with live service health diagnostics.
- **Phase 2 (Completed)**:
  - Media Library supporting drag-and-drop file ingestion, local PC path input, and missing media relinking.
  - Frame-accurate video preview player with `-1f` / `+1f` stepping, range loop playback, and In/Out markers (`I` / `O`).
  - Interactive timeline with scrubbable playhead, millisecond display, zoom (1x to 5x), and audio waveform visualization.
  - Bulk Timestamp Range Editor accepting multi-line inputs (`START to END | Name`), syntax validation, and batch clip creation.
  - Clips Library with inline renaming, duplicate/delete, audition preview, and direct export bridge to Caption Maker (`/caption-maker`).
- **Phase 3 (Completed)**:
  - The Merge Studio: Independent multi-recipe sequence builder (e.g., Recipe A: 2+8, Recipe B: 2+7, Recipe C: 3+8, Recipe D: 8+2).
  - Stream Copy vs. Filter Complex Concat Planner (`merge-planner.ts`): Automatically identifies identical media specs for zero-transcoding lossless stream copy (`-c copy`) in milliseconds, or generates safe filter complex pipelines when scaling/audio normalization is required.
  - Non-destructive recipe management: Reorder clips up/down, reverse sequence order, duplicate recipes with stable unique IDs, and remove clips without deleting source media.
- **Phase 4 (Completed)**:
  - Production FFmpeg export queue running on the local media service on `127.0.0.1:4000` with Next.js fallback.
  - Multi-scope export: Single Clip, Selected Clips, All Project Clips, or Merged Recipe Sequences.
  - Quality presets: Lossless stream copy, High (CRF 18), Balanced (CRF 23), and Fast draft (CRF 28).
  - Video-only, audio-only (MP3 / WAV), and combined video & audio output modes.
  - Real-time progress bar (0% - 100%) parsed from FFmpeg stderr streaming output.
  - Full bidirectional provenance (`export_sources`): Traces every exported file back to contributing clips and original media.
  - Collision-safe filename resolution with configurable token template (`{project}_{name}_{index}_{time}_{res}`).
- **Phase 5 (Completed)**:
  - Local-first persistence engine with full localStorage persistence and optional Supabase PostgreSQL sync.
  - Autosave crash recovery snapshots: Detects unexpected browser closes or crashes and allows one-click recovery.
  - 30-step Undo / Redo history engine with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`).
  - Missing file relinking: Safely updates file paths while keeping all dependent clips and recipes 100% valid.
- **Phase 6 & 7 (Completed)**:
  - End-to-end integration across all 5 studio tabs: Dashboard, Media Library, Timeline & Clips, Merge Studio, Export Queue.
  - Strict preservation of existing functionality outside Clip Finder: `/caption-maker` and `/social-post` are 100% preserved and untouched.
  - Switcher banner allows toggling between the Professional Clipping Studio and AI Speech Discovery & Moments explorer.
  - Full 63-test regression suite passing with zero build errors.
