-- Persist the bounded R2 orphan scan position across Render restarts.
CREATE TABLE IF NOT EXISTS media_cleanup_state (
  state_key TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at TEXT NOT NULL
);
