-- 094_fake_order_template_conversions
-- Tracking table for template → fake_orders pool conversion + source_type for converted rows.

BEGIN;

CREATE TABLE IF NOT EXISTS fake_order_template_conversions (
  template_id BIGINT PRIMARY KEY REFERENCES fake_order_templates(id) ON DELETE RESTRICT,
  fake_order_id BIGINT NOT NULL UNIQUE REFERENCES fake_orders(id) ON DELETE RESTRICT,
  converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conversion_batch_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fake_order_template_conversions_batch
  ON fake_order_template_conversions (conversion_batch_id, converted_at DESC);

CREATE INDEX IF NOT EXISTS idx_fake_order_template_conversions_fake_order
  ON fake_order_template_conversions (fake_order_id);

ALTER TABLE fake_orders DROP CONSTRAINT IF EXISTS orders_source_type_check;
ALTER TABLE fake_orders DROP CONSTRAINT IF EXISTS fake_orders_source_type_check;

ALTER TABLE fake_orders
  ADD CONSTRAINT fake_orders_source_type_check CHECK (
    source_type IN (
      'admin_created',
      'super_admin_created',
      'client_created',
      'template_converted'
    )
  );

INSERT INTO schema_migrations (version)
SELECT '094_fake_order_template_conversions'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '094_fake_order_template_conversions'
);

COMMIT;
