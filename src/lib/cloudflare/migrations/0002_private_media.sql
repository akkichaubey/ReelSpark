-- Apply explicitly after schema review; no automatic remote migration.
CREATE TABLE IF NOT EXISTS private_media (
  relative_path TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_media_owner ON private_media(owner_user_id);
