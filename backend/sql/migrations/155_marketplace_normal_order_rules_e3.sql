-- 155: Phase E3 — Normal Order Admin-configurable marketplace rules (ADDITIVE ONLY).
-- Production currently has Migration 154 applied (+ orphan 153_pantry_house on Production).
-- Next safe repo version after 154 is 155. Do NOT recreate pantry / بيت المونة schema.
-- Does NOT enable bid_credits_enabled / article engines.
-- Does NOT rewrite historical open Order economics (NULL E3 fields = legacy B2 defaults at runtime).
-- Does NOT apply automatically — review then migrate explicitly.
--
-- Product:
--   - Admin global min/max for order value, applicants, Bid cost, periods
--   - Per-Order snapshotted application_bid_cost / target_applicant_count / deadline / policies
--   - Economic fields lock after first valid application
--   - Relax B2 economics CHECK (bid_credit_cost = 1) → cost >= 1 (quantity-aware)

BEGIN;

-- =========================================================
-- Admin-configurable Normal Order limits (canonical settings)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_min_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 1.000;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_max_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 10000.000;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_min_target_applicants INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_max_target_applicants INTEGER NOT NULL DEFAULT 200;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_default_target_applicants INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_min_bid_cost INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_max_bid_cost INTEGER NOT NULL DEFAULT 20;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_default_bid_cost INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_min_application_period_hours INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_max_application_period_hours INTEGER NOT NULL DEFAULT 720;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_default_application_period_hours INTEGER NOT NULL DEFAULT 72;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_min_execution_duration_hours INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_max_execution_duration_hours INTEGER NOT NULL DEFAULT 2160;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_default_execution_duration_hours INTEGER NOT NULL DEFAULT 72;

-- Deadline reached before applicant target:
--   continue_with_received | cancel_and_refund | require_admin_review
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_deadline_incomplete_target_policy VARCHAR(40)
    NOT NULL DEFAULT 'continue_with_received';

-- Explicit refund eligibility policies (full / none — accounting engine does not support partial %)
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_client_cancel_before_selection VARCHAR(16)
    NOT NULL DEFAULT 'full';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_system_cancel VARCHAR(16)
    NOT NULL DEFAULT 'full';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_deadline_no_selection VARCHAR(16)
    NOT NULL DEFAULT 'full';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_no_freelancer_selected VARCHAR(16)
    NOT NULL DEFAULT 'full';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_freelancer_withdrawal VARCHAR(16)
    NOT NULL DEFAULT 'none';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_rejected_application VARCHAR(16)
    NOT NULL DEFAULT 'none';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_losing_applicant VARCHAR(16)
    NOT NULL DEFAULT 'none';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_refund_post_award_cancel VARCHAR(16)
    NOT NULL DEFAULT 'none';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS normal_order_business_timezone VARCHAR(64)
    NOT NULL DEFAULT 'Asia/Amman';

-- Bounds / policy CHECKs
ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_value_range_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_value_range_chk
  CHECK (
    normal_order_min_value_jod > 0
    AND normal_order_max_value_jod >= normal_order_min_value_jod
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_applicants_range_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_applicants_range_chk
  CHECK (
    normal_order_min_target_applicants >= 1
    AND normal_order_max_target_applicants >= normal_order_min_target_applicants
    AND normal_order_default_target_applicants >= normal_order_min_target_applicants
    AND normal_order_default_target_applicants <= normal_order_max_target_applicants
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_bid_cost_range_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_bid_cost_range_chk
  CHECK (
    normal_order_min_bid_cost >= 1
    AND normal_order_max_bid_cost >= normal_order_min_bid_cost
    AND normal_order_default_bid_cost >= normal_order_min_bid_cost
    AND normal_order_default_bid_cost <= normal_order_max_bid_cost
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_app_period_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_app_period_chk
  CHECK (
    normal_order_min_application_period_hours >= 1
    AND normal_order_max_application_period_hours >= normal_order_min_application_period_hours
    AND normal_order_default_application_period_hours >= normal_order_min_application_period_hours
    AND normal_order_default_application_period_hours <= normal_order_max_application_period_hours
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_exec_period_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_exec_period_chk
  CHECK (
    normal_order_min_execution_duration_hours >= 1
    AND normal_order_max_execution_duration_hours >= normal_order_min_execution_duration_hours
    AND normal_order_default_execution_duration_hours >= normal_order_min_execution_duration_hours
    AND normal_order_default_execution_duration_hours <= normal_order_max_execution_duration_hours
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_deadline_policy_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_deadline_policy_chk
  CHECK (
    normal_order_deadline_incomplete_target_policy IN (
      'continue_with_received',
      'cancel_and_refund',
      'require_admin_review'
    )
  );

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_normal_order_refund_policies_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_normal_order_refund_policies_chk
  CHECK (
    normal_order_refund_client_cancel_before_selection IN ('full', 'none')
    AND normal_order_refund_system_cancel IN ('full', 'none')
    AND normal_order_refund_deadline_no_selection IN ('full', 'none')
    AND normal_order_refund_no_freelancer_selected IN ('full', 'none')
    AND normal_order_refund_freelancer_withdrawal IN ('full', 'none')
    AND normal_order_refund_rejected_application IN ('full', 'none')
    AND normal_order_refund_losing_applicant IN ('full', 'none')
    AND normal_order_refund_post_award_cancel IN ('full', 'none')
  );

COMMENT ON COLUMN marketplace_economy_settings.normal_order_default_bid_cost IS
  'E3: default application Bid cost snapshotted onto new Normal Orders (B2-compatible default 1).';
COMMENT ON COLUMN marketplace_economy_settings.normal_order_deadline_incomplete_target_policy IS
  'E3: when application_deadline elapses before target applicants — continue_with_received | cancel_and_refund | require_admin_review.';
COMMENT ON COLUMN marketplace_economy_settings.normal_order_business_timezone IS
  'E3: deterministic timezone for application deadline comparisons (default Asia/Amman).';

-- =========================================================
-- Order rule snapshot fields (NULL = legacy pre-E3 / no cap)
-- =========================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS application_bid_cost INTEGER NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS target_applicant_count INTEGER NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS application_deadline_at TIMESTAMPTZ NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS applications_closed_at TIMESTAMPTZ NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS applications_close_reason VARCHAR(40) NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deadline_incomplete_target_policy VARCHAR(40) NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS e3_rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS e3_rules_version INTEGER NULL;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_application_bid_cost_chk;
ALTER TABLE orders
  ADD CONSTRAINT orders_application_bid_cost_chk
  CHECK (application_bid_cost IS NULL OR (application_bid_cost >= 1 AND application_bid_cost <= 1000));

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_target_applicant_count_chk;
ALTER TABLE orders
  ADD CONSTRAINT orders_target_applicant_count_chk
  CHECK (target_applicant_count IS NULL OR (target_applicant_count >= 1 AND target_applicant_count <= 10000));

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_applications_close_reason_chk;
ALTER TABLE orders
  ADD CONSTRAINT orders_applications_close_reason_chk
  CHECK (
    applications_close_reason IS NULL
    OR applications_close_reason IN (
      'target_reached',
      'deadline_reached',
      'cancelled',
      'manual',
      'admin_review',
      'winner_selected'
    )
  );

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_deadline_incomplete_target_policy_chk;
ALTER TABLE orders
  ADD CONSTRAINT orders_deadline_incomplete_target_policy_chk
  CHECK (
    deadline_incomplete_target_policy IS NULL
    OR deadline_incomplete_target_policy IN (
      'continue_with_received',
      'cancel_and_refund',
      'require_admin_review'
    )
  );

CREATE INDEX IF NOT EXISTS orders_application_deadline_open_idx
  ON orders (application_deadline_at)
  WHERE application_deadline_at IS NOT NULL
    AND applications_closed_at IS NULL
    AND is_open_for_pool = TRUE;

COMMENT ON COLUMN orders.application_bid_cost IS
  'E3: snapshotted Bid cost for first valid priced application. NULL = legacy treat as 1 at runtime.';
COMMENT ON COLUMN orders.target_applicant_count IS
  'E3: valid applicant target; NULL = no auto-close by count (legacy).';
COMMENT ON COLUMN orders.application_deadline_at IS
  'E3: stop accepting applications at/after this instant (timestamptz; compare in UTC). NULL = no deadline auto-close.';
COMMENT ON COLUMN orders.e3_rules_snapshot IS
  'E3: immutable published snapshot of Admin limits/policies relevant to this Order.';

-- =========================================================
-- Quantity-aware Bid economics (relax B2 cost = 1)
-- =========================================================
ALTER TABLE order_freelancer_bid_credit_economics
  DROP CONSTRAINT IF EXISTS order_freelancer_bid_credit_economics_cost_chk;

ALTER TABLE order_freelancer_bid_credit_economics
  ADD CONSTRAINT order_freelancer_bid_credit_economics_cost_chk
  CHECK (bid_credit_cost >= 1 AND bid_credit_cost <= 1000);

COMMENT ON COLUMN order_freelancer_bid_credit_economics.bid_credit_cost IS
  'E3: exact Bid quantity consumed for this application (was fixed =1 in B2).';

COMMIT;
