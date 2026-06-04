-- 069_super_admin_home_perf_indexes.sql
-- Indexes for Super Admin home dashboard intelligence hot paths.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_fsub_is_current_status
  ON freelancer_subscriptions(is_current, status);

CREATE INDEX IF NOT EXISTS idx_fsub_is_current_paid_at
  ON freelancer_subscriptions(is_current, paid_at)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fsub_assigned_at
  ON freelancer_subscriptions(assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON orders(order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_by_user_id
  ON orders(created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_claims_status_created_at
  ON financial_claims(status, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('069_super_admin_home_perf_indexes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
