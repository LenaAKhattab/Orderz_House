-- 205_referral_final_completion
-- Additive completion of the OrderzHouse-only referral program (204).
--   * immutable policy versions enforced in the database
--   * referral discount scope (payment types) + safe limits, snapshotted per policy version
--   * partial refund / dispute accounting on commissions (no row deletes)
--   * one-time referral discount redemption record
--   * bonus rule labels, one open withdrawal per user
--   * indexes for admin date-range KPIs

BEGIN;

ALTER TABLE referral_commission_policy_versions
  ADD COLUMN IF NOT EXISTS discount_payment_types TEXT[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_policy_discount_limits') THEN
    ALTER TABLE referral_commission_policy_versions
      ADD CONSTRAINT referral_policy_discount_limits CHECK (
        (discount_percentage_bps IS NULL OR (discount_percentage_bps > 0 AND discount_percentage_bps <= 5000))
        AND (discount_fixed_minor IS NULL OR discount_fixed_minor > 0)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION referral_policy_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'referral_commission_policy_versions rows are immutable; insert a new version instead'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS referral_policy_versions_immutable_trg ON referral_commission_policy_versions;
CREATE TRIGGER referral_policy_versions_immutable_trg
  BEFORE UPDATE OR DELETE ON referral_commission_policy_versions
  FOR EACH ROW EXECUTE FUNCTION referral_policy_versions_immutable();

ALTER TABLE referral_commissions
  ADD COLUMN IF NOT EXISTS list_amount_minor BIGINT NULL,
  ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_base_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_minor BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_commissions_refund_bounds') THEN
    ALTER TABLE referral_commissions
      ADD CONSTRAINT referral_commissions_refund_bounds CHECK (
        discount_minor >= 0
        AND refunded_base_minor >= 0
        AND refunded_base_minor <= payment_base_minor
        AND reversed_minor >= 0
        AND reversed_minor <= commission_minor
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS referral_commissions_hold_idx
  ON referral_commissions (hold_until)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS referral_commissions_created_idx
  ON referral_commissions (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_visits_landing_idx
  ON referral_visits (landing_at DESC);
CREATE INDEX IF NOT EXISTS user_referrals_registered_idx
  ON user_referrals (registered_at DESC);
CREATE INDEX IF NOT EXISTS referral_wallet_ledger_user_bucket_idx
  ON referral_wallet_ledger (user_id, bucket);

CREATE TABLE IF NOT EXISTS referral_discount_redemptions (
  id BIGSERIAL PRIMARY KEY,
  user_referral_id BIGINT NOT NULL REFERENCES user_referrals(id) ON DELETE RESTRICT,
  referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_version_id BIGINT NOT NULL REFERENCES referral_commission_policy_versions(id) ON DELETE RESTRICT,
  payment_source_type TEXT NOT NULL,
  payment_source_id TEXT NOT NULL,
  list_amount_minor BIGINT NOT NULL CHECK (list_amount_minor > 0),
  discount_minor BIGINT NOT NULL CHECK (discount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_source_type, payment_source_id)
);

CREATE INDEX IF NOT EXISTS referral_discount_redemptions_user_idx
  ON referral_discount_redemptions (referred_user_id);

ALTER TABLE training_package_purchases
  ADD COLUMN IF NOT EXISTS list_amount_jod NUMERIC(12, 3) NULL,
  ADD COLUMN IF NOT EXISTS referral_discount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_policy_version_id BIGINT NULL
    REFERENCES referral_commission_policy_versions(id) ON DELETE RESTRICT;

ALTER TABLE referral_bonus_rules
  ADD COLUMN IF NOT EXISTS label TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE referral_withdrawal_requests
  ADD COLUMN IF NOT EXISTS cancelled_by_user BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS referral_withdrawals_one_open_idx
  ON referral_withdrawal_requests (user_id)
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS referral_withdrawals_status_idx
  ON referral_withdrawal_requests (status, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('205_referral_final_completion')
ON CONFLICT (version) DO NOTHING;

COMMIT;
