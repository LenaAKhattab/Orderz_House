-- 090: Track yearly subscription activation fee payment on freelancer users.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_activation_fee_paid_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_subscription_activation_fee_paid_at
  ON users (subscription_activation_fee_paid_at)
  WHERE subscription_activation_fee_paid_at IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('090_subscription_activation_fee_tracking')
ON CONFLICT (version) DO NOTHING;

COMMIT;
