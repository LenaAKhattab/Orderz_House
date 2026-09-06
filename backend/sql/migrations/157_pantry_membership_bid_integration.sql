-- 157: بيت المونة × Marketplace Membership + Bid Credit integration (ADDITIVE ONLY).
-- Does NOT recreate 153_pantry_house / pantry_* workflow tables.
-- Does NOT enable bid_credits_enabled / article engines / Work Tokens.
-- Does NOT activate pantry_membership_bid_integration_enabled (seeds FALSE).
-- Schema apply is readiness only. Runtime requires the explicit flag AND bid_credits_enabled.
-- ADD COLUMN DEFAULT FALSE only; does not UPDATE/overwrite an existing flag value.
-- Does NOT backfill historical pantry bids or rewrite existing request economics
--   (NULL application_bid_cost = runtime fallback 1; NULL target = no auto-close).
-- Numbered 157 because Production has 155 applied and 156_default_plan_catalog is next pending.
-- DO NOT APPLY until explicit review. Do not apply blindly on Production.

BEGIN;

-- =========================================================
-- Pantry request integration fields (nullable = legacy behavior)
-- =========================================================
ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS application_bid_cost INTEGER NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS target_applicant_count INTEGER NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS eligible_tier_codes JSONB NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS application_deadline_at TIMESTAMPTZ NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS applications_closed_at TIMESTAMPTZ NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS applications_close_reason VARCHAR(40) NULL;

ALTER TABLE pantry_requests
  DROP CONSTRAINT IF EXISTS pantry_requests_application_bid_cost_chk;
ALTER TABLE pantry_requests
  ADD CONSTRAINT pantry_requests_application_bid_cost_chk
  CHECK (application_bid_cost IS NULL OR (application_bid_cost >= 1 AND application_bid_cost <= 1000));

ALTER TABLE pantry_requests
  DROP CONSTRAINT IF EXISTS pantry_requests_target_applicant_count_chk;
ALTER TABLE pantry_requests
  ADD CONSTRAINT pantry_requests_target_applicant_count_chk
  CHECK (target_applicant_count IS NULL OR (target_applicant_count >= 1 AND target_applicant_count <= 10000));

ALTER TABLE pantry_requests
  DROP CONSTRAINT IF EXISTS pantry_requests_applications_close_reason_chk;
ALTER TABLE pantry_requests
  ADD CONSTRAINT pantry_requests_applications_close_reason_chk
  CHECK (
    applications_close_reason IS NULL
    OR applications_close_reason IN ('target_reached', 'deadline_reached', 'manual', 'assigned')
  );

CREATE INDEX IF NOT EXISTS pantry_requests_application_deadline_open_idx
  ON pantry_requests (application_deadline_at)
  WHERE application_deadline_at IS NOT NULL
    AND applications_closed_at IS NULL
    AND status = 'open_for_bids';

COMMENT ON COLUMN pantry_requests.application_bid_cost IS
  'Membership Bid quantity consumed on first valid pantry_bids row. NULL = runtime default 1.';
COMMENT ON COLUMN pantry_requests.target_applicant_count IS
  'Valid applicant cap; NULL = no auto-close by count (legacy unlimited). Does not auto-award.';
COMMENT ON COLUMN pantry_requests.eligible_tier_codes IS
  'Optional Pantry-specific Marketplace Membership tier allow-list (starter/silver/pro/elite). NULL = no extra restriction.';
COMMENT ON COLUMN pantry_requests.application_deadline_at IS
  'Stop accepting pantry applications at/after this instant. Distinct from delivery deadline.';

-- =========================================================
-- STARTER one-time Pantry application opportunity (per freelancer, never recycled)
-- =========================================================
CREATE TABLE IF NOT EXISTS freelancer_starter_pantry_opportunity (
  freelancer_user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ NULL,
  pantry_request_id BIGINT NULL REFERENCES pantry_requests(id) ON DELETE SET NULL,
  pantry_bid_id BIGINT NULL REFERENCES pantry_bids(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE freelancer_starter_pantry_opportunity IS
  'STARTER: exactly one successful بيت المونة application opportunity. Not restored on loss, refund, upgrade, or new cycle.';

-- =========================================================
-- Pantry Bid Credit economics (dedicated; not Article reservation / not order economics)
-- =========================================================
CREATE TABLE IF NOT EXISTS pantry_application_bid_credit_economics (
  id BIGSERIAL PRIMARY KEY,
  pantry_bid_id BIGINT NOT NULL REFERENCES pantry_bids(id) ON DELETE RESTRICT,
  pantry_request_id BIGINT NOT NULL REFERENCES pantry_requests(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bid_credit_cost INTEGER NOT NULL
    CONSTRAINT pantry_application_bid_credit_economics_cost_chk
      CHECK (bid_credit_cost >= 1 AND bid_credit_cost <= 1000),
  charge_status VARCHAR(20) NOT NULL DEFAULT 'charged'
    CHECK (charge_status IN ('charged', 'skipped_engine_off', 'not_applicable')),
  refund_status VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'refunded', 'not_applicable')),
  consume_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  primary_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  refund_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  compensating_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  refund_mode VARCHAR(40) NULL,
  refund_idempotency_key VARCHAR(180) NULL UNIQUE,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  fefo_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  charged_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pantry_request_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS pantry_app_bid_econ_freelancer_idx
  ON pantry_application_bid_credit_economics (freelancer_user_id, refund_status);

COMMENT ON TABLE pantry_application_bid_credit_economics IS
  'Pantry application Bid consume/refund audit. Consume on successful pantry_bids insert; not Article reservation.';

-- =========================================================
-- Ledger / grant vocabulary (additive; preserve all prior events)
-- =========================================================
ALTER TABLE marketplace_bid_credit_ledger_entries
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_ledger_entries_event_type_check;
ALTER TABLE marketplace_bid_credit_ledger_entries
  ADD CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  CHECK (event_type IN (
    'MEMBERSHIP_BID_GRANT',
    'ADMIN_BID_GRANT',
    'ADMIN_BID_ADJUSTMENT',
    'APPLICATION_BID_CONSUME',
    'BID_EXPIRED',
    'NORMAL_APPLICATION_BID_REFUND',
    'ARTICLE_APPLICATION_BID_CONSUME',
    'ARTICLE_APPLICATION_BID_REFUND',
    'BID_PACKAGE_PURCHASE_GRANT',
    'BID_PACKAGE_PURCHASE_REVOKE',
    'ADMIN_DISTRIBUTION_POOL_GRANT',
    'BID_RESERVE',
    'BID_RESERVE_RELEASE',
    'BID_RESERVE_CONSUME',
    'PANTRY_APPLICATION_BID_CONSUME',
    'PANTRY_APPLICATION_BID_REFUND'
  ));

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_source_type_check;
ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_source_type_check
  CHECK (source_type IN (
    'membership_daily_unlock',
    'admin_manual',
    'admin_adjustment',
    'normal_application_refund',
    'article_application_refund',
    'package_purchase',
    'admin_distribution_pool',
    'pantry_application_refund'
  ));

-- =========================================================
-- Explicit Pantry integration flag (schema apply ≠ runtime activation)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_membership_bid_integration_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN marketplace_economy_settings.pantry_membership_bid_integration_enabled IS
  'Master switch for بيت المونة Membership+Bid integration. Default FALSE. Applying 157 does not activate. Runtime also requires bid_credits_enabled=true. Existing values are preserved on re-apply.';

COMMIT;
