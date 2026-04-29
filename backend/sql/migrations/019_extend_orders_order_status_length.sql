-- 019_extend_orders_order_status_length
-- Fix: awaiting_payment_after_bid_selection exceeds current VARCHAR(30) length.

BEGIN;

ALTER TABLE orders
  ALTER COLUMN order_status TYPE VARCHAR(50);

INSERT INTO schema_migrations (version)
VALUES ('019_extend_orders_order_status_length')
ON CONFLICT (version) DO NOTHING;

COMMIT;

