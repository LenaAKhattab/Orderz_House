-- 097_fake_orders_admin_perf_indexes
-- Speed admin readiness eligible-pool COUNT and pool listing at scale.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_fake_orders_eligible_pool_admin
  ON fake_orders (is_published, is_open_for_pool, order_status, id)
  WHERE COALESCE(is_archived, FALSE) = FALSE
    AND is_published = TRUE
    AND is_open_for_pool = TRUE
    AND assigned_freelancer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fake_orders_source_type
  ON fake_orders (source_type)
  WHERE source_type IS NOT NULL;

INSERT INTO schema_migrations (version)
SELECT '097_fake_orders_admin_perf_indexes'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '097_fake_orders_admin_perf_indexes'
);

COMMIT;
