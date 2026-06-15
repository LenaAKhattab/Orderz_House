-- 080_order_cached_english_translations
-- Optional cached English translations for order titles/descriptions (server-side only).

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS description_en TEXT NULL;

ALTER TABLE fake_orders
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS description_en TEXT NULL;

ALTER TABLE fake_order_templates
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS description_en TEXT NULL;

INSERT INTO schema_migrations (version)
VALUES ('080_order_cached_english_translations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
