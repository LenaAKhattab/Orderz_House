-- 187: Legacy Freelancer Shared Invite Link (Fast Track)
-- Additive only. No Stripe/wallet/payout/ledger changes. No db push/reset.

BEGIN;

CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug VARCHAR(120) NOT NULL,
  secure_token_hash TEXT NOT NULL,
  created_by_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  default_plan_id BIGINT NULL REFERENCES plans(id) ON DELETE SET NULL,
  default_plan_code VARCHAR(80) NOT NULL DEFAULT 'free',
  default_trust_level VARCHAR(32) NOT NULL DEFAULT 'APPROVED'
    CONSTRAINT lfic_trust_chk CHECK (default_trust_level IN ('APPROVED', 'TRUSTED')),
  default_category_id BIGINT NULL,
  max_redemptions INTEGER NOT NULL
    CONSTRAINT lfic_max_redemptions_chk CHECK (max_redemptions >= 1),
  used_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT lfic_used_count_chk CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT lfic_used_lte_max_chk CHECK (used_count <= max_redemptions)
);

CREATE UNIQUE INDEX IF NOT EXISTS lfic_slug_uidx
  ON legacy_freelancer_invite_campaigns (slug);

CREATE INDEX IF NOT EXISTS lfic_active_expires_idx
  ON legacy_freelancer_invite_campaigns (is_active, expires_at);

CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_redemptions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_masked TEXT NOT NULL,
  phone_masked TEXT NULL,
  identity_last4 VARCHAR(4) NULL,
  internal_reference TEXT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  metadata JSONB NULL,
  CONSTRAINT lfir_user_uidx UNIQUE (user_id),
  CONSTRAINT lfir_campaign_user_uidx UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS lfir_campaign_idx
  ON legacy_freelancer_invite_redemptions (campaign_id, redeemed_at DESC);

CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  actor_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  campaign_id BIGINT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE SET NULL,
  target_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  detail JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lfia_action_idx
  ON legacy_freelancer_invite_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS lfia_campaign_idx
  ON legacy_freelancer_invite_audit_logs (campaign_id, created_at DESC);

-- Freelancer legacy profile flags on users (additive)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_source VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS legacy_invite_campaign_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS identity_verification_source VARCHAR(48) NULL,
  ADD COLUMN IF NOT EXISTS training_waiver_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS final_exam_waiver_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS legacy_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS legacy_verified_by_admin_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_onboarding_source_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_onboarding_source_chk
      CHECK (
        onboarding_source IS NULL
        OR onboarding_source IN ('NORMAL_SIGNUP', 'LEGACY_INVITE')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_identity_verification_source_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_identity_verification_source_chk
      CHECK (
        identity_verification_source IS NULL
        OR identity_verification_source IN ('ONLINE_REVIEW', 'COMPANY_OFFLINE_VERIFIED')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_legacy_campaign_idx
  ON users (legacy_invite_campaign_id)
  WHERE legacy_invite_campaign_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_legacy_invite_campaign_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_legacy_invite_campaign_fk
      FOREIGN KEY (legacy_invite_campaign_id)
      REFERENCES legacy_freelancer_invite_campaigns(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_legacy_verified_by_admin_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_legacy_verified_by_admin_fk
      FOREIGN KEY (legacy_verified_by_admin_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE legacy_freelancer_invite_campaigns IS
  'Shared invite campaigns for offline-verified company freelancers (one link, limited seats).';
COMMENT ON TABLE legacy_freelancer_invite_redemptions IS
  'Atomic redemptions of shared legacy freelancer invite campaigns.';

INSERT INTO schema_migrations (version)
VALUES ('187_legacy_freelancer_shared_invite')
ON CONFLICT (version) DO NOTHING;

COMMIT;
