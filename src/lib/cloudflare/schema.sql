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

-- Durable Clip Finder and Clipping Studio project documents.
CREATE TABLE IF NOT EXISTS project_documents (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_project_documents_owner
  ON project_documents(owner_user_id, kind, updated_at DESC);
CREATE TABLE IF NOT EXISTS deleted_clip_finder_projects (
  project_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deleted_clip_finder_projects_owner
  ON deleted_clip_finder_projects(owner_user_id, deleted_at);
CREATE TABLE IF NOT EXISTS deleted_clipping_projects (
  project_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_cleanup_queue (
  object_key TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_cleanup_age ON media_cleanup_queue(created_at);
CREATE TABLE IF NOT EXISTS media_cleanup_state (
  state_key TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at TEXT NOT NULL
);

-- ─── Private media recovery catalog ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_media (
  relative_path TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_media_owner ON private_media(owner_user_id);

-- App-side R2 free-tier guard (migration 0005).
CREATE TABLE IF NOT EXISTS cloud_media_usage (
  month_key TEXT PRIMARY KEY,
  class_a_ops INTEGER NOT NULL DEFAULT 0 CHECK (class_a_ops >= 0),
  class_b_ops INTEGER NOT NULL DEFAULT 0 CHECK (class_b_ops >= 0)
);
CREATE TABLE IF NOT EXISTS private_media_upload_reservations (
  relative_path TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reserved_bytes INTEGER NOT NULL CHECK (reserved_bytes >= 0),
  pending_object_key TEXT,
  started_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_media_reservations_started
  ON private_media_upload_reservations(started_at);
CREATE INDEX IF NOT EXISTS idx_private_media_reservations_object
  ON private_media_upload_reservations(pending_object_key);

-- ─── User Profiles (Extended Details & Customization) ────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name    TEXT,
  last_name     TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  preferences   TEXT NOT NULL DEFAULT '{}', -- JSON: default tone, language, platform
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Social Media Accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_accounts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL, -- 'facebook' | 'youtube' | 'instagram' | 'threads' | 'website'
  account_url   TEXT NOT NULL,
  display_name  TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 0, -- BOOLEAN
  enabled       INTEGER NOT NULL DEFAULT 1, -- BOOLEAN
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id);

-- ─── Social Link Engine Preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_link_preferences (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  include_website         INTEGER NOT NULL DEFAULT 1,
  include_other_socials   INTEGER NOT NULL DEFAULT 1,
  exclude_target_platform INTEGER NOT NULL DEFAULT 1,
  custom_heading          TEXT NOT NULL DEFAULT '🔗 Connect with us:',
  display_separate_lines  INTEGER NOT NULL DEFAULT 1,
  link_order              TEXT NOT NULL DEFAULT '[]', -- JSON: array of platform keys or account IDs
  eligible_account_ids    TEXT NOT NULL DEFAULT '[]', -- JSON: array of account IDs
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

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

-- ─── Merge Recipes (Clipping Studio) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merge_recipes (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  output_format     TEXT NOT NULL DEFAULT 'mp4',
  target_resolution TEXT NOT NULL DEFAULT 'source',
  normalize_audio   INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merge_recipes_project ON merge_recipes(project_id);

-- ─── Merge Recipe Items (Ordered sequence of clip references) ─────────────────
CREATE TABLE IF NOT EXISTS merge_recipe_items (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT NOT NULL REFERENCES merge_recipes(id) ON DELETE CASCADE,
  clip_id     TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  transition  TEXT NOT NULL DEFAULT 'none',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merge_recipe_items_recipe ON merge_recipe_items(recipe_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_merge_recipe_items_clip ON merge_recipe_items(clip_id);

-- ─── Export Jobs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_jobs (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
  job_type         TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued',
  progress_percent REAL NOT NULL DEFAULT 0.0,
  output_path      TEXT,
  error_message    TEXT,
  settings_json    TEXT NOT NULL DEFAULT '{}',
  started_at       TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_export_jobs_project_status ON export_jobs(project_id, status);

-- ─── Export Sources (Bidirectional Provenance) ────────────────────────────────
CREATE TABLE IF NOT EXISTS export_sources (
  id              TEXT PRIMARY KEY,
  export_job_id   TEXT NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
  clip_id         TEXT REFERENCES clips(id) ON DELETE SET NULL,
  source_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  start_ms        INTEGER NOT NULL,
  end_ms          INTEGER NOT NULL,
  sequence_index  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_export_sources_job ON export_sources(export_job_id, sequence_index ASC);
CREATE INDEX IF NOT EXISTS idx_export_sources_clip ON export_sources(clip_id);

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

-- ─── Social Media Publishing System ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_oauth_connections (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  platform_user_id    TEXT NOT NULL,
  account_name        TEXT NOT NULL,
  account_handle      TEXT,
  avatar_url          TEXT,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT,
  token_expires_at    TEXT,
  scope               TEXT NOT NULL,
  metadata            TEXT NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'connected',
  last_error          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oauth_user_platform ON social_oauth_connections(user_id, platform);

CREATE TABLE IF NOT EXISTS social_publishing_jobs (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_path          TEXT NOT NULL,
  thumbnail_path      TEXT,
  video_metadata      TEXT NOT NULL DEFAULT '{}',
  show_other_socials  INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'queued',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pub_jobs_user ON social_publishing_jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_published_posts (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES social_publishing_jobs(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  connection_id       TEXT REFERENCES social_oauth_connections(id) ON DELETE SET NULL,
  post_title          TEXT,
  post_caption        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  progress_percent    REAL NOT NULL DEFAULT 0.0,
  platform_post_id    TEXT,
  platform_post_url   TEXT,
  error_message       TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  idempotency_key     TEXT NOT NULL UNIQUE,
  published_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pub_posts_job ON social_published_posts(job_id);
CREATE INDEX IF NOT EXISTS idx_pub_posts_user ON social_published_posts(user_id, platform, status);
