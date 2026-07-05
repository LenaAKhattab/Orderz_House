-- 104: Custom card text between billing period and price on public plan cards.

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price_intro_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS price_intro_text_en TEXT NULL;

COMMENT ON COLUMN plans.price_intro_text IS 'Optional subtitle on plan card between billing period and price (Arabic).';
COMMENT ON COLUMN plans.price_intro_text_en IS 'English version of price_intro_text.';

INSERT INTO schema_migrations (version) VALUES ('104_plans_price_intro_text')
ON CONFLICT (version) DO NOTHING;

COMMIT;
