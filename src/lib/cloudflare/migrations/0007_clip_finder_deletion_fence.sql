-- Durable deletion fence for Clip Finder projects backed by project_documents.
CREATE TABLE IF NOT EXISTS deleted_clip_finder_projects (
  project_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deleted_clip_finder_projects_owner
  ON deleted_clip_finder_projects(owner_user_id, deleted_at);
