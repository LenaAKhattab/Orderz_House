-- 140: Marketplace Normal Application Work Token economics (Phase 5) — ADDITIVE ONLY.
-- Wires priced-bid (order_freelancer_bids) applications to Work Token consume/refund.
-- Does NOT apply to fixed claimPoolOrder / direct take.
-- Does NOT enable work_tokens_enabled. No historical charge/refund/backfill.
-- Does NOT touch Priority Bid / Fair / Elite / Stripe Token purchase.
--
-- Schema fact: priced bidding historically forced orders.budget IS NULL.
-- Approved Phase 5 cost base is orders.budget — relax CHECK so bidding MAY carry
-- a positive budget used as the immutable Token cost base (not the Freelancer bid amount).
--
-- Refund policy (owner update): eligible normal-application refund is 100% of charged Tokens.
-- Migration 135 seeded 70.00; this migration updates the singleton CURRENT policy to 100.00.
-- Future charges snapshot the configured normal_application_token_refund_percentage
-- from marketplace_economy_settings (not a hardcoded constant). Migration sets CURRENT = 100.
-- Application/API validation currently allows only 100 until a non-100 rounding policy is approved.

BEGIN;

-- =========================================================
-- Allow optional positive budget on bidding orders (Token cost base)
-- =========================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_by_project_type_chk;

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_by_project_type_chk
  CHECK (
    (
      project_type = 'fixed'
      AND currency_code IS NOT NULL
      AND char_length(currency_code) = 3
      AND budget IS NOT NULL
      AND budget > 0
      AND bid_budget_min IS NULL
      AND bid_budget_max IS NULL
    )
    OR
    (
      project_type = 'bidding'
      AND (
        budget IS NULL
        OR budget > 0
      )
      AND (
        (
          currency_code IS NULL
          AND bid_budget_min IS NULL
          AND bid_budget_max IS NULL
        )
        OR
        (
          currency_code IS NOT NULL
          AND char_length(currency_code) = 3
          AND bid_budget_min IS NOT NULL
          AND bid_budget_max IS NOT NULL
          AND bid_budget_min > 0
          AND bid_budget_max >= bid_budget_min
        )
      )
    )
  );

COMMENT ON COLUMN orders.budget IS
  'Fixed: order price. Bidding: optional canonical REAL order value for normal-application Work Token cost (Phase 5). Not the Freelancer proposed bid amount.';

-- =========================================================
-- Phase 5 refund policy: CURRENT singleton = 100% (was 70 in migration 135 seed)
-- Safe: no Phase 5 economics rows charged yet; historical applications don't exist.
-- Future charges snapshot 100 onto order_freelancer_bid_work_token_economics.
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ALTER COLUMN normal_application_token_refund_percentage SET DEFAULT 100.00;

UPDATE marketplace_economy_settings
   SET normal_application_token_refund_percentage = 100.00,
       updated_at = NOW()
 WHERE id = 1;

COMMENT ON COLUMN marketplace_economy_settings.normal_application_token_refund_percentage IS
  'NORMAL application refund % when a REAL order ends with no freelancer selected. Phase 5 approved CURRENT policy = 100. NEVER controls Priority Bid loser release (always 100% RELEASE). Snapshot at charge time on bid economics rows.';

-- =========================================================
-- Extend ledger event_type CHECK for Phase 5 normal application events
-- =========================================================
ALTER TABLE work_token_ledger_entries
  DROP CONSTRAINT IF EXISTS work_token_ledger_entries_event_type_check;

ALTER TABLE work_token_ledger_entries
  ADD CONSTRAINT work_token_ledger_entries_event_type_check
  CHECK (
    event_type IN (
      'TOKEN_CREDIT',
      'TOKEN_RESERVE',
      'TOKEN_RELEASE',
      'TOKEN_CONSUME',
      'TOKEN_CONSUME_AVAILABLE',
      'MEMBERSHIP_CYCLE_GRANT',
      'IDENTITY_VERIFICATION_BONUS',
      'PAYOUT_VERIFICATION_BONUS',
      'ADMIN_ADJUSTMENT_CREDIT',
      'ADMIN_ADJUSTMENT_DEBIT',
      'PRIORITY_BID_RESERVE',
      'PRIORITY_BID_INCREASE_RESERVE',
      'PRIORITY_BID_RELEASE',
      'PRIORITY_BID_CONSUME',
      'NORMAL_APPLICATION_CONSUME',
      'NORMAL_APPLICATION_REFUND'
    )
  );

-- =========================================================
-- Per-bid immutable economic snapshot (first charge only)
-- =========================================================
CREATE TABLE IF NOT EXISTS order_freelancer_bid_work_token_economics (
  id BIGSERIAL PRIMARY KEY,

  bid_id BIGINT NOT NULL REFERENCES order_freelancer_bids(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Snapshotted pricing inputs / outputs at first charge
  order_budget_jod NUMERIC(12, 3) NOT NULL
    CHECK (order_budget_jod > 0),
  tokens_per_order_jod NUMERIC(12, 3) NOT NULL
    CHECK (tokens_per_order_jod > 0),
  token_cost INTEGER NOT NULL
    CHECK (token_cost > 0),
  cost_rounding_rule VARCHAR(20) NOT NULL DEFAULT 'CEIL'
    CHECK (cost_rounding_rule = 'CEIL'),

  refund_percentage NUMERIC(5, 2) NOT NULL
    CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
  -- FULL = configured/snapshotted 100% → refund_tokens equals token_cost.
  -- POLICY_PENDING = snapshotted non-100% awaiting a future approved rounding rule (do not invent).
  refund_rounding_rule VARCHAR(20) NOT NULL DEFAULT 'FULL'
    CHECK (refund_rounding_rule IN ('FULL', 'POLICY_PENDING')),

  charge_status VARCHAR(20) NOT NULL DEFAULT 'charged'
    CHECK (charge_status IN ('charged', 'rolled_back')),
  refund_status VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'refunded', 'not_applicable')),
  refund_tokens INTEGER NULL
    CHECK (refund_tokens IS NULL OR refund_tokens >= 0),
  refund_reason VARCHAR(80) NULL,

  charge_ledger_entry_id BIGINT NULL REFERENCES work_token_ledger_entries(id) ON DELETE SET NULL,
  refund_ledger_entry_id BIGINT NULL REFERENCES work_token_ledger_entries(id) ON DELETE SET NULL,

  charged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_freelancer_bid_wt_econ_bid_uidx UNIQUE (bid_id),
  CONSTRAINT order_freelancer_bid_wt_econ_pair_uidx UNIQUE (order_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_wt_econ_order_idx
  ON order_freelancer_bid_work_token_economics (order_id);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_wt_econ_freelancer_idx
  ON order_freelancer_bid_work_token_economics (freelancer_user_id);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_wt_econ_refund_pending_idx
  ON order_freelancer_bid_work_token_economics (order_id, refund_status)
  WHERE charge_status = 'charged' AND refund_status = 'none';

COMMENT ON TABLE order_freelancer_bid_work_token_economics IS
  'Phase 5: immutable normal-application Work Token charge/refund snapshot per Freelancer bid. First charge only; bid updates do not create a second row.';

COMMENT ON COLUMN order_freelancer_bid_work_token_economics.token_cost IS
  'CEIL(order_budget_jod * tokens_per_order_jod) at charge time. Integer Work Tokens.';

COMMENT ON COLUMN order_freelancer_bid_work_token_economics.refund_percentage IS
  'Snapshotted normal_application_token_refund_percentage from marketplace_economy_settings at first charge. Historical refunds must not use later economy settings.';

COMMENT ON COLUMN order_freelancer_bid_work_token_economics.refund_rounding_rule IS
  'FULL when snapshotted refund_percentage is 100 (refund_tokens = token_cost). POLICY_PENDING for non-100 snapshots until a future rounding rule is approved.';

INSERT INTO schema_migrations (version)
VALUES ('140_marketplace_normal_application_work_tokens')
ON CONFLICT (version) DO NOTHING;

COMMIT;
