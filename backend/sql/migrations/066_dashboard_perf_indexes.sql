-- 066_dashboard_perf_indexes.sql
-- Indexes for freelancer dashboard-summary hot paths.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_accepted_freelancer_status
  ON orders(accepted_freelancer_id, order_status, updated_at DESC)
  WHERE accepted_freelancer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_freelancer_updated
  ON orders(assigned_freelancer_id, updated_at DESC)
  WHERE assigned_freelancer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_claims_freelancer_status
  ON financial_claims(freelancer_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_freelancer_reviews_freelancer_created
  ON freelancer_reviews(freelancer_id, created_at DESC)
  WHERE is_visible = TRUE AND is_verified = TRUE;

INSERT INTO schema_migrations (version)
VALUES ('066_dashboard_perf_indexes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
