-- 210_order_files_source_missing
-- Additive: remember when an order file's stored source is definitively gone (R2 NoSuchKey,
-- Cloudinary 404, legacy disk file missing) so the UI can show «المرفق الأصلي غير متاح» instead of
-- an endlessly failing download button. Metadata is kept (history); a later successful stream
-- clears the flag. Nothing is deleted.

BEGIN;

ALTER TABLE order_files ADD COLUMN IF NOT EXISTS source_missing_at TIMESTAMPTZ NULL;

INSERT INTO schema_migrations (version)
VALUES ('210_order_files_source_missing')
ON CONFLICT (version) DO NOTHING;

COMMIT;
