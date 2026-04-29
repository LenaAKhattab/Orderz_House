-- 035_drop_fake_columns_from_orders
-- Remove fake-order-specific columns from real orders table.

BEGIN;

DROP INDEX IF EXISTS idx_orders_is_fake;
DROP INDEX IF EXISTS idx_orders_fake_round_id;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_fake_round;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fake_status_check;

ALTER TABLE orders
  DROP COLUMN IF EXISTS is_fake,
  DROP COLUMN IF EXISTS fake_round_id,
  DROP COLUMN IF EXISTS fake_expires_at,
  DROP COLUMN IF EXISTS fake_status,
  DROP COLUMN IF EXISTS show_fake_badge;

INSERT INTO schema_migrations (version)
SELECT '035_drop_fake_columns_from_orders'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '035_drop_fake_columns_from_orders'
);

COMMIT;
