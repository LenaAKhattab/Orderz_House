-- 017_client_bid_payment_flow
-- Add client bid selection payment tracking + selected bid linkage.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS selected_bid_id BIGINT NULL REFERENCES order_freelancer_bids(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_selected_bid_id ON orders(selected_bid_id);

ALTER TABLE order_freelancer_bids DROP CONSTRAINT IF EXISTS order_freelancer_bids_status_check;
ALTER TABLE order_freelancer_bids
  ADD CONSTRAINT order_freelancer_bids_status_check CHECK (
    status IN ('pending', 'withdrawn', 'selected_pending_payment', 'accepted', 'rejected')
  );

CREATE TABLE IF NOT EXISTS client_order_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bid_id BIGINT NULL REFERENCES order_freelancer_bids(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_provider VARCHAR(30) NOT NULL DEFAULT 'stripe',
  provider_checkout_session_id VARCHAR(255) NULL,
  provider_payment_id VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  purpose VARCHAR(40) NOT NULL CHECK (purpose IN ('fixed_order_creation', 'selected_bid_payment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_order_payments_provider_payment_id
  ON client_order_payments(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_order_payments_order_id ON client_order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_client_order_payments_client_id ON client_order_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_order_payments_bid_id ON client_order_payments(bid_id);

INSERT INTO schema_migrations (version)
VALUES ('017_client_bid_payment_flow')
ON CONFLICT (version) DO NOTHING;

COMMIT;

