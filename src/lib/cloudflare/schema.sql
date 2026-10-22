/**
 * Cloudflare D1 — Database Schema
 *
 * Run this with Wrangler to create all tables in your D1 database:
 *   npx wrangler d1 execute reelspark-db --file=src/lib/cloudflare/schema.sql
 *
 * Or for local dev:
 *   npx wrangler d1 execute reelspark-db --local --file=src/lib/cloudflare/schema.sql
 */

-- ─── Users & Authentication ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ─── Projects (AI Clip Finder) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled Project',
  status      TEXT NOT NULL DEFAULT 'QUEUED',
  -- QUEUED | UPLOADING | TRANSCRIBING | ANALYZING | DONE | ERROR
  source_type TEXT NOT NULL DEFAULT 'upload',
  -- upload | youtube
  youtube_url TEXT,
  local_video_path TEXT,
  r2_video_key    TEXT,    -- R2 object key for the uploaded video
  r2_audio_key    TEXT,    -- R2 object key for the extracted audio
  duration_seconds REAL,
  file_size_bytes  INTEGER,
  settings    TEXT NOT NULL DEFAULT '{}',   -- JSON: { durationLimit, geminiModel, ... }
  progress    TEXT NOT NULL DEFAULT '{}',   -- JSON: { step, percent, message }
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Transcript Segments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_segments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_sec   REAL NOT NULL,
  end_sec     REAL NOT NULL,
  text        TEXT NOT NULL,
  text_en     TEXT,
  seg_index   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transcript_project ON transcript_segments(project_id);

-- ─── Clip Candidates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clip_candidates (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  title_hindi     TEXT,
  title_english   TEXT,
  start_sec       REAL NOT NULL,
  end_sec         REAL NOT NULL,
  duration_sec    REAL NOT NULL,
  topic           TEXT,
  explanation     TEXT,
  explanation_hindi TEXT,
  explanation_english TEXT,
  transcript      TEXT,
  transcript_hindi TEXT,
  transcript_english TEXT,
  first_words     TEXT,
  last_words      TEXT,
  scores          TEXT NOT NULL DEFAULT '{}',   -- JSON: { meaningAndDepth, ... total }
  context_verification TEXT NOT NULL DEFAULT '{}',
  selected        INTEGER NOT NULL DEFAULT 1,   -- BOOLEAN
  render_status   TEXT NOT NULL DEFAULT 'idle', -- idle | rendering | done | error
  r2_output_key   TEXT,   -- R2 key of the rendered MP4
  r2_srt_key      TEXT,   -- R2 key of the SRT file
  r2_ass_key      TEXT,   -- R2 key of the ASS subtitle file
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_candidates_project ON clip_candidates(project_id);

-- ─── Clipping Studio Projects ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clipping_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  settings    TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Media Assets (Clipping Studio) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  r2_key          TEXT,           -- R2 object key (null if local-only)
  local_path      TEXT,           -- fallback for Render.com / local dev
  file_size_bytes INTEGER,
  metadata        TEXT NOT NULL DEFAULT '{}',  -- JSON: duration, width, height, fps, ...
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_project ON media_assets(project_id);

-- ─── Clips (Clipping Studio Timeline) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clips (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
  media_asset_id  TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  name            TEXT NOT NULL DEFAULT 'Clip',
  start_ms        INTEGER NOT NULL DEFAULT 0,
  end_ms          INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  order_index     INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id);

-- ─── App Settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('ai_provider',    '"cloudflare"'),
  ('cf_model',       '"@cf/meta/llama-3.1-8b-instruct"'),
  ('cf_whisper',     '"@cf/openai/whisper-large-v3-turbo"'),
  ('max_clip_duration', '60');
