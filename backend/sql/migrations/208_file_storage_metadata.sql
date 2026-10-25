-- 208: Canonical file-storage metadata (Cloudflare R2 migration). ADDITIVE ONLY.
-- Identity of a stored object = provider + bucket + object key. Signed/expiring URLs are never stored.
-- Legacy Cloudinary columns (file_url, secure_url, public_id, file_path) are KEPT for dual-read and rollback.

BEGIN;

-- order_files (brief / delivery / revision_request attachments)
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(16) NULL;
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS storage_bucket TEXT NULL;
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS storage_key TEXT NULL;
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64) NULL;
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ NULL;

ALTER TABLE order_files DROP CONSTRAINT IF EXISTS order_files_storage_provider_chk;
ALTER TABLE order_files ADD CONSTRAINT order_files_storage_provider_chk
  CHECK (storage_provider IS NULL OR storage_provider IN ('cloudinary', 'local', 'r2'));
ALTER TABLE order_files DROP CONSTRAINT IF EXISTS order_files_r2_identity_chk;
ALTER TABLE order_files ADD CONSTRAINT order_files_r2_identity_chk
  CHECK (storage_provider IS DISTINCT FROM 'r2' OR (storage_bucket IS NOT NULL AND storage_key IS NOT NULL));

-- Classify existing rows (no data moved): remote URL → cloudinary, otherwise legacy disk path → local.
UPDATE order_files
   SET storage_provider = CASE
         WHEN COALESCE(secure_url, file_url, '') ~* '^https?://' THEN 'cloudinary'
         ELSE 'local'
       END
 WHERE storage_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_files_storage_provider ON order_files (storage_provider);

-- institutional_stored_order_files (copied into order_files on release)
ALTER TABLE institutional_stored_order_files ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(16) NULL;
ALTER TABLE institutional_stored_order_files ADD COLUMN IF NOT EXISTS storage_bucket TEXT NULL;
ALTER TABLE institutional_stored_order_files ADD COLUMN IF NOT EXISTS storage_key TEXT NULL;
ALTER TABLE institutional_stored_order_files ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64) NULL;
ALTER TABLE institutional_stored_order_files ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ NULL;

ALTER TABLE institutional_stored_order_files DROP CONSTRAINT IF EXISTS inst_stored_order_files_storage_provider_chk;
ALTER TABLE institutional_stored_order_files ADD CONSTRAINT inst_stored_order_files_storage_provider_chk
  CHECK (storage_provider IS NULL OR storage_provider IN ('cloudinary', 'local', 'r2'));

-- R2 rows have no delivery URL; the URL column becomes optional (existing values untouched).
ALTER TABLE institutional_stored_order_files ALTER COLUMN secure_url DROP NOT NULL;

UPDATE institutional_stored_order_files
   SET storage_provider = CASE WHEN COALESCE(secure_url, '') ~* '^https?://' THEN 'cloudinary' ELSE 'local' END
 WHERE storage_provider IS NULL;

-- Resumable legacy → R2 migration journal (one row per attempt outcome; never stores URLs/secrets).
CREATE TABLE IF NOT EXISTS file_storage_migration_events (
  id BIGSERIAL PRIMARY KEY,
  source_table VARCHAR(64) NOT NULL,
  source_id BIGINT NOT NULL,
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('migrated', 'skipped', 'failed')),
  detail TEXT NULL,
  target_bucket TEXT NULL,
  target_key TEXT NULL,
  size_bytes BIGINT NULL,
  content_sha256 VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fsme_source ON file_storage_migration_events (source_table, source_id, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('208_file_storage_metadata')
ON CONFLICT (version) DO NOTHING;

COMMIT;
