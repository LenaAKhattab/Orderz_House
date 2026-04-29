-- 020_freelancer_self_subscription_stripe
-- Adds Stripe/self-subscription metadata and manual company activation states.

BEGIN;

ALTER TABLE freelancer_subscriptions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin', 'manual', 'stripe')),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS activation_status VARCHAR(30) NOT NULL DEFAULT 'company_approved'
    CHECK (activation_status IN ('company_pending', 'company_approved', 'company_rejected')),
  ADD COLUMN IF NOT EXISTS company_activated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS company_activated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fsub_source ON freelancer_subscriptions(source);
CREATE INDEX IF NOT EXISTS idx_fsub_payment_status ON freelancer_subscriptions(payment_status);
CREATE INDEX IF NOT EXISTS idx_fsub_activation_status ON freelancer_subscriptions(activation_status);
CREATE INDEX IF NOT EXISTS idx_fsub_stripe_session_id ON freelancer_subscriptions(stripe_session_id);

INSERT INTO schema_migrations (version)
VALUES ('020_freelancer_self_subscription_stripe')
ON CONFLICT (version) DO NOTHING;

COMMIT;
