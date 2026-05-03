-- 041_fake_orders_template_id
-- Track which template generated each fake order (consecutive-round exclusion).

BEGIN;

ALTER TABLE fake_orders
  ADD COLUMN IF NOT EXISTS template_id BIGINT NULL REFERENCES fake_order_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fake_orders_template_id ON fake_orders (template_id);

INSERT INTO schema_migrations (version)
SELECT '041_fake_orders_template_id'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '041_fake_orders_template_id'
);

COMMIT;
