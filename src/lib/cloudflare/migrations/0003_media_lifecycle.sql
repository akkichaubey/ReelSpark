-- Additive lifecycle migration. Review and apply explicitly; never auto-run.
CREATE TABLE IF NOT EXISTS deleted_clipping_projects (
  project_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
-- Durable object inventory. Active catalog references are never eligible for GC.
CREATE TABLE IF NOT EXISTS media_cleanup_queue (
  object_key TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_cleanup_age ON media_cleanup_queue(created_at);
