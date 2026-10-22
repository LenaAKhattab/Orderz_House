-- 204_referral_commissions
-- Additive OrderzHouse-only referral ledger. No cross-platform tables.
-- Payment classification (defaults):
--   training_package_purchase        platform revenue, eligible by default
--   marketplace_membership_purchase  platform revenue, eligible by default
--   client order value               pass-through, NOT eligible
--   manual membership not_required   no payment, NOT eligible
--   legacy campaign invites          separate acquisition, NOT eligible
--   bid credit packages              platform revenue, NOT in the default set
--   freelancer plan subscriptions    separate from marketplace membership, NOT default

BEGIN;

CREATE TABLE IF NOT EXISTS referral_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regenerated_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS referral_visits (
  id BIGSERIAL PRIMARY KEY,
  referral_code_id BIGINT NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  anonymous_visit_id TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count > 0),
  landing_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ NULL,
  converted_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  utm_source TEXT NULL,
  utm_medium TEXT NULL,
  utm_campaign TEXT NULL,
  UNIQUE (referral_code_id, anonymous_visit_id)
);

CREATE INDEX IF NOT EXISTS referral_visits_referrer_idx
  ON referral_visits (referrer_user_id, landing_at DESC);

CREATE TABLE IF NOT EXISTS referral_commission_policy_versions (
  id BIGSERIAL PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  calculation_mode TEXT NOT NULL CHECK (calculation_mode IN ('percentage', 'fixed')),
  percentage_bps INTEGER NULL CHECK (percentage_bps IS NULL OR (percentage_bps > 0 AND percentage_bps <= 10000)),
  fixed_amount_minor BIGINT NULL CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  eligible_payment_types TEXT[] NOT NULL,
  commission_hold_days INTEGER NOT NULL CHECK (commission_hold_days >= 0 AND commission_hold_days <= 90),
  minimum_withdrawal_minor BIGINT NOT NULL CHECK (minimum_withdrawal_minor >= 0),
  discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  discount_mode TEXT NULL CHECK (discount_mode IS NULL OR discount_mode IN ('percentage', 'fixed')),
  discount_percentage_bps INTEGER NULL,
  discount_fixed_minor BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  referral_code_id BIGINT NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  policy_version_id BIGINT NOT NULL REFERENCES referral_commission_policy_versions(id) ON DELETE RESTRICT,
  attribution_source TEXT NOT NULL CHECK (attribution_source IN ('link', 'manual')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_referrals_not_self CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS user_referrals_referrer_idx
  ON user_referrals (referrer_user_id, registered_at DESC);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id BIGSERIAL PRIMARY KEY,
  user_referral_id BIGINT NOT NULL REFERENCES user_referrals(id) ON DELETE RESTRICT,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_version_id BIGINT NOT NULL REFERENCES referral_commission_policy_versions(id) ON DELETE RESTRICT,
  payment_source_type TEXT NOT NULL,
  payment_source_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT NULL,
  payment_base_minor BIGINT NOT NULL CHECK (payment_base_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  calculation_mode TEXT NOT NULL,
  percentage_bps INTEGER NULL,
  fixed_amount_minor BIGINT NULL,
  commission_minor BIGINT NOT NULL CHECK (commission_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'paid', 'reversed', 'cancelled')),
  hold_until TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_source_type, payment_source_id)
);

CREATE INDEX IF NOT EXISTS referral_commissions_referrer_status_idx
  ON referral_commissions (referrer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_commissions_pi_idx
  ON referral_commissions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS referral_wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('pending', 'available', 'reserved', 'paid')),
  amount_minor BIGINT NOT NULL,
  commission_id BIGINT NULL REFERENCES referral_commissions(id) ON DELETE RESTRICT,
  withdrawal_id BIGINT NULL,
  bonus_award_id BIGINT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_wallet_ledger_user_idx
  ON referral_wallet_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_withdrawal_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  payout_reference TEXT NULL,
  admin_note TEXT NULL,
  reviewed_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_withdrawals_user_idx
  ON referral_withdrawal_requests (user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_wallet_ledger_withdrawal_fk'
  ) THEN
    ALTER TABLE referral_wallet_ledger
      ADD CONSTRAINT referral_wallet_ledger_withdrawal_fk
      FOREIGN KEY (withdrawal_id) REFERENCES referral_withdrawal_requests(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS referral_bonus_rules (
  id BIGSERIAL PRIMARY KEY,
  threshold_paid_referrals INTEGER NOT NULL CHECK (threshold_paid_referrals > 0),
  bonus_amount_minor BIGINT NOT NULL CHECK (bonus_amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (threshold_paid_referrals)
);

CREATE TABLE IF NOT EXISTS referral_bonus_awards (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES referral_bonus_rules(id) ON DELETE RESTRICT,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, referrer_user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_wallet_ledger_bonus_fk'
  ) THEN
    ALTER TABLE referral_wallet_ledger
      ADD CONSTRAINT referral_wallet_ledger_bonus_fk
      FOREIGN KEY (bonus_award_id) REFERENCES referral_bonus_awards(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS referral_review_flags (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO referral_commission_policy_versions (
  enabled,
  calculation_mode,
  percentage_bps,
  currency,
  eligible_payment_types,
  commission_hold_days,
  minimum_withdrawal_minor,
  discount_enabled
)
SELECT
  FALSE,
  'percentage',
  1000,
  'JOD',
  ARRAY['training_package_purchase', 'marketplace_membership_purchase']::text[],
  7,
  10000,
  FALSE
WHERE NOT EXISTS (SELECT 1 FROM referral_commission_policy_versions);

INSERT INTO schema_migrations (version)
VALUES ('204_referral_commissions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
