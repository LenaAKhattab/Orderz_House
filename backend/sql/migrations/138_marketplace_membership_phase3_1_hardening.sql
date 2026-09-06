-- 138: Marketplace Membership Phase 3.1 hardening — ADDITIVE ONLY.
-- Tables are empty in Production at apply time (Phase 3 never enrolled users).
-- Does NOT edit 134/135/136/137. No backfill. No economy flag flips. No Stripe.
-- Do NOT apply from agent tasks until review approval.

BEGIN;

-- =========================================================
-- 1) Membership status: add superseded + status/is_current invariant
-- =========================================================
ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_status_check;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_status_check
  CHECK (
    status IN (
      'pending',
      'active',
      'cancel_at_period_end',
      'suspended',
      'expired',
      'cancelled',
      'superseded'
    )
  );

-- Terminal / historical statuses can never be current.
-- Current membership may only be pending|active|cancel_at_period_end|suspended.
ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_current_status_consistency;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  CHECK (
    (
      is_current = TRUE
      AND status IN ('pending', 'active', 'cancel_at_period_end', 'suspended')
    )
    OR (
      is_current = FALSE
    )
  );

COMMENT ON CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  ON freelancer_marketplace_memberships IS
  'Phase 3.1: is_current=TRUE only for pending/active/cancel_at_period_end/suspended. Terminal statuses (expired/cancelled/superseded) must be is_current=FALSE.';

-- =========================================================
-- 2) Priority Bid usage idempotency scoped to cycle
-- =========================================================
DROP INDEX IF EXISTS marketplace_membership_cycle_usage_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_cycle_usage_cycle_idempotency_uidx
  ON marketplace_membership_cycle_usage (cycle_id, reference_type, reference_id, event_type);

-- Explicit consume→return linkage (nullable; required for returned events by service)
ALTER TABLE marketplace_membership_cycle_usage
  ADD COLUMN IF NOT EXISTS related_usage_id BIGINT NULL
    REFERENCES marketplace_membership_cycle_usage(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS marketplace_membership_cycle_usage_related_idx
  ON marketplace_membership_cycle_usage (related_usage_id)
  WHERE related_usage_id IS NOT NULL;

-- At most one RETURN linked to a given CONSUME row
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_cycle_usage_one_return_per_consume_uidx
  ON marketplace_membership_cycle_usage (related_usage_id)
  WHERE event_type = 'returned' AND related_usage_id IS NOT NULL;

COMMENT ON COLUMN marketplace_membership_cycle_usage.related_usage_id IS
  'For returned events: points to the original consumed usage row. Enforces one return per consume.';

COMMENT ON INDEX marketplace_membership_cycle_usage_cycle_idempotency_uidx IS
  'Phase 3.1: usage idempotency is per-cycle, not global across memberships.';

INSERT INTO schema_migrations (version) VALUES ('138_marketplace_membership_phase3_1_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
