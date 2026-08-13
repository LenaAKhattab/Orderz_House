-- 146: Marketplace Bid Credits Phase B1 — foundation + Work Token product deprecation (schema).
-- ADDITIVE ONLY. Does NOT drop Work Token tables/ledger/reservations/Phase 5 snapshots.
-- Does NOT enable any economy engine. Does NOT backfill historical applications.
-- Does NOT apply automatically — review then migrate explicitly AFTER 145.
--
-- Product decision: Freelancers use Bid Credits ("Bids"), not Work Tokens.
-- 1 normal real-order application = 1 Bid Credit (consumption wired in Phase B2).
--
-- Prerequisites: 144 applied. 145 (Article Level Model) should remain the prior pending file.

BEGIN;

-- =========================================================
-- Feature flag (independent of work_tokens_enabled)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN marketplace_economy_settings.bid_credits_enabled IS
  'Phase B1: Bid Credits engine master switch. Default OFF. Independent of work_tokens_enabled.';

-- =========================================================
-- Membership plan monthly Bid allowance (Admin-controlled)
-- =========================================================
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS monthly_bid_allowance INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_monthly_bid_allowance_chk;

ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_monthly_bid_allowance_chk
  CHECK (monthly_bid_allowance >= 0 AND monthly_bid_allowance <= 1000000);

COMMENT ON COLUMN marketplace_membership_plans.monthly_bid_allowance IS
  'Phase B1: Admin-controlled Bids unlocked progressively each subscription month. Not derived from included_tokens_per_cycle.';

-- Preferred catalog transition: stop advertising Work Token grants (do not convert 100/220/420/700).
UPDATE marketplace_membership_plans
SET
  included_tokens_per_cycle = 0,
  updated_at = NOW()
WHERE included_tokens_per_cycle <> 0;

-- =========================================================
-- Cycle snapshot of monthly Bid allowance (immutable for that cycle)
-- =========================================================
ALTER TABLE marketplace_membership_cycles
  ADD COLUMN IF NOT EXISTS monthly_bid_allowance_snapshot INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_membership_cycles
  DROP CONSTRAINT IF EXISTS marketplace_membership_cycles_monthly_bid_allowance_snapshot_chk;

ALTER TABLE marketplace_membership_cycles
  ADD CONSTRAINT marketplace_membership_cycles_monthly_bid_allowance_snapshot_chk
  CHECK (monthly_bid_allowance_snapshot >= 0 AND monthly_bid_allowance_snapshot <= 1000000);

COMMENT ON COLUMN marketplace_membership_cycles.monthly_bid_allowance_snapshot IS
  'Phase B1: Bid allowance snapshotted when the cycle is created/activated. Historical periods stay auditable.';

-- =========================================================
-- Bid Credit packages (pricing catalog only — no Stripe in B1)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_bid_credit_packages (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NULL,
  description_ar TEXT NULL,
  description_en TEXT NULL,
  bid_quantity INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_packages_qty_chk CHECK (bid_quantity > 0 AND bid_quantity <= 1000000),
  price_jod NUMERIC(12, 3) NOT NULL
    CONSTRAINT marketplace_bid_credit_packages_price_chk CHECK (price_jod >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_credit_packages_code_uidx UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_packages_active_sort_idx
  ON marketplace_bid_credit_packages (is_active, sort_order, id);

COMMENT ON TABLE marketplace_bid_credit_packages IS
  'Phase B1: Super Admin Bid Credit pricing catalog. No Stripe checkout in B1.';

-- =========================================================
-- Expiring Bid Credit grants (buckets) — FEFO-ready
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_bid_credit_grants (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  source_type VARCHAR(40) NOT NULL
    CHECK (source_type IN (
      'membership_daily_unlock',
      'admin_manual',
      'admin_adjustment'
    )),

  amount_granted INTEGER NOT NULL CHECK (amount_granted > 0),
  amount_consumed INTEGER NOT NULL DEFAULT 0 CHECK (amount_consumed >= 0),
  amount_expired INTEGER NOT NULL DEFAULT 0 CHECK (amount_expired >= 0),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  exhausted_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,

  -- Membership-derived linkage (nullable for admin manual)
  membership_id BIGINT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  cycle_id BIGINT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,
  distribution_month_id BIGINT NULL,

  -- Admin manual metadata
  reason TEXT NULL,
  internal_note TEXT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,

  -- Deterministic idempotency (no duplicate daily unlock / admin retry)
  idempotency_key VARCHAR(180) NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_bid_credit_grants_amounts_chk
    CHECK (amount_consumed + amount_expired <= amount_granted),
  CONSTRAINT marketplace_bid_credit_grants_idempotency_uidx UNIQUE (idempotency_key),
  CONSTRAINT marketplace_bid_credit_grants_expiry_order_chk
    CHECK (expires_at > granted_at)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_grants_freelancer_fefo_idx
  ON marketplace_bid_credit_grants (freelancer_user_id, expires_at ASC, id ASC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_grants_membership_idx
  ON marketplace_bid_credit_grants (membership_id)
  WHERE membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_grants_cycle_idx
  ON marketplace_bid_credit_grants (cycle_id)
  WHERE cycle_id IS NOT NULL;

COMMENT ON TABLE marketplace_bid_credit_grants IS
  'Phase B1: Expiring Bid Credit buckets. available = granted - consumed - expired. FEFO by expires_at.';

-- =========================================================
-- Immutable Bid Credit ledger
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_bid_credit_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  grant_id BIGINT NULL REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,

  event_type VARCHAR(60) NOT NULL
    CHECK (event_type IN (
      'MEMBERSHIP_BID_GRANT',
      'ADMIN_BID_GRANT',
      'ADMIN_BID_ADJUSTMENT',
      'APPLICATION_BID_CONSUME',
      'BID_EXPIRED'
    )),

  amount INTEGER NOT NULL CHECK (amount > 0),
  -- +1 credit available, -1 reduce available (consume/expire)
  direction SMALLINT NOT NULL CHECK (direction IN (-1, 1)),

  reference_type VARCHAR(80) NULL,
  reference_id VARCHAR(120) NULL,
  idempotency_key VARCHAR(180) NOT NULL,

  reason TEXT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_bid_credit_ledger_idempotency_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_ledger_freelancer_idx
  ON marketplace_bid_credit_ledger_entries (freelancer_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_ledger_grant_idx
  ON marketplace_bid_credit_ledger_entries (grant_id)
  WHERE grant_id IS NOT NULL;

COMMENT ON TABLE marketplace_bid_credit_ledger_entries IS
  'Phase B1: Immutable Bid Credit ledger. APPLICATION_BID_CONSUME reserved for Phase B2.';

-- =========================================================
-- Monthly distribution state (lazy + scheduler reconcile)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_membership_bid_distribution_months (
  id BIGSERIAL PRIMARY KEY,

  membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  cycle_id BIGINT NOT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Snapshots at month open (immutable for this row)
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,
  monthly_bid_allowance_snapshot INTEGER NOT NULL
    CHECK (monthly_bid_allowance_snapshot >= 0 AND monthly_bid_allowance_snapshot <= 1000000),

  window_starts_at TIMESTAMPTZ NOT NULL,
  window_ends_at TIMESTAMPTZ NOT NULL,
  day_count INTEGER NOT NULL CHECK (day_count >= 1 AND day_count <= 366),

  -- Membership-derived Bids expire here (usually paid_term_ends_at)
  membership_expires_at TIMESTAMPTZ NOT NULL,

  -- Last fully reconciled day index within [1..day_count]; 0 = nothing unlocked yet
  last_reconciled_day_index INTEGER NOT NULL DEFAULT 0
    CHECK (last_reconciled_day_index >= 0),

  total_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (total_unlocked >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ NULL,

  CONSTRAINT marketplace_membership_bid_distribution_months_window_chk
    CHECK (window_ends_at > window_starts_at),
  CONSTRAINT marketplace_membership_bid_distribution_months_day_idx_chk
    CHECK (last_reconciled_day_index <= day_count),
  CONSTRAINT marketplace_membership_bid_distribution_months_total_chk
    CHECK (total_unlocked <= monthly_bid_allowance_snapshot),
  CONSTRAINT marketplace_membership_bid_distribution_months_cycle_uidx UNIQUE (cycle_id)
);

CREATE INDEX IF NOT EXISTS marketplace_membership_bid_distribution_months_open_idx
  ON marketplace_membership_bid_distribution_months (status, window_ends_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS marketplace_membership_bid_distribution_months_freelancer_idx
  ON marketplace_membership_bid_distribution_months (freelancer_user_id, window_starts_at DESC);

COMMENT ON TABLE marketplace_membership_bid_distribution_months IS
  'Phase B1: Persistent monthly Bid distribution state. floor(N*k/D) unlocks; missed days catch up on reconcile.';

-- FK from grants → distribution months (added after table exists)
ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_distribution_month_fk;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_distribution_month_fk
  FOREIGN KEY (distribution_month_id)
  REFERENCES marketplace_membership_bid_distribution_months(id)
  ON DELETE RESTRICT;

INSERT INTO schema_migrations (version)
VALUES ('146_marketplace_bid_credits_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
