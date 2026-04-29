-- 021_plans_price_jod
-- Move plans pricing storage to JOD major units.

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price_jod NUMERIC(12,2) NULL;

UPDATE plans
SET price_jod = ROUND((price_cents::numeric / 100.0), 2)
WHERE price_jod IS NULL
  AND price_cents IS NOT NULL;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_price_cents_check;

ALTER TABLE plans
  ADD CONSTRAINT plans_price_jod_check
  CHECK (price_jod IS NULL OR price_jod >= 0);

INSERT INTO schema_migrations (version)
VALUES ('021_plans_price_jod')
ON CONFLICT (version) DO NOTHING;

COMMIT;
