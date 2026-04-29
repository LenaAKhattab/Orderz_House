-- 027_order_files_cloudinary_columns
-- Extend order_files metadata for Cloudinary-backed uploads.

BEGIN;

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS secure_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS assignment_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS revision_id BIGINT NULL;

UPDATE order_files
SET secure_url = COALESCE(NULLIF(secure_url, ''), file_url)
WHERE secure_url IS NULL
  AND file_url IS NOT NULL
  AND file_url <> '';

ALTER TABLE order_files DROP CONSTRAINT IF EXISTS order_files_purpose_chk;
ALTER TABLE order_files
  ADD CONSTRAINT order_files_purpose_chk CHECK (purpose IN ('brief', 'delivery', 'revision_request'));

CREATE INDEX IF NOT EXISTS idx_order_files_public_id ON order_files(public_id);
CREATE INDEX IF NOT EXISTS idx_order_files_revision_id ON order_files(revision_id);
CREATE INDEX IF NOT EXISTS idx_order_files_assignment_id ON order_files(assignment_id);

INSERT INTO schema_migrations (version)
VALUES ('027_order_files_cloudinary_columns')
ON CONFLICT (version) DO NOTHING;

COMMIT;
