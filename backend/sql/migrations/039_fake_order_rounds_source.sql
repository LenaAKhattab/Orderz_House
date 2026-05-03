-- 039_fake_order_rounds_source
-- Track whether a training round was started by automation or manually.

BEGIN;

ALTER TABLE fake_order_rounds
  ADD COLUMN IF NOT EXISTS round_source VARCHAR(20) NULL;

ALTER TABLE fake_order_rounds
  DROP CONSTRAINT IF EXISTS fake_order_rounds_round_source_check;

ALTER TABLE fake_order_rounds
  ADD CONSTRAINT fake_order_rounds_round_source_check
  CHECK (round_source IS NULL OR round_source IN ('automation', 'manual'));

CREATE INDEX IF NOT EXISTS idx_fake_orders_fake_round_status
  ON fake_orders (fake_round_id, fake_status)
  WHERE fake_round_id IS NOT NULL;

INSERT INTO schema_migrations (version)
SELECT '039_fake_order_rounds_source'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '039_fake_order_rounds_source'
);

COMMIT;
