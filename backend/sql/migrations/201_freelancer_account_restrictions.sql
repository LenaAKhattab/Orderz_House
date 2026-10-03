-- 201_freelancer_account_restrictions
-- Additive Super Admin marketplace moderation / review-hold layer.
-- Does NOT touch users.is_active, wallets, KYC, membership dates, or Stripe.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_account_restrictions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction_type VARCHAR(64) NOT NULL,
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
  CONSTRAINT freelancer_account_restrictions_type_chk
    CHECK (restriction_type IN (
      'ACCOUNT_REVIEW_HOLD',
      'MARKETPLACE_RESTRICTED',
      'CONTENT_REVIEW',
      'FULL_SUSPENSION'
    )),
  CONSTRAINT freelancer_account_restrictions_status_chk
    CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT freelancer_account_restrictions_reason_chk
    CHECK (char_length(btrim(internal_reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS far_user_status_idx
  ON freelancer_account_restrictions (user_id, status, starts_at DESC);

CREATE INDEX IF NOT EXISTS far_active_expires_idx
  ON freelancer_account_restrictions (expires_at)
  WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS freelancer_account_restriction_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  restriction_id BIGINT NULL REFERENCES freelancer_account_restrictions(id) ON DELETE SET NULL,
  actor_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(80) NOT NULL,
  related_entity_type VARCHAR(64) NULL,
  related_entity_id BIGINT NULL,
  reason TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS far_audit_target_idx
  ON freelancer_account_restriction_audit_logs (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS far_audit_restriction_idx
  ON freelancer_account_restriction_audit_logs (restriction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS far_audit_action_idx
  ON freelancer_account_restriction_audit_logs (action, created_at DESC);

ALTER TABLE order_freelancer_bids
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(40) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS hold_restriction_id BIGINT NULL
    REFERENCES freelancer_account_restrictions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_held_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS moderation_released_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS bid_reservation_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_freelancer_bids_moderation_status_chk'
  ) THEN
    ALTER TABLE order_freelancer_bids
      ADD CONSTRAINT order_freelancer_bids_moderation_status_chk
      CHECK (moderation_status IN (
        'published',
        'held',
        'released',
        'rejected_from_review',
        'expired_without_publish'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_freelancer_bids_moderation_idx
  ON order_freelancer_bids (order_id, moderation_status);

CREATE TABLE IF NOT EXISTS freelancer_moderation_held_claims (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction_id BIGINT NULL REFERENCES freelancer_account_restrictions(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'held',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  resolve_action VARCHAR(40) NULL,
  metadata JSONB NULL,
  CONSTRAINT freelancer_moderation_held_claims_status_chk
    CHECK (status IN ('held', 'rejected', 'expired', 'released_without_assign')),
  CONSTRAINT freelancer_moderation_held_claims_unique_open
    UNIQUE (order_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS fmhc_freelancer_idx
  ON freelancer_moderation_held_claims (freelancer_user_id, status, created_at DESC);

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(40) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS hold_restriction_id BIGINT NULL
    REFERENCES freelancer_account_restrictions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_held_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_applications_moderation_status_chk'
  ) THEN
    ALTER TABLE marketplace_article_applications
      ADD CONSTRAINT marketplace_article_applications_moderation_status_chk
      CHECK (moderation_status IN (
        'published',
        'held',
        'released',
        'rejected_from_review',
        'expired_without_publish'
      ));
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

COMMENT ON TABLE freelancer_account_restrictions IS
  'Super Admin marketplace moderation restrictions (independent of users.is_active).';

INSERT INTO schema_migrations (version)
VALUES ('201_freelancer_account_restrictions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
