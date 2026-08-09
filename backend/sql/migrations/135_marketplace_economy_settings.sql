-- 135: Marketplace Economy Settings foundation (باقات العمل) — ADDITIVE ONLY.
-- Singleton typed policy row for future REAL-order-only marketplace economy.
-- Phase 2: configuration only. All execution feature flags default OFF.
-- Independent of legacy plans / fake-training. Does NOT modify migration 134.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_economy_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Work Token economy policy (execution gated by work_tokens_enabled)
  work_token_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.100
    CHECK (work_token_value_jod > 0 AND work_token_value_jod <= 1000),
  bid_tokens_per_order_jod NUMERIC(12, 3) NOT NULL DEFAULT 1.000
    CHECK (bid_tokens_per_order_jod > 0 AND bid_tokens_per_order_jod <= 1000),
  application_token_refund_percentage NUMERIC(5, 2) NOT NULL DEFAULT 70.00
    CHECK (application_token_refund_percentage >= 0 AND application_token_refund_percentage <= 100),

  -- Platform commission policy (execution gated by marketplace_commission_enabled)
  platform_commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 30.00
    CHECK (platform_commission_percentage >= 0 AND platform_commission_percentage <= 100),

  -- Cash membership processing fee (per cash TRANSACTION, not per month)
  cash_processing_fee_jod NUMERIC(12, 3) NOT NULL DEFAULT 5.000
    CHECK (cash_processing_fee_jod >= 0 AND cash_processing_fee_jod <= 100000),

  -- Verification bonus policy (execution gated by verification_bonuses_enabled)
  identity_verification_bonus_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  identity_verification_bonus_tokens INT NOT NULL DEFAULT 10
    CHECK (identity_verification_bonus_tokens >= 0 AND identity_verification_bonus_tokens <= 1000000),
  payout_method_verification_bonus_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  payout_method_verification_bonus_tokens INT NOT NULL DEFAULT 10
    CHECK (payout_method_verification_bonus_tokens >= 0 AND payout_method_verification_bonus_tokens <= 1000000),

  -- Elite Direct Order policy (execution gated by elite_engine_enabled)
  elite_direct_orders_per_cycle INT NOT NULL DEFAULT 1
    CHECK (elite_direct_orders_per_cycle >= 0 AND elite_direct_orders_per_cycle <= 1000),
  elite_offer_duration_minutes INT NOT NULL DEFAULT 10
    CHECK (elite_offer_duration_minutes >= 1 AND elite_offer_duration_minutes <= 10080),
  elite_carry_forward_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  elite_carry_forward_days INT NOT NULL DEFAULT 7
    CHECK (elite_carry_forward_days >= 0 AND elite_carry_forward_days <= 3650),
  elite_maximum_carry_forward INT NOT NULL DEFAULT 1
    CHECK (elite_maximum_carry_forward >= 0 AND elite_maximum_carry_forward <= 1000),
  -- Future: when true, repeated declines of valid REAL matching offers may deny carry-forward
  elite_declines_affect_carry_forward BOOLEAN NOT NULL DEFAULT FALSE,

  -- Master execution feature flags (Phase 2 defaults: ALL OFF — config only)
  work_tokens_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  marketplace_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cash_membership_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  elite_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verification_bonuses_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE marketplace_economy_settings IS
  'MARKETPLACE_MEMBERSHIP global economy policy (singleton id=1). Configuration only in Phase 2; execution flags default OFF. REAL customer-funded orders only — never fake/training.';
COMMENT ON COLUMN marketplace_economy_settings.work_token_value_jod IS
  'Accounting value of one Work Token in JOD (NUMERIC). Not binary float.';
COMMENT ON COLUMN marketplace_economy_settings.bid_tokens_per_order_jod IS
  'Work Tokens required to apply per 1 JOD of REAL order value. Future: tokens = order_value_jod × this rate.';
COMMENT ON COLUMN marketplace_economy_settings.application_token_refund_percentage IS
  'Percent of application Tokens refunded when a REAL order ends with no freelancer selected.';
COMMENT ON COLUMN marketplace_economy_settings.platform_commission_percentage IS
  'Platform commission percent of completed REAL work value. Snapshot at transaction time in future phases.';
COMMENT ON COLUMN marketplace_economy_settings.cash_processing_fee_jod IS
  'Fixed admin fee per cash membership TRANSACTION (not per month). Distinct from activation fee and membership price.';
COMMENT ON COLUMN marketplace_economy_settings.elite_engine_enabled IS
  'Global Elite engine operational flag. Distinct from marketplace_membership_plans.elite_direct_orders_enabled (tier capability).';
COMMENT ON COLUMN marketplace_economy_settings.work_tokens_enabled IS
  'Master switch for Work Token wallet/ledger/bidding. Phase 2 default FALSE.';

INSERT INTO marketplace_economy_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('135_marketplace_economy_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
