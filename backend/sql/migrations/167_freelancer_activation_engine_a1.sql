-- 167: Freelancer Activation Engine Phase A1 — settings + trial foundation.
-- Additive only. Engine flag DEFAULT FALSE. No Bid grants, no membership mutation,
-- no backfill, no payment/Stripe/orders/Pantry/Bildazo changes.
-- Do NOT apply to production from this phase.

BEGIN;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_trial_duration_days INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_trial_bids INTEGER NOT NULL DEFAULT 20;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_daily_bid_limit INTEGER NOT NULL DEFAULT 2;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_successful_work_cap INTEGER NOT NULL DEFAULT 2;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_requires_training BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_requires_verification BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_silver_plan_code VARCHAR(32) NOT NULL DEFAULT 'silver';

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_archive_after_days INTEGER NOT NULL DEFAULT 45;

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_duration_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_duration_chk
  CHECK (freelancer_activation_trial_duration_days >= 1 AND freelancer_activation_trial_duration_days <= 365);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_bids_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_bids_chk
  CHECK (freelancer_activation_trial_bids >= 0 AND freelancer_activation_trial_bids <= 100000);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_daily_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_daily_chk
  CHECK (freelancer_activation_daily_bid_limit >= 0 AND freelancer_activation_daily_bid_limit <= 1000);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_work_cap_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_work_cap_chk
  CHECK (freelancer_activation_successful_work_cap >= 0 AND freelancer_activation_successful_work_cap <= 1000);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_archive_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_archive_chk
  CHECK (freelancer_activation_archive_after_days >= 1 AND freelancer_activation_archive_after_days <= 3650);

COMMENT ON COLUMN marketplace_economy_settings.freelancer_activation_engine_enabled IS
  'A1: Freelancer Activation Engine master flag. Default FALSE — no apply/membership behavior change.';
COMMENT ON COLUMN marketplace_economy_settings.freelancer_activation_silver_plan_code IS
  'A1: marketplace_membership_plans.tier_code for later Silver conversion (default silver).';

CREATE TABLE IF NOT EXISTS freelancer_activation_trials (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(40) NOT NULL DEFAULT 'not_started'
    CONSTRAINT freelancer_activation_trials_status_chk
    CHECK (status IN (
      'not_started',
      'eligible',
      'trial_active',
      'trial_expired_high_intent',
      'dormant',
      'final_reactivation_window',
      'archived',
      'paid_active'
    )),
  source_membership_id BIGINT NULL
    REFERENCES freelancer_marketplace_memberships(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  trial_bid_limit INTEGER NOT NULL DEFAULT 20
    CONSTRAINT freelancer_activation_trials_bid_limit_chk CHECK (trial_bid_limit >= 0),
  daily_bid_limit INTEGER NOT NULL DEFAULT 2
    CONSTRAINT freelancer_activation_trials_daily_limit_chk CHECK (daily_bid_limit >= 0),
  trial_duration_days INTEGER NOT NULL DEFAULT 10
    CONSTRAINT freelancer_activation_trials_duration_chk CHECK (trial_duration_days >= 1),
  successful_work_cap INTEGER NOT NULL DEFAULT 2
    CONSTRAINT freelancer_activation_trials_work_cap_chk CHECK (successful_work_cap >= 0),
  accepted_work_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT freelancer_activation_trials_accepted_chk CHECK (accepted_work_count >= 0),
  published_work_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT freelancer_activation_trials_published_chk CHECK (published_work_count >= 0),
  first_bid_at TIMESTAMPTZ NULL,
  first_win_at TIMESTAMPTZ NULL,
  first_accepted_at TIMESTAMPTZ NULL,
  first_published_at TIMESTAMPTZ NULL,
  silver_cta_first_shown_at TIMESTAMPTZ NULL,
  silver_paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_activation_trials_user_uidx UNIQUE (freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS freelancer_activation_trials_status_idx
  ON freelancer_activation_trials (status, updated_at DESC);

COMMENT ON TABLE freelancer_activation_trials IS
  'A1: one Activation Engine trial record per freelancer. Does not grant Bids.';

CREATE TABLE IF NOT EXISTS freelancer_activation_events (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trial_id BIGINT NULL REFERENCES freelancer_activation_trials(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS freelancer_activation_events_freelancer_idx
  ON freelancer_activation_events (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS freelancer_activation_events_trial_idx
  ON freelancer_activation_events (trial_id, created_at DESC)
  WHERE trial_id IS NOT NULL;

COMMENT ON TABLE freelancer_activation_events IS
  'A1: append-only Activation Engine events. Not a Bid or payment ledger.';

INSERT INTO schema_migrations (version)
VALUES ('167_freelancer_activation_engine_a1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
