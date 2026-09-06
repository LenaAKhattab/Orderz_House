-- 147: Phase B2 — Normal real-order Bid Credit economics + refund vocabulary (ADDITIVE ONLY).
-- First valid Freelancer+Order priced bid consumes exactly 1 Bid Credit (FEFO).
-- Eligible refund: Order ends with NO Freelancer selected → restore 100%.
--   * unexpired source grant → restore 1 to SAME bucket
--   * expired source grant → compensating SYSTEM grant (1 Bid, expires in 30 days)
-- Does NOT enable bid_credits_enabled.
-- Does NOT backfill historical applications / refunds / grants.
-- Does NOT DROP Work Token tables / order_freelancer_bid_work_token_economics.
-- Does NOT wire Priority / Elite / Article / fixed-take.
-- Apply ONLY after explicit review. Do not auto-apply.

BEGIN;

-- =========================================================
-- Extend Bid Credit ledger event vocabulary (refund)
-- =========================================================
ALTER TABLE marketplace_bid_credit_ledger_entries
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_ledger_entries_event_type_check;

ALTER TABLE marketplace_bid_credit_ledger_entries
  ADD CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  CHECK (
    event_type IN (
      'MEMBERSHIP_BID_GRANT',
      'ADMIN_BID_GRANT',
      'ADMIN_BID_ADJUSTMENT',
      'APPLICATION_BID_CONSUME',
      'BID_EXPIRED',
      'NORMAL_APPLICATION_BID_REFUND'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  ON marketplace_bid_credit_ledger_entries IS
  'Phase B2 adds NORMAL_APPLICATION_BID_REFUND for eligible no-selection application reversals.';

-- =========================================================
-- Extend Bid Credit grant source vocabulary (system refund)
-- =========================================================
ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_source_type_check;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_source_type_check
  CHECK (
    source_type IN (
      'membership_daily_unlock',
      'admin_manual',
      'admin_adjustment',
      'normal_application_refund'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_grants_source_type_check
  ON marketplace_bid_credit_grants IS
  'Phase B2 adds normal_application_refund for expired-source compensating Bid grants (30-day).';

-- =========================================================
-- Per-application Bid Credit economics snapshot
-- =========================================================
CREATE TABLE IF NOT EXISTS order_freelancer_bid_credit_economics (
  id BIGSERIAL PRIMARY KEY,

  bid_id BIGINT NOT NULL REFERENCES order_freelancer_bids(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Always 1 for B2 normal applications (product rule).
  bid_credit_cost INTEGER NOT NULL DEFAULT 1
    CONSTRAINT order_freelancer_bid_credit_economics_cost_chk
      CHECK (bid_credit_cost = 1),

  charge_status VARCHAR(20) NOT NULL DEFAULT 'charged'
    CHECK (charge_status IN ('charged', 'skipped_engine_off', 'not_applicable')),
  refund_status VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'refunded', 'not_applicable')),

  consume_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  primary_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  -- Snapshot of soonest-consumed grant expiry at charge time (refund path decision).
  grant_expires_at_snapshot TIMESTAMPTZ NULL,

  -- Refund audit
  refund_mode VARCHAR(40) NULL
    CHECK (
      refund_mode IS NULL
      OR refund_mode IN ('same_bucket_restore', 'compensating_grant_30d')
    ),
  refund_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  compensating_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  refund_idempotency_key VARCHAR(180) NULL,

  idempotency_key VARCHAR(180) NOT NULL,
  fefo_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  charged_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_freelancer_bid_credit_economics_order_freelancer_uidx
    UNIQUE (order_id, freelancer_user_id),
  CONSTRAINT order_freelancer_bid_credit_economics_idempotency_uidx
    UNIQUE (idempotency_key),
  CONSTRAINT order_freelancer_bid_credit_economics_refund_idempotency_uidx
    UNIQUE (refund_idempotency_key)
);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_credit_economics_freelancer_idx
  ON order_freelancer_bid_credit_economics (freelancer_user_id, charged_at DESC);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_credit_economics_bid_idx
  ON order_freelancer_bid_credit_economics (bid_id);

CREATE INDEX IF NOT EXISTS order_freelancer_bid_credit_economics_order_idx
  ON order_freelancer_bid_credit_economics (order_id);

COMMENT ON TABLE order_freelancer_bid_credit_economics IS
  'Phase B2: First-application Bid Credit charge/refund snapshot (1 Bid). WT economics remain legacy-only. No historical backfill.';

COMMENT ON COLUMN order_freelancer_bid_credit_economics.bid_credit_cost IS
  'Always 1 for normal real priced applications. Not derived from budget/JOD/Article level.';

COMMENT ON COLUMN order_freelancer_bid_credit_economics.refund_status IS
  'none until eligible no-selection refund; refunded after same-bucket restore or compensating grant.';

COMMENT ON COLUMN order_freelancer_bid_credit_economics.refund_mode IS
  'same_bucket_restore when original grant still unexpired; compensating_grant_30d when source expired.';

INSERT INTO schema_migrations (version)
VALUES ('147_normal_application_bid_credit_economics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
