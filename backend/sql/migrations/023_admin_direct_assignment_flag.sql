-- 023_admin_direct_assignment_flag
-- Keep order_status consistent (in_progress) for direct admin/super-admin assignment,
-- while preserving a dedicated DB flag to identify this assignment source.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_direct_admin_assignment BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE orders
SET
  is_direct_admin_assignment = TRUE,
  order_status = 'in_progress'
WHERE source_type IN ('admin_created', 'super_admin_created')
  AND assigned_freelancer_id IS NOT NULL
  AND order_status = 'assigned';

CREATE INDEX IF NOT EXISTS idx_orders_is_direct_admin_assignment
  ON orders(is_direct_admin_assignment);

INSERT INTO schema_migrations (version)
VALUES ('023_admin_direct_assignment_flag')
ON CONFLICT (version) DO NOTHING;

COMMIT;
