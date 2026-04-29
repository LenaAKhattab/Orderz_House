-- 033_fake_settings_category_distribution
-- Add category distribution percentages for fake round generation.

ALTER TABLE fake_order_settings
  ADD COLUMN IF NOT EXISTS category_distribution JSONB NOT NULL DEFAULT '{"content":30,"programming":50,"design":20}'::jsonb;

INSERT INTO schema_migrations (version)
SELECT '033_fake_settings_category_distribution'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '033_fake_settings_category_distribution'
);
