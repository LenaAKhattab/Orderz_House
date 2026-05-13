-- 053_content_ads_featured_theme
-- Homepage offers rail: featured (large) card + optional theme preset (purple/green/orange/blue).

BEGIN;

ALTER TABLE content_ads
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(16) NULL;

INSERT INTO schema_migrations (version)
VALUES ('053_content_ads_featured_theme')
ON CONFLICT (version) DO NOTHING;

COMMIT;
