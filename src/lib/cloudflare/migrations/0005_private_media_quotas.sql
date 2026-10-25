-- Conservative app-side R2 guard. Limits stay below the account's published
-- Standard free allowances and do not change or delete existing media.
CREATE TABLE IF NOT EXISTS cloud_media_usage (
  month_key TEXT PRIMARY KEY,
  class_a_ops INTEGER NOT NULL DEFAULT 0 CHECK (class_a_ops >= 0),
  class_b_ops INTEGER NOT NULL DEFAULT 0 CHECK (class_b_ops >= 0)
);

-- Reserves growth before upload so concurrent requests cannot exceed the cap.
CREATE TABLE IF NOT EXISTS private_media_upload_reservations (
  relative_path TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reserved_bytes INTEGER NOT NULL CHECK (reserved_bytes >= 0),
  started_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_private_media_reservations_started
  ON private_media_upload_reservations(started_at);
