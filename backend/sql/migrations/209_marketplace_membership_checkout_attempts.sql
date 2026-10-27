-- 209_marketplace_membership_checkout_attempts
-- Additive ledger of marketplace membership Stripe Checkout attempts (STARTER is never Stripe;
-- SILVER / PRO / ELITE / ANNUAL_BASIC / special offer plans are). One row per Checkout Session.
-- Purpose: at most ONE unresolved attempt per freelancer + purchasable plan (multi-tab / double click),
-- resumable open sessions, auditable history. Does NOT grant membership: the trusted
-- checkout.session.completed path (purchased_pending_start) stays the only grant.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_membership_checkout_attempts (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id TEXT NULL,
  amount_minor INTEGER NULL,
  currency TEXT NOT NULL DEFAULT 'JOD',
  resolution_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  CONSTRAINT mm_checkout_attempts_status_chk
    CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS mm_checkout_attempts_session_uidx
  ON marketplace_membership_checkout_attempts (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Canonical rule: one unresolved attempt per freelancer + plan.
CREATE UNIQUE INDEX IF NOT EXISTS mm_checkout_attempts_one_pending_uidx
  ON marketplace_membership_checkout_attempts (freelancer_user_id, marketplace_plan_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mm_checkout_attempts_user_status_idx
  ON marketplace_membership_checkout_attempts (freelancer_user_id, status, id DESC);

INSERT INTO schema_migrations (version)
VALUES ('209_marketplace_membership_checkout_attempts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
