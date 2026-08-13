-- 151: Phase B6 — Bid Credit package commercial purchases + payment reversal policy.
-- Freelancer purchases configured Bid packages via Stripe Checkout.
-- Package validity_days is Admin-controlled; purchased grant expiry uses purchase snapshot.
-- Payment reversal (owner-approved):
--   FULL refund / dispute lost → revoke UNUSED remainder of THAT purchase grant only
--   Dispute open / partial refund → freeze purchase remainder (no proportional Bid math)
--   Dispute won → unfreeze if still within original expires_at (freeze does NOT extend expiry)
-- Does NOT:
--   enable bid_credits_enabled or bid_credit_purchases_enabled
--   seed packages / create purchases / create Bid grants
--   backfill historical payments / invent Stripe refunds
--   alter Work Tokens / B2 / B4 / B5 / membership allowances / Fair / Elite
-- Apply ONLY after explicit review. Do not auto-apply.
--
-- NOTE: This file was amended after initial B6 authoring (still unapplied) to include
-- coherent grant freeze/revoke + purchase reversal audit schema in one migration.

BEGIN;

-- =========================================================
-- Dedicated commercial purchases feature flag (dormant)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN marketplace_economy_settings.bid_credit_purchases_enabled IS
  'Phase B6: Bid package commercial purchase engine. Default OFF. Requires bid_credits_enabled=true to fulfill.';

-- =========================================================
-- Package validity duration (Admin-controlled; not membership-tied)
-- =========================================================
ALTER TABLE marketplace_bid_credit_packages
  ADD COLUMN IF NOT EXISTS validity_days INTEGER NULL;

ALTER TABLE marketplace_bid_credit_packages
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_packages_validity_days_chk;

ALTER TABLE marketplace_bid_credit_packages
  ADD CONSTRAINT marketplace_bid_credit_packages_validity_days_chk
  CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 3650));

COMMENT ON COLUMN marketplace_bid_credit_packages.validity_days IS
  'Phase B6: Purchased Bid grant lifetime in days from fulfillment. Required (>0) for purchasable active packages.';

-- =========================================================
-- Extend Bid grant source vocabulary
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
      'normal_application_refund',
      'article_application_refund',
      'package_purchase'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_grants_source_type_check
  ON marketplace_bid_credit_grants IS
  'Phase B6 adds package_purchase for commercial Bid package fulfillment.';

-- =========================================================
-- Grant status: frozen (dispute/partial-refund hold) — spendable only when active
-- =========================================================
ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_status_check;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_status_check
  CHECK (status IN ('active', 'exhausted', 'expired', 'revoked', 'frozen'));

COMMENT ON CONSTRAINT marketplace_bid_credit_grants_status_check
  ON marketplace_bid_credit_grants IS
  'Phase B6: frozen = non-spendable remainder (dispute open / partial-refund review). Freeze does not extend expires_at.';

-- Permanently revoked unused remainder (commercial reversal); distinct from amount_expired
ALTER TABLE marketplace_bid_credit_grants
  ADD COLUMN IF NOT EXISTS amount_revoked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_amount_revoked_chk;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_amount_revoked_chk
  CHECK (amount_revoked >= 0);

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_amounts_chk;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_amounts_chk
  CHECK (amount_consumed + amount_expired + amount_revoked <= amount_granted);

ALTER TABLE marketplace_bid_credit_grants
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_bid_credit_grants
  ADD COLUMN IF NOT EXISTS freeze_reason VARCHAR(64) NULL;

COMMENT ON COLUMN marketplace_bid_credit_grants.amount_revoked IS
  'Phase B6: Permanently revoked unused Bids (full refund / dispute lost / Admin revoke). Never claws back consumed.';

COMMENT ON COLUMN marketplace_bid_credit_grants.frozen_at IS
  'Phase B6: When status=frozen; remaining unused Bids excluded from available/FEFO until unfreeze or revoke/expire.';

-- =========================================================
-- Extend Bid ledger event vocabulary
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
      'NORMAL_APPLICATION_BID_REFUND',
      'ARTICLE_APPLICATION_BID_CONSUME',
      'ARTICLE_APPLICATION_BID_REFUND',
      'BID_PACKAGE_PURCHASE_GRANT',
      'BID_PACKAGE_PURCHASE_REVOKE'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  ON marketplace_bid_credit_ledger_entries IS
  'Phase B6: GRANT + REVOKE are economic quantity events. Freeze/unfreeze are grant status-only (no fake ledger amounts).';

-- =========================================================
-- Bid Credit package purchases (+ reversal audit fields)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_bid_credit_purchases (
  id BIGSERIAL PRIMARY KEY,

  freelancer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,
  package_id BIGINT NOT NULL
    REFERENCES marketplace_bid_credit_packages(id) ON DELETE RESTRICT,

  -- Immutable commercial snapshot at checkout creation
  package_code_snapshot VARCHAR(64) NOT NULL,
  bid_quantity_snapshot INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_purchases_qty_chk
      CHECK (bid_quantity_snapshot > 0 AND bid_quantity_snapshot <= 1000000),
  price_jod_snapshot NUMERIC(12, 3) NOT NULL
    CONSTRAINT marketplace_bid_credit_purchases_price_chk
      CHECK (price_jod_snapshot > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD'
    CONSTRAINT marketplace_bid_credit_purchases_currency_chk
      CHECK (currency = 'JOD'),
  validity_days_snapshot INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_purchases_validity_chk
      CHECK (validity_days_snapshot >= 1 AND validity_days_snapshot <= 3650),
  expected_amount_minor INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_purchases_amount_minor_chk
      CHECK (expected_amount_minor > 0),

  -- Fulfillment lifecycle (distinct from provider reversal)
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CONSTRAINT marketplace_bid_credit_purchases_status_chk
      CHECK (
        status IN (
          'pending',
          'checkout_created',
          'paid',
          'fulfilled',
          'cancelled',
          'failed'
        )
      ),

  provider VARCHAR(32) NOT NULL DEFAULT 'stripe'
    CONSTRAINT marketplace_bid_credit_purchases_provider_chk
      CHECK (provider = 'stripe'),

  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_event_id VARCHAR(255) NULL,
  stripe_refund_id VARCHAR(255) NULL,
  stripe_dispute_id VARCHAR(255) NULL,

  fulfilled_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,

  idempotency_key VARCHAR(200) NOT NULL,
  grant_idempotency_key VARCHAR(200) NULL,
  revoke_idempotency_key VARCHAR(200) NULL,

  checkout_created_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,
  fulfilled_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,

  -- Provider reversal lifecycle (independent of fulfillment status)
  payment_reversal_status VARCHAR(48) NOT NULL DEFAULT 'none'
    CONSTRAINT marketplace_bid_credit_purchases_reversal_status_chk
      CHECK (
        payment_reversal_status IN (
          'none',
          'dispute_open',
          'dispute_won',
          'dispute_lost',
          'refunded_full',
          'refunded_partial_manual_review',
          'manual_resolved_released',
          'manual_resolved_revoked',
          'manual_resolved_kept_frozen'
        )
      ),

  provider_refund_recorded_at TIMESTAMPTZ NULL,
  provider_dispute_recorded_at TIMESTAMPTZ NULL,
  provider_dispute_resolved_at TIMESTAMPTZ NULL,
  provider_refund_status VARCHAR(40) NULL,
  provider_dispute_status VARCHAR(40) NULL,
  provider_refund_amount_minor INTEGER NULL
    CONSTRAINT marketplace_bid_credit_purchases_refund_amt_chk
      CHECK (provider_refund_amount_minor IS NULL OR provider_refund_amount_minor >= 0),

  -- Audit: consumed vs unused at reversal time (no clawback of consumed)
  consumed_before_reversal INTEGER NULL
    CONSTRAINT marketplace_bid_credit_purchases_consumed_rev_chk
      CHECK (consumed_before_reversal IS NULL OR consumed_before_reversal >= 0),
  unused_revoked_amount INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_bid_credit_purchases_unused_revoked_chk
      CHECK (unused_revoked_amount >= 0),
  unused_frozen_amount INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_bid_credit_purchases_unused_frozen_chk
      CHECK (unused_frozen_amount >= 0),

  manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  manual_review_resolved_at TIMESTAMPTZ NULL,
  manual_review_resolution VARCHAR(40) NULL
    CONSTRAINT marketplace_bid_credit_purchases_manual_res_chk
      CHECK (
        manual_review_resolution IS NULL
        OR manual_review_resolution IN (
          'keep_frozen',
          'release_remaining',
          'revoke_remaining'
        )
      ),
  manual_review_actor_user_id BIGINT NULL
    REFERENCES users(id) ON DELETE SET NULL,
  manual_review_note TEXT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_bid_credit_purchases_idem_uidx
    UNIQUE (idempotency_key),
  CONSTRAINT marketplace_bid_credit_purchases_session_uidx
    UNIQUE (stripe_checkout_session_id),
  CONSTRAINT marketplace_bid_credit_purchases_grant_idem_uidx
    UNIQUE (grant_idempotency_key),
  CONSTRAINT marketplace_bid_credit_purchases_revoke_idem_uidx
    UNIQUE (revoke_idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_purchases_freelancer_idx
  ON marketplace_bid_credit_purchases (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_purchases_package_idx
  ON marketplace_bid_credit_purchases (package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_purchases_status_idx
  ON marketplace_bid_credit_purchases (status, created_at DESC)
  WHERE status IN ('pending', 'checkout_created', 'paid');

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_purchases_reversal_idx
  ON marketplace_bid_credit_purchases (payment_reversal_status, created_at DESC)
  WHERE payment_reversal_status <> 'none';

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_purchases_manual_review_idx
  ON marketplace_bid_credit_purchases (manual_review_required, created_at DESC)
  WHERE manual_review_required = TRUE;

COMMENT ON TABLE marketplace_bid_credit_purchases IS
  'Phase B6: Commercial Bid package purchases. Snapshot immutable after checkout. Fulfillment via verified Stripe webhook. Reversal: revoke/freeze THAT purchase grant only. No historical backfill.';

COMMENT ON COLUMN marketplace_bid_credit_purchases.price_jod_snapshot IS
  'Authoritative JOD price at checkout; Stripe amount derived server-side (JOD × 1000). Client price ignored.';

COMMENT ON COLUMN marketplace_bid_credit_purchases.validity_days_snapshot IS
  'Purchased grant expires_at = fulfillment time + this many days. Independent of membership.';

COMMENT ON COLUMN marketplace_bid_credit_purchases.payment_reversal_status IS
  'Provider refund/dispute lifecycle. Distinct from fulfillment status. Partial refund → manual_review_required.';

COMMENT ON COLUMN marketplace_bid_credit_purchases.consumed_before_reversal IS
  'Audit: amount_consumed on purchase grant at first economic reversal. Consumed Bids are never clawed back.';

INSERT INTO schema_migrations (version)
VALUES ('151_bid_credit_package_purchases')
ON CONFLICT (version) DO NOTHING;

COMMIT;
