-- Prevent duplicate live orders for the same institutional stored order.
-- Safe to re-run; preserves migrations 112–115 and existing data.

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_institutional_stored_order_unique
  ON orders (institutional_stored_order_id)
  WHERE institutional_stored_order_id IS NOT NULL;
