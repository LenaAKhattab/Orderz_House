-- 011_orders_claims_received_at
-- Implements professional pool claiming workflow:
-- - order_claims table for freelancer applications (pending/approved/rejected/withdrawn)
-- - orders.received_at for official assignment moment (تاريخ الاستلام)

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_received_at ON orders(received_at);

CREATE TABLE IF NOT EXISTS order_claims (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','approved','rejected','withdrawn')),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_order_claims_order_id ON order_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_order_claims_freelancer_user_id ON order_claims(freelancer_user_id);
CREATE INDEX IF NOT EXISTS idx_order_claims_status ON order_claims(status);

INSERT INTO schema_migrations (version)
VALUES ('011_orders_claims_received_at')
ON CONFLICT (version) DO NOTHING;

COMMIT;

