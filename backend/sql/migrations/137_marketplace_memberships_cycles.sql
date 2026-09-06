-- 137: Marketplace Memberships + Cycles + Priority Bid usage accounting — ADDITIVE ONLY.
-- Phase 3 foundation. Empty tables. No backfill. No Stripe. No wallet. No auctions.
-- Does NOT modify 134/135/136 or legacy freelancer_subscriptions / plans.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.

BEGIN;

-- =========================================================
-- Memberships (paid Marketplace Membership relationship)
-- Independent of freelancer_subscriptions / plans.
-- =========================================================
CREATE TABLE IF NOT EXISTS freelancer_marketplace_memberships (
  id BIGSERIAL PRIMARY KEY,

  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,

  -- At most one current membership per freelancer (history retained)
  is_current BOOLEAN NOT NULL DEFAULT FALSE,

  status VARCHAR(40) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'active',
        'cancel_at_period_end',
        'expired',
        'cancelled',
        'suspended'
      )
    ),

  -- How the membership was authorized (execution engines later)
  source VARCHAR(40) NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'admin', 'stripe', 'cash', 'manual')),

  -- Calendar anniversary day (1–31) for cycle boundaries
  cycle_anchor_day SMALLINT NOT NULL
    CHECK (cycle_anchor_day >= 1 AND cycle_anchor_day <= 31),

  started_at TIMESTAMPTZ NULL,
  paid_term_starts_at TIMESTAMPTZ NULL,
  paid_term_ends_at TIMESTAMPTZ NULL,

  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,

  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,

  -- Nullable Stripe cache for future recurring integration (unused in Phase 3)
  stripe_subscription_id VARCHAR(255) NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_price_id VARCHAR(255) NULL,

  notes TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT freelancer_marketplace_memberships_term_order
    CHECK (
      paid_term_starts_at IS NULL
      OR paid_term_ends_at IS NULL
      OR paid_term_ends_at > paid_term_starts_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS freelancer_marketplace_memberships_one_current_uidx
  ON freelancer_marketplace_memberships (freelancer_user_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS freelancer_marketplace_memberships_freelancer_idx
  ON freelancer_marketplace_memberships (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS freelancer_marketplace_memberships_status_idx
  ON freelancer_marketplace_memberships (status, paid_term_ends_at);

CREATE INDEX IF NOT EXISTS freelancer_marketplace_memberships_plan_idx
  ON freelancer_marketplace_memberships (marketplace_plan_id);

COMMENT ON TABLE freelancer_marketplace_memberships IS
  'Marketplace Membership (باقات العمل) paid term relationship. Independent of freelancer_subscriptions. Phase 3: accounting only.';

-- =========================================================
-- Monthly benefit cycles (anniversary-based)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_membership_cycles (
  id BIGSERIAL PRIMARY KEY,

  membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,

  cycle_number INT NOT NULL CHECK (cycle_number >= 1),

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'closed')),

  -- Snapshot of plan at cycle creation/activation (immutable for this cycle)
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,
  priority_bid_uses_allowed INT NOT NULL DEFAULT 0
    CHECK (priority_bid_uses_allowed >= 0 AND priority_bid_uses_allowed <= 1000),
  included_tokens_allowed INT NOT NULL DEFAULT 0
    CHECK (included_tokens_allowed >= 0),

  -- Aggregate counters (ledger is source of truth for adjustments)
  priority_bid_uses_consumed INT NOT NULL DEFAULT 0
    CHECK (priority_bid_uses_consumed >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,

  CONSTRAINT marketplace_membership_cycles_time_order
    CHECK (ends_at > starts_at),
  CONSTRAINT marketplace_membership_cycles_consumed_lte_allowed
    CHECK (priority_bid_uses_consumed <= priority_bid_uses_allowed)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_cycles_membership_number_uidx
  ON marketplace_membership_cycles (membership_id, cycle_number);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_cycles_one_active_uidx
  ON marketplace_membership_cycles (membership_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketplace_membership_cycles_window_idx
  ON marketplace_membership_cycles (status, ends_at);

COMMENT ON TABLE marketplace_membership_cycles IS
  'Monthly benefit cycles for Marketplace Memberships. Snapshot Priority Bid allowance at cycle start. Lazy creation + reconciliation.';

-- =========================================================
-- Auditable Priority Bid usage ledger (per cycle)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_membership_cycle_usage (
  id BIGSERIAL PRIMARY KEY,

  cycle_id BIGINT NOT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,
  membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN ('consumed', 'returned', 'admin_adjustment')),

  delta INT NOT NULL
    CHECK (delta <> 0),

  -- Idempotency for future auction / cancel retries
  reference_type VARCHAR(80) NOT NULL,
  reference_id VARCHAR(120) NOT NULL,

  reason TEXT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_membership_cycle_usage_delta_sign
    CHECK (
      (event_type = 'consumed' AND delta > 0)
      OR (event_type = 'returned' AND delta < 0)
      OR (event_type = 'admin_adjustment')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_cycle_usage_idempotency_uidx
  ON marketplace_membership_cycle_usage (reference_type, reference_id, event_type);

CREATE INDEX IF NOT EXISTS marketplace_membership_cycle_usage_cycle_idx
  ON marketplace_membership_cycle_usage (cycle_id, created_at DESC);

COMMENT ON TABLE marketplace_membership_cycle_usage IS
  'Auditable Priority Bid usage events. Consume/return must be idempotent. Not wired to auctions in Phase 3.';

-- =========================================================
-- Domain audit log
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_membership_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  membership_id BIGINT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE SET NULL,
  cycle_id BIGINT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE SET NULL,
  freelancer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  detail_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_membership_audit_logs_membership_idx
  ON marketplace_membership_audit_logs (membership_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_membership_audit_logs_action_idx
  ON marketplace_membership_audit_logs (action, created_at DESC);

COMMENT ON TABLE marketplace_membership_audit_logs IS
  'Audit trail for Marketplace Membership / cycle / Priority Bid usage lifecycle events.';

INSERT INTO schema_migrations (version) VALUES ('137_marketplace_memberships_cycles')
ON CONFLICT (version) DO NOTHING;

COMMIT;
