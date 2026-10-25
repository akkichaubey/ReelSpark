-- Tie provisional R2 cleanup entries to active upload reservations so an upload
-- that lasts longer than the queue grace period can never be garbage-collected.
ALTER TABLE private_media_upload_reservations ADD COLUMN pending_object_key TEXT;
CREATE INDEX IF NOT EXISTS idx_private_media_reservations_object
  ON private_media_upload_reservations(pending_object_key);
