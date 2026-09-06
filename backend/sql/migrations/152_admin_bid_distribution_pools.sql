-- Migration 152: Super Admin Bid Distribution Pool (Phase D1)
-- Additive only. Does NOT create pools, distribute Bids, enable Bid Credits,
-- mutate balances, or touch Work Tokens.
-- DO NOT APPLY until owner review.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extend Bid grant source vocabulary
-- ---------------------------------------------------------------------------
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
      'package_purchase',
      'admin_distribution_pool'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_grants_source_type_check
  ON marketplace_bid_credit_grants IS
  'Phase D1: added admin_distribution_pool for Super Admin Bid Pool allocations.';

-- ---------------------------------------------------------------------------
-- Extend Bid ledger event vocabulary
-- ---------------------------------------------------------------------------
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
      'BID_PACKAGE_PURCHASE_REVOKE',
      'ADMIN_DISTRIBUTION_POOL_GRANT'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  ON marketplace_bid_credit_ledger_entries IS
  'Phase D1: added ADMIN_DISTRIBUTION_POOL_GRANT.';

-- ---------------------------------------------------------------------------
-- Pool inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_bid_distribution_pools (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  budget_jod NUMERIC(14, 3) NOT NULL
    CONSTRAINT marketplace_bid_distribution_pools_budget_chk CHECK (budget_jod > 0),
  bid_unit_price_jod NUMERIC(14, 3) NOT NULL
    CONSTRAINT marketplace_bid_distribution_pools_unit_chk CHECK (bid_unit_price_jod > 0),
  total_bids INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_pools_total_chk CHECK (total_bids >= 0),
  available_bids INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_pools_available_chk CHECK (available_bids >= 0),
  monetary_remainder_jod NUMERIC(14, 3) NOT NULL DEFAULT 0
    CONSTRAINT marketplace_bid_distribution_pools_remainder_chk CHECK (monetary_remainder_jod >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CONSTRAINT marketplace_bid_distribution_pools_status_chk
      CHECK (status IN ('active', 'closed')),
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_distribution_pools_available_lte_total_chk
    CHECK (available_bids <= total_bids)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_distribution_pools_status_idx
  ON marketplace_bid_distribution_pools (status, created_at DESC);

COMMENT ON TABLE marketplace_bid_distribution_pools IS
  'Phase D1: Super Admin Bid Distribution Pool. total_bids = floor(budget/unit). available_bids never exceeds total; returns increase available only.';

COMMENT ON COLUMN marketplace_bid_distribution_pools.total_bids IS
  'SERVER-CALCULATED integer Bids from budget_jod / bid_unit_price_jod (floor). Client totals are not authoritative.';

COMMENT ON COLUMN marketplace_bid_distribution_pools.monetary_remainder_jod IS
  'budget_jod - (total_bids * bid_unit_price_jod). Never minted as fractional Bids.';

-- ---------------------------------------------------------------------------
-- Distribution batches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_bid_distribution_batches (
  id BIGSERIAL PRIMARY KEY,
  pool_id BIGINT NOT NULL
    REFERENCES marketplace_bid_distribution_pools(id) ON DELETE RESTRICT,
  distribution_mode VARCHAR(20) NOT NULL
    CONSTRAINT marketplace_bid_distribution_batches_mode_chk
      CHECK (distribution_mode IN ('manual', 'random')),
  bids_per_freelancer INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_batches_bpf_chk CHECK (bids_per_freelancer >= 1),
  recipient_count INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_batches_rc_chk CHECK (recipient_count >= 1),
  total_allocated INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_batches_total_chk CHECK (total_allocated >= 1),
  expiration_mode VARCHAR(20) NOT NULL
    CONSTRAINT marketplace_bid_distribution_batches_exp_mode_chk
      CHECK (expiration_mode IN ('days', 'weeks', 'exact_datetime')),
  expiration_value INTEGER NULL
    CONSTRAINT marketplace_bid_distribution_batches_exp_val_chk
      CHECK (expiration_value IS NULL OR expiration_value >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_distribution_batches_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT marketplace_bid_distribution_batches_math_chk
    CHECK (total_allocated = bids_per_freelancer * recipient_count)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_distribution_batches_pool_idx
  ON marketplace_bid_distribution_batches (pool_id, created_at DESC);

COMMENT ON TABLE marketplace_bid_distribution_batches IS
  'Phase D1: Atomic all-or-nothing distribution batch from a pool (manual or random mode).';

-- ---------------------------------------------------------------------------
-- Per-Freelancer allocations (link to Bid Credit grants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_bid_distribution_allocations (
  id BIGSERIAL PRIMARY KEY,
  pool_id BIGINT NOT NULL
    REFERENCES marketplace_bid_distribution_pools(id) ON DELETE RESTRICT,
  batch_id BIGINT NOT NULL
    REFERENCES marketplace_bid_distribution_batches(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,
  bid_credit_grant_id BIGINT NOT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  allocated_bids INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_allocations_alloc_chk CHECK (allocated_bids >= 1),
  returned_bids INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_bid_distribution_allocations_ret_chk CHECK (returned_bids >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CONSTRAINT marketplace_bid_distribution_allocations_status_chk
      CHECK (status IN ('active', 'returned')),
  returned_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_distribution_allocations_batch_fl_uidx
    UNIQUE (batch_id, freelancer_user_id),
  CONSTRAINT marketplace_bid_distribution_allocations_grant_uidx
    UNIQUE (bid_credit_grant_id),
  CONSTRAINT marketplace_bid_distribution_allocations_return_lte_alloc_chk
    CHECK (returned_bids <= allocated_bids)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_distribution_allocations_pool_idx
  ON marketplace_bid_distribution_allocations (pool_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_bid_distribution_allocations_expiry_idx
  ON marketplace_bid_distribution_allocations (expires_at, status)
  WHERE status = 'active';

COMMENT ON TABLE marketplace_bid_distribution_allocations IS
  'Phase D1: Links pool batch → Freelancer → Bid Credit grant. Unused remainder returns to the same pool on expiry.';

-- ---------------------------------------------------------------------------
-- Pool-level audit events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_bid_distribution_pool_events (
  id BIGSERIAL PRIMARY KEY,
  pool_id BIGINT NOT NULL
    REFERENCES marketplace_bid_distribution_pools(id) ON DELETE RESTRICT,
  event_type VARCHAR(40) NOT NULL
    CONSTRAINT marketplace_bid_distribution_pool_events_type_chk
      CHECK (event_type IN ('POOL_CREATED', 'ALLOCATED', 'RETURNED_UNUSED')),
  amount_bids INTEGER NOT NULL
    CONSTRAINT marketplace_bid_distribution_pool_events_amt_chk CHECK (amount_bids >= 0),
  batch_id BIGINT NULL
    REFERENCES marketplace_bid_distribution_batches(id) ON DELETE SET NULL,
  allocation_id BIGINT NULL
    REFERENCES marketplace_bid_distribution_allocations(id) ON DELETE SET NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_distribution_pool_events_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_distribution_pool_events_pool_idx
  ON marketplace_bid_distribution_pool_events (pool_id, created_at DESC);

COMMENT ON TABLE marketplace_bid_distribution_pool_events IS
  'Phase D1: Immutable pool audit — create / allocate / return unused. Returns never increase total_bids.';

INSERT INTO schema_migrations (version)
VALUES ('152_admin_bid_distribution_pools')
ON CONFLICT (version) DO NOTHING;

COMMIT;
