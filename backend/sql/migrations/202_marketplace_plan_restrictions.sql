-- 202_marketplace_plan_restrictions
-- Additive plan-level marketplace moderation policy.
-- Does NOT copy restrictions onto subscribers. Does NOT touch wallets/KYC/Stripe/membership dates.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_plan_restrictions (
  id BIGSERIAL PRIMARY KEY,
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE CASCADE,
  restriction_type VARCHAR(64) NOT NULL DEFAULT 'ACCOUNT_REVIEW_HOLD',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  scopes TEXT[] NOT NULL DEFAULT ARRAY['ALL_MARKETPLACE']::TEXT[],
  internal_reason TEXT NOT NULL,
  internal_note TEXT NULL,
  created_by_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason TEXT NULL,
  metadata JSONB NULL,
  CONSTRAINT marketplace_plan_restrictions_type_chk
    CHECK (restriction_type IN (
      'ACCOUNT_REVIEW_HOLD',
      'MARKETPLACE_RESTRICTED',
      'CONTENT_REVIEW',
      'FULL_SUSPENSION'
    )),
  CONSTRAINT marketplace_plan_restrictions_status_chk
    CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT marketplace_plan_restrictions_reason_chk
    CHECK (char_length(btrim(internal_reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS mpr_plan_status_idx
  ON marketplace_plan_restrictions (marketplace_plan_id, status, starts_at DESC);

CREATE INDEX IF NOT EXISTS mpr_active_expires_idx
  ON marketplace_plan_restrictions (expires_at)
  WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;

-- At most one ACTIVE restriction per plan (policy row).
CREATE UNIQUE INDEX IF NOT EXISTS mpr_one_active_per_plan_uidx
  ON marketplace_plan_restrictions (marketplace_plan_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS marketplace_plan_restriction_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  plan_restriction_id BIGINT NULL REFERENCES marketplace_plan_restrictions(id) ON DELETE SET NULL,
  marketplace_plan_id BIGINT NULL REFERENCES marketplace_membership_plans(id) ON DELETE SET NULL,
  actor_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  reason TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mpr_audit_plan_idx
  ON marketplace_plan_restriction_audit_logs (marketplace_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mpr_audit_restriction_idx
  ON marketplace_plan_restriction_audit_logs (plan_restriction_id, created_at DESC);

ALTER TABLE order_freelancer_bids
  ADD COLUMN IF NOT EXISTS hold_plan_restriction_id BIGINT NULL
    REFERENCES marketplace_plan_restrictions(id) ON DELETE SET NULL;

ALTER TABLE freelancer_moderation_held_claims
  ADD COLUMN IF NOT EXISTS plan_restriction_id BIGINT NULL
    REFERENCES marketplace_plan_restrictions(id) ON DELETE SET NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS hold_plan_restriction_id BIGINT NULL
    REFERENCES marketplace_plan_restrictions(id) ON DELETE SET NULL;

COMMIT;
