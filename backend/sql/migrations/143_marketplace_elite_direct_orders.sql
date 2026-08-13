-- 143: Marketplace Elite Direct Orders (Phase 8 v1) — ADDITIVE ONLY.
-- Private exclusive timed offer to ONE Elite Freelancer.
--
-- Adds:
--   cycle Elite entitlement counters (allowed/reserved/consumed) DISTINCT from Priority Bid
--   elite_direct_order_entitlement_events (reserve/consume/release idempotent ledger)
--   elite_direct_offers (offer lifecycle + immutable snapshots)
--
-- Does NOT:
--   enable elite_engine_enabled
--   backfill historical Elite offers
--   convert admin/partner/fixed-take assignments into Elite
--   move Work Tokens / Priority Bid uses
--   create assignments

BEGIN;

-- =========================================================
-- Cycle entitlement counters (DISTINCT from Priority Bid)
-- =========================================================
ALTER TABLE marketplace_membership_cycles
  ADD COLUMN IF NOT EXISTS elite_direct_orders_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (elite_direct_orders_allowed >= 0),
  ADD COLUMN IF NOT EXISTS elite_direct_orders_reserved INTEGER NOT NULL DEFAULT 0
    CHECK (elite_direct_orders_reserved >= 0),
  ADD COLUMN IF NOT EXISTS elite_direct_orders_consumed INTEGER NOT NULL DEFAULT 0
    CHECK (elite_direct_orders_consumed >= 0);

ALTER TABLE marketplace_membership_cycles
  DROP CONSTRAINT IF EXISTS marketplace_membership_cycles_elite_capacity_chk;

ALTER TABLE marketplace_membership_cycles
  ADD CONSTRAINT marketplace_membership_cycles_elite_capacity_chk
  CHECK (elite_direct_orders_reserved + elite_direct_orders_consumed <= elite_direct_orders_allowed);

COMMENT ON COLUMN marketplace_membership_cycles.elite_direct_orders_allowed IS
  'Phase 8: Elite Direct Order entitlement allowance for this cycle (base + carry-forward). Distinct from Priority Bid uses.';
COMMENT ON COLUMN marketplace_membership_cycles.elite_direct_orders_reserved IS
  'Phase 8: Elite offers currently PENDING (reserved, not yet consumed).';
COMMENT ON COLUMN marketplace_membership_cycles.elite_direct_orders_consumed IS
  'Phase 8: Elite offers successfully ACCEPTED (consumed).';

-- =========================================================
-- Entitlement event ledger
-- =========================================================
CREATE TABLE IF NOT EXISTS elite_direct_order_entitlement_events (
  id BIGSERIAL PRIMARY KEY,

  cycle_id BIGINT NOT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,
  membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  event_type VARCHAR(24) NOT NULL
    CHECK (event_type IN ('reserve', 'consume', 'release')),

  delta_reserved INTEGER NOT NULL DEFAULT 0,
  delta_consumed INTEGER NOT NULL DEFAULT 0,

  reference_type VARCHAR(64) NOT NULL,
  reference_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(191) NOT NULL,

  related_event_id BIGINT NULL REFERENCES elite_direct_order_entitlement_events(id) ON DELETE RESTRICT,

  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(160) NULL,
  metadata_json JSONB NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT elite_edo_entitlement_events_idempotency_uidx UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS elite_edo_entitlement_events_cycle_ref_type_uidx
  ON elite_direct_order_entitlement_events (cycle_id, reference_type, reference_id, event_type);

CREATE INDEX IF NOT EXISTS elite_edo_entitlement_events_freelancer_idx
  ON elite_direct_order_entitlement_events (freelancer_user_id, created_at DESC);

COMMENT ON TABLE elite_direct_order_entitlement_events IS
  'Phase 8: Elite Direct Order entitlement reserve/consume/release ledger. Not Work Tokens. Not Priority Bid uses.';

-- =========================================================
-- Elite Direct Offers
-- =========================================================
CREATE TABLE IF NOT EXISTS elite_direct_offers (
  id BIGSERIAL PRIMARY KEY,

  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,

  creator_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  creator_role VARCHAR(40) NOT NULL,
  creation_source VARCHAR(64) NOT NULL DEFAULT 'client',

  target_freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  target_cycle_id BIGINT NOT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,

  tier_code_snapshot VARCHAR(40) NOT NULL,
  elite_capability_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
  entitlement_quantity INTEGER NOT NULL DEFAULT 1 CHECK (entitlement_quantity >= 1),

  reserve_event_id BIGINT NULL REFERENCES elite_direct_order_entitlement_events(id) ON DELETE SET NULL,
  consume_event_id BIGINT NULL REFERENCES elite_direct_order_entitlement_events(id) ON DELETE SET NULL,
  release_event_id BIGINT NULL REFERENCES elite_direct_order_entitlement_events(id) ON DELETE SET NULL,

  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'accepted',
      'declined',
      'expired',
      'cancelled',
      'ineligible'
    )),

  reason_code VARCHAR(80) NULL,

  duration_minutes_snapshot INTEGER NOT NULL CHECK (duration_minutes_snapshot >= 1),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  declined_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,

  selected_bid_id BIGINT NULL,
  assignment_reference VARCHAR(128) NULL,

  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata_json JSONB NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT elite_direct_offers_expires_after_offered_chk
    CHECK (expires_at > offered_at)
);

-- One active PENDING offer per Order
CREATE UNIQUE INDEX IF NOT EXISTS elite_direct_offers_one_pending_per_order_uidx
  ON elite_direct_offers (order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS elite_direct_offers_target_pending_idx
  ON elite_direct_offers (target_freelancer_user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS elite_direct_offers_due_expiry_idx
  ON elite_direct_offers (expires_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS elite_direct_offers_order_history_idx
  ON elite_direct_offers (order_id, created_at DESC);

COMMENT ON TABLE elite_direct_offers IS
  'Phase 8: private exclusive timed Elite Direct Offer. One PENDING offer per Order. Not Fair/Priority selection.';

INSERT INTO schema_migrations (version)
VALUES ('143_marketplace_elite_direct_orders')
ON CONFLICT (version) DO NOTHING;

COMMIT;
