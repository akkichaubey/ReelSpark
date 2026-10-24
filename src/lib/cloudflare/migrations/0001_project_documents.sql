-- Additive metadata-only migration. Does not alter or assign legacy records.
-- Apply explicitly to the intended D1 database after reviewing/backing it up.
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
