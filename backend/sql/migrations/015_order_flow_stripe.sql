-- 015_order_flow_stripe
-- Extends orders for creator role, accepted freelancer, Stripe checkout, expanded status enums.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS accepted_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_expected_amount_minor BIGINT NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3) NULL;

UPDATE orders
SET created_by_role = CASE source_type
  WHEN 'client_created' THEN 'client'
  WHEN 'admin_created' THEN 'admin'
  WHEN 'super_admin_created' THEN 'super_admin'
  ELSE 'client'
END
WHERE created_by_role IS NULL;

ALTER TABLE orders
  ALTER COLUMN created_by_role SET NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_created_by_role_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_created_by_role_check CHECK (
    created_by_role IN ('client', 'admin', 'super_admin')
  );

CREATE INDEX IF NOT EXISTS idx_orders_accepted_freelancer_id ON orders(accepted_freelancer_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session_id ON orders(stripe_checkout_session_id);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check CHECK (
    payment_status IN (
      'not_required',
      'unpaid',
      'paid',
      'refunded',
      'pending',
      'failed',
      'skipped_by_admin'
    )
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check CHECK (
    order_status IN (
      'draft',
      'published',
      'assigned',
      'in_progress',
      'pending_client_review',
      'completed',
      'cancelled',
      'pending_payment',
      'open_for_freelancers',
      'open_for_bids',
      'awaiting_payment_after_bid_selection',
      'pending_freelancer_acceptance',
      'ready_for_work'
    )
  );

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('015_order_flow_stripe')
ON CONFLICT (version) DO NOTHING;

COMMIT;
