-- 067_categories_image_data.sql
-- Store category card images in DB (BYTEA) and serve via /api/categories/images/:slug

BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_data BYTEA NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_mime VARCHAR(64) NULL;

INSERT INTO schema_migrations (version)
VALUES ('067_categories_image_data')
ON CONFLICT (version) DO NOTHING;

COMMIT;
