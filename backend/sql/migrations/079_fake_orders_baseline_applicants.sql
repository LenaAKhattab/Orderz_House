-- 079_fake_orders_baseline_applicants
-- Stable marketplace display baseline (3–12) + real fake_order_applications.

BEGIN;

ALTER TABLE fake_orders
  ADD COLUMN IF NOT EXISTS baseline_applicants_count INTEGER;

UPDATE fake_orders
SET baseline_applicants_count = (floor(random() * (12 - 3 + 1)) + 3)::int
WHERE baseline_applicants_count IS NULL;

ALTER TABLE fake_orders
  ALTER COLUMN baseline_applicants_count SET NOT NULL;

ALTER TABLE fake_orders
  DROP CONSTRAINT IF EXISTS fake_orders_baseline_applicants_count_check;

ALTER TABLE fake_orders
  ADD CONSTRAINT fake_orders_baseline_applicants_count_check
  CHECK (baseline_applicants_count >= 3 AND baseline_applicants_count <= 12);

COMMIT;
