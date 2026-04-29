-- 024_orders_listing_perf_indexes
-- Adds safe indexes used by freelancer pool/my-orders listing filters.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_pool_visibility_status_source
  ON orders(is_published, is_open_for_pool, assigned_freelancer_id, order_status, source_type, id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_status_id
  ON orders(assigned_freelancer_id, order_status, id);

CREATE INDEX IF NOT EXISTS idx_orders_category_status_id
  ON orders(category_id, order_status, id);

CREATE INDEX IF NOT EXISTS idx_orders_project_type_status_id
  ON orders(project_type, order_status, id);

CREATE INDEX IF NOT EXISTS idx_order_claims_freelancer_status_order
  ON order_claims(freelancer_user_id, status, order_id);

CREATE INDEX IF NOT EXISTS idx_order_freelancer_bids_freelancer_order
  ON order_freelancer_bids(freelancer_user_id, order_id);

INSERT INTO schema_migrations (version)
VALUES ('024_orders_listing_perf_indexes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
