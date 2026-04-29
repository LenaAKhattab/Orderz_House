-- 022_drop_plans_price_cents
-- Fully remove legacy cents pricing from plans table.

BEGIN;

ALTER TABLE plans
  DROP COLUMN IF EXISTS price_cents;

INSERT INTO schema_migrations (version)
VALUES ('022_drop_plans_price_cents')
ON CONFLICT (version) DO NOTHING;

COMMIT;
