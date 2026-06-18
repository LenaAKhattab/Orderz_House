-- 081_fake_orders_marketplace_visibility_proof
-- Proof that a training/fake order was actually shown in the marketplace pool.

BEGIN;

ALTER TABLE fake_orders
  ADD COLUMN IF NOT EXISTS first_visible_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS was_marketplace_visible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_fake_orders_marketplace_visible
  ON fake_orders (was_marketplace_visible, fake_status)
  WHERE was_marketplace_visible = TRUE;

INSERT INTO schema_migrations (version)
SELECT '081_fake_orders_marketplace_visibility_proof'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '081_fake_orders_marketplace_visibility_proof'
);

COMMIT;
