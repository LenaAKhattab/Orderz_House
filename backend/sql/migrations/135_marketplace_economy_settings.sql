-- 135: Marketplace Economy Settings foundation (باقات العمل) — ADDITIVE ONLY.
-- Singleton typed policy row for future REAL ECONOMIC ORDER marketplace economy.
-- Phase 2: configuration only. All execution feature flags default OFF.
-- Includes Priority Bid auction policy + Fair Work Distribution policy (config only).
-- Independent of legacy plans / fake-training. Does NOT modify migration 134.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.
--
-- IMPORTANT NAMESPACES:
--   normal_application_*  = future OPTIONAL normal apply-token policy (NOT Priority Bid)
--   priority_bid_*        = true token auction (freelancer chooses bid amount)
--   fair_* / assignment_* = INTERNAL fairness ranking (never Admin only)
-- Priority Bid losers always RELEASE 100% reserved Tokens — never use normal refund %.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_economy_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Work Token accounting unit (execution gated by work_tokens_enabled)
  work_token_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.100
    CHECK (work_token_value_jod > 0 AND work_token_value_jod <= 1000),

  -- NORMAL application token policy (OPTIONAL future; NOT Priority Bid auction formula)
  normal_application_tokens_per_order_jod NUMERIC(12, 3) NOT NULL DEFAULT 1.000
    CHECK (normal_application_tokens_per_order_jod > 0 AND normal_application_tokens_per_order_jod <= 1000),
  normal_application_token_refund_percentage NUMERIC(5, 2) NOT NULL DEFAULT 70.00
    CHECK (
      normal_application_token_refund_percentage >= 0
      AND normal_application_token_refund_percentage <= 100
    ),

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
  elite_declines_affect_carry_forward BOOLEAN NOT NULL DEFAULT FALSE,

  -- =========================================================
  -- PRIORITY BID (token auction) — config only; engine later
  -- Winner: 100% reserved Tokens CONSUMED
  -- Losers: 100% reserved Tokens RELEASED (never partial refund %)
  -- =========================================================
  priority_bidding_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_bid_duration_minutes INT NOT NULL DEFAULT 30
    CHECK (priority_bid_duration_minutes >= 1 AND priority_bid_duration_minutes <= 10080),
  priority_bid_minimum_tokens INT NOT NULL DEFAULT 1
    CHECK (priority_bid_minimum_tokens >= 1 AND priority_bid_minimum_tokens <= 100000000),
  priority_bid_maximum_tokens INT NULL
    CHECK (
      priority_bid_maximum_tokens IS NULL
      OR (
        priority_bid_maximum_tokens >= 1
        AND priority_bid_maximum_tokens <= 100000000
      )
    ),
  priority_bid_show_highest BOOLEAN NOT NULL DEFAULT TRUE,
  priority_bid_show_position BOOLEAN NOT NULL DEFAULT FALSE,
  priority_bid_allow_increase BOOLEAN NOT NULL DEFAULT TRUE,
  priority_bid_allow_decrease BOOLEAN NOT NULL DEFAULT FALSE,
  priority_bid_allow_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
  priority_bid_withdrawal_releases_tokens BOOLEAN NOT NULL DEFAULT TRUE,
  priority_bid_withdrawal_returns_use BOOLEAN NOT NULL DEFAULT FALSE,
  priority_bid_return_use_on_order_cancel BOOLEAN NOT NULL DEFAULT TRUE,
  priority_bid_auto_assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Default preserves auction promise: highest eligible Token Bid wins
  priority_bid_assignment_strategy VARCHAR(40) NOT NULL DEFAULT 'HIGHEST_TOKEN_ONLY'
    CHECK (
      priority_bid_assignment_strategy IN (
        'HIGHEST_TOKEN_ONLY',
        'FAIR_DISTRIBUTION_FIRST',
        'HYBRID'
      )
    ),

  -- =========================================================
  -- FAIR WORK DISTRIBUTION — INTERNAL only; never Freelancer APIs
  -- =========================================================
  fair_work_distribution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Default strategy for non-auction / auto-assignment contexts
  assignment_strategy VARCHAR(40) NOT NULL DEFAULT 'HIGHEST_TOKEN_ONLY'
    CHECK (
      assignment_strategy IN (
        'HIGHEST_TOKEN_ONLY',
        'FAIR_DISTRIBUTION_FIRST',
        'HYBRID'
      )
    ),
  fairness_weight NUMERIC(5, 2) NOT NULL DEFAULT 0.00
    CHECK (fairness_weight >= 0 AND fairness_weight <= 100),
  token_weight NUMERIC(5, 2) NOT NULL DEFAULT 100.00
    CHECK (token_weight >= 0 AND token_weight <= 100),
  performance_weight NUMERIC(5, 2) NOT NULL DEFAULT 0.00
    CHECK (performance_weight >= 0 AND performance_weight <= 100),
  recency_weight NUMERIC(5, 2) NOT NULL DEFAULT 0.00
    CHECK (recency_weight >= 0 AND recency_weight <= 100),
  workload_weight NUMERIC(5, 2) NOT NULL DEFAULT 0.00
    CHECK (workload_weight >= 0 AND workload_weight <= 100),
  eligible_loss_priority_effect VARCHAR(40) NOT NULL DEFAULT 'INCREASE_PRIORITY'
    CHECK (
      eligible_loss_priority_effect IN (
        'INCREASE_PRIORITY',
        'NO_EFFECT'
      )
    ),
  award_reset_policy VARCHAR(40) NOT NULL DEFAULT 'RESET_TO_ZERO'
    CHECK (
      award_reset_policy IN (
        'RESET_TO_ZERO',
        'DECREMENT_ONE',
        'NO_RESET'
      )
    ),
  decline_priority_effect VARCHAR(40) NOT NULL DEFAULT 'NO_BOOST'
    CHECK (
      decline_priority_effect IN (
        'NO_BOOST',
        'DECREASE_PRIORITY'
      )
    ),
  freelancer_cancel_priority_effect VARCHAR(40) NOT NULL DEFAULT 'NO_BOOST'
    CHECK (
      freelancer_cancel_priority_effect IN (
        'NO_BOOST',
        'DECREASE_PRIORITY'
      )
    ),

  -- Master execution feature flags (Phase 2 defaults: ALL OFF — config only)
  work_tokens_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  marketplace_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cash_membership_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  elite_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verification_bonuses_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_economy_priority_bid_token_bounds
    CHECK (
      priority_bid_maximum_tokens IS NULL
      OR priority_bid_maximum_tokens >= priority_bid_minimum_tokens
    )
);

COMMENT ON TABLE marketplace_economy_settings IS
  'MARKETPLACE_MEMBERSHIP global economy policy (singleton id=1). Configuration only in Phase 2; execution flags default OFF. Applies to REAL ECONOMIC ORDERS (customer/FAZ3AT/admin/authorized sources) — never fake/training.';
COMMENT ON COLUMN marketplace_economy_settings.work_token_value_jod IS
  'Accounting value of one Work Token in JOD (NUMERIC). Terminology: Work Tokens (not Work Connects) until product renames.';
COMMENT ON COLUMN marketplace_economy_settings.normal_application_tokens_per_order_jod IS
  'OPTIONAL future NORMAL application token rate per 1 JOD of REAL order value. NOT the Priority Bid amount — freelancers choose Priority Bid tokens.';
COMMENT ON COLUMN marketplace_economy_settings.normal_application_token_refund_percentage IS
  'OPTIONAL future NORMAL application refund % when a REAL order ends with no freelancer selected. NEVER controls Priority Bid loser release (always 100%).';
COMMENT ON COLUMN marketplace_economy_settings.priority_bidding_enabled IS
  'Master switch for Priority Bid auction engine. Requires wallet AVAILABLE/RESERVED + membership cycles. Default FALSE.';
COMMENT ON COLUMN marketplace_economy_settings.priority_bid_assignment_strategy IS
  'Default HIGHEST_TOKEN_ONLY preserves auction promise: highest eligible Token Bid wins. Fairness must not silently override larger bids in default mode.';
COMMENT ON COLUMN marketplace_economy_settings.fair_work_distribution_enabled IS
  'INTERNAL Fair Work Distribution engine switch. Never expose scores/ranks to Freelancer APIs.';
COMMENT ON COLUMN marketplace_economy_settings.work_tokens_enabled IS
  'Master switch for Work Token wallet/ledger. Phase 2 default FALSE. Required before Priority Bid production use.';

INSERT INTO marketplace_economy_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('135_marketplace_economy_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
