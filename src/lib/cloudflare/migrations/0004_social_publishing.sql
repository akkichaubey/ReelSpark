-- Cloudflare D1 Migration 0004: Multi-Platform Social Media Publishing System
-- Supports YouTube Shorts, Instagram Reels, Facebook Reels, and Threads

-- 1. Connected Social OAuth Accounts
CREATE TABLE IF NOT EXISTS social_oauth_connections (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL, -- 'youtube' | 'instagram' | 'facebook' | 'threads'
  platform_user_id    TEXT NOT NULL,
  account_name        TEXT NOT NULL,
  account_handle      TEXT,
  avatar_url          TEXT,
  access_token        TEXT NOT NULL, -- Encrypted at rest
  refresh_token       TEXT,          -- Encrypted at rest
  token_expires_at    TEXT,          -- ISO timestamp
  scope               TEXT NOT NULL,
  metadata            TEXT NOT NULL DEFAULT '{}', -- JSON: selected FB Page ID, YouTube channel info
  status              TEXT NOT NULL DEFAULT 'connected', -- 'connected' | 'expired' | 'revoked' | 'error'
  last_error          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oauth_user_platform ON social_oauth_connections(user_id, platform);

-- 2. Multi-Platform Publishing Jobs
CREATE TABLE IF NOT EXISTS social_publishing_jobs (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_path          TEXT NOT NULL,
  thumbnail_path      TEXT,
  video_metadata      TEXT NOT NULL DEFAULT '{}', -- JSON: duration, resolution, size
  show_other_socials  INTEGER NOT NULL DEFAULT 1, -- BOOLEAN
  status              TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'in_progress' | 'completed' | 'partial' | 'failed'
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pub_jobs_user ON social_publishing_jobs(user_id, created_at DESC);

-- 3. Platform Post Records (Individual Platform Target)
CREATE TABLE IF NOT EXISTS social_published_posts (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES social_publishing_jobs(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  connection_id       TEXT REFERENCES social_oauth_connections(id) ON DELETE SET NULL,
  post_title          TEXT,
  post_caption        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', 
  -- 'pending' | 'uploading' | 'processing' | 'publishing' | 'published' | 'failed'
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
