-- 203_training_package_purchases
-- Additive purchase ledger for commercial training packages.
-- Does NOT alter marketplace memberships, subscriptions, KYC, or course progress.

BEGIN;

CREATE TABLE IF NOT EXISTS training_package_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_code TEXT NOT NULL,
  package_name_ar TEXT NULL,
  package_name_en TEXT NULL,
  amount_jod NUMERIC(12, 3) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JOD',
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id TEXT NULL,
  stripe_payment_intent_id TEXT NULL,
  checkout_url TEXT NULL,
  paid_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT training_package_purchases_status_chk
    CHECK (status IN ('pending', 'paid', 'cancelled', 'failed')),
  CONSTRAINT training_package_purchases_amount_chk
    CHECK (amount_jod > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_package_purchases_session_uidx
  ON training_package_purchases (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS training_package_purchases_user_status_idx
  ON training_package_purchases (user_id, status, paid_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('203_training_package_purchases')
ON CONFLICT (version) DO NOTHING;

COMMIT;
