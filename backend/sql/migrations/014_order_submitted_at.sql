-- 014_order_submitted_at
-- Timestamp when the assigned freelancer last submitted work for client review.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_submitted_at ON orders(submitted_at);

INSERT INTO schema_migrations (version)
VALUES ('014_order_submitted_at')
ON CONFLICT (version) DO NOTHING;

COMMIT;
