-- 091: Auditable activation fee payments + tracked freelancer checkout sessions (prevent double fee).

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_activation_fee_payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  amount_minor INT NOT NULL CHECK (amount_minor > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
  paid_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(30) NOT NULL CHECK (source IN ('stripe', 'admin_offline', 'migration')),
  created_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_fee_payments_stripe_session
  ON subscription_activation_fee_payments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_fee_payments_stripe_pi
  ON subscription_activation_fee_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activation_fee_payments_user_paid_at
  ON subscription_activation_fee_payments (user_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS freelancer_subscription_checkout_sessions (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  display_plan_id BIGINT NULL REFERENCES plans(id) ON DELETE SET NULL,
  checkout_plan_id BIGINT NULL REFERENCES plans(id) ON DELETE SET NULL,
  checkout_kind VARCHAR(40) NOT NULL CHECK (checkout_kind IN ('subscription', 'activation_fee_only')),
  includes_activation_fee BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'expired', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fscks_freelancer_open
  ON freelancer_subscription_checkout_sessions (freelancer_user_id, status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_fscks_freelancer_open_fee
  ON freelancer_subscription_checkout_sessions (freelancer_user_id)
  WHERE status = 'open' AND includes_activation_fee = TRUE;

INSERT INTO schema_migrations (version)
VALUES ('091_subscription_activation_fee_audit_and_checkout_sessions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
