-- 169: Freelancer Activation Engine Phase A3 — campaigns, waves, budget ledger.
-- Additive only. Does not enable engines. Does not mutate 167/168.
-- Does not auto-create articles, reserve/spend budget, or change apply/settlement.
-- Do NOT apply to production from this phase.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_activation_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    CONSTRAINT freelancer_activation_campaigns_status_chk
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  total_budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  reserved_budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  used_budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  article_total_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 1.000,
  freelancer_share_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.500,
  company_share_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.300,
  reviewer_share_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.200,
  trial_bid_limit INTEGER NOT NULL DEFAULT 20,
  trial_duration_days INTEGER NOT NULL DEFAULT 10,
  daily_bid_limit INTEGER NOT NULL DEFAULT 2,
  minimum_bidders_per_article INTEGER NOT NULL DEFAULT 10,
  max_trial_wins INTEGER NOT NULL DEFAULT 2,
  daily_article_budget_jod NUMERIC(12, 3) NULL,
  max_daily_articles INTEGER NULL,
  verification_required BOOLEAN NOT NULL DEFAULT TRUE,
  training_required BOOLEAN NOT NULL DEFAULT TRUE,
  auto_publish_to_bildazo BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_stop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pause_new_assignments BOOLEAN NOT NULL DEFAULT FALSE,
  silver_plan_code VARCHAR(32) NOT NULL DEFAULT 'silver',
  silver_price_jod NUMERIC(12, 3) NOT NULL DEFAULT 19.000,
  work_inventory_percentage INTEGER NULL,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_activation_campaigns_budget_nonneg_chk
    CHECK (
      total_budget_jod >= 0
      AND reserved_budget_jod >= 0
      AND used_budget_jod >= 0
      AND reserved_budget_jod + used_budget_jod <= total_budget_jod
    ),
  CONSTRAINT freelancer_activation_campaigns_shares_nonneg_chk
    CHECK (
      article_total_value_jod >= 0
      AND freelancer_share_jod >= 0
      AND company_share_jod >= 0
      AND reviewer_share_jod >= 0
      AND silver_price_jod >= 0
    ),
  CONSTRAINT freelancer_activation_campaigns_limits_chk
    CHECK (
      trial_bid_limit >= 0 AND trial_bid_limit <= 100000
      AND trial_duration_days >= 1 AND trial_duration_days <= 365
      AND daily_bid_limit >= 0 AND daily_bid_limit <= 1000
      AND minimum_bidders_per_article >= 0 AND minimum_bidders_per_article <= 100000
      AND max_trial_wins >= 0 AND max_trial_wins <= 1000
      AND (max_daily_articles IS NULL OR (max_daily_articles >= 0 AND max_daily_articles <= 100000))
      AND (daily_article_budget_jod IS NULL OR daily_article_budget_jod >= 0)
      AND (work_inventory_percentage IS NULL OR (work_inventory_percentage >= 0 AND work_inventory_percentage <= 100))
    ),
  CONSTRAINT freelancer_activation_campaigns_dates_chk
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_fae_campaigns_status ON freelancer_activation_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_fae_campaigns_created_at ON freelancer_activation_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS freelancer_activation_waves (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    CONSTRAINT freelancer_activation_waves_status_chk
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  reserved_budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  used_budget_jod NUMERIC(12, 3) NOT NULL DEFAULT 0,
  target_freelancers INTEGER NULL,
  daily_budget_jod NUMERIC(12, 3) NULL,
  max_daily_articles INTEGER NULL,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_activation_waves_budget_nonneg_chk
    CHECK (
      budget_jod >= 0
      AND reserved_budget_jod >= 0
      AND used_budget_jod >= 0
      AND reserved_budget_jod + used_budget_jod <= budget_jod
    ),
  CONSTRAINT freelancer_activation_waves_limits_chk
    CHECK (
      (target_freelancers IS NULL OR (target_freelancers >= 0 AND target_freelancers <= 1000000))
      AND (daily_budget_jod IS NULL OR daily_budget_jod >= 0)
      AND (max_daily_articles IS NULL OR (max_daily_articles >= 0 AND max_daily_articles <= 100000))
    ),
  CONSTRAINT freelancer_activation_waves_dates_chk
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_fae_waves_campaign_id ON freelancer_activation_waves (campaign_id);
CREATE INDEX IF NOT EXISTS idx_fae_waves_status ON freelancer_activation_waves (status);
CREATE INDEX IF NOT EXISTS idx_fae_waves_created_at ON freelancer_activation_waves (created_at DESC);

CREATE TABLE IF NOT EXISTS freelancer_activation_budget_entries (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE RESTRICT,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  article_id BIGINT NULL,
  application_id BIGINT NULL,
  freelancer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  entry_type VARCHAR(40) NOT NULL
    CONSTRAINT freelancer_activation_budget_entries_type_chk
    CHECK (entry_type IN (
      'budget_allocated',
      'budget_reserved',
      'budget_released',
      'budget_used',
      'manual_adjustment'
    )),
  amount_jod NUMERIC(12, 3) NOT NULL,
  metadata JSONB NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_activation_budget_entries_amount_chk
    CHECK (amount_jod >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fae_budget_entries_campaign_id ON freelancer_activation_budget_entries (campaign_id);
CREATE INDEX IF NOT EXISTS idx_fae_budget_entries_wave_id ON freelancer_activation_budget_entries (wave_id);
CREATE INDEX IF NOT EXISTS idx_fae_budget_entries_created_at ON freelancer_activation_budget_entries (created_at DESC);

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_campaign_id BIGINT NULL;
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_wave_id BIGINT NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_campaign_id BIGINT NULL;
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_wave_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_articles_activation_campaign_fk'
  ) THEN
    ALTER TABLE marketplace_articles
      ADD CONSTRAINT marketplace_articles_activation_campaign_fk
      FOREIGN KEY (activation_campaign_id) REFERENCES freelancer_activation_campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_articles_activation_wave_fk'
  ) THEN
    ALTER TABLE marketplace_articles
      ADD CONSTRAINT marketplace_articles_activation_wave_fk
      FOREIGN KEY (activation_wave_id) REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_applications_activation_campaign_fk'
  ) THEN
    ALTER TABLE marketplace_article_applications
      ADD CONSTRAINT marketplace_article_applications_activation_campaign_fk
      FOREIGN KEY (activation_campaign_id) REFERENCES freelancer_activation_campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_applications_activation_wave_fk'
  ) THEN
    ALTER TABLE marketplace_article_applications
      ADD CONSTRAINT marketplace_article_applications_activation_wave_fk
      FOREIGN KEY (activation_wave_id) REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_articles_activation_campaign_id
  ON marketplace_articles (activation_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_articles_activation_wave_id
  ON marketplace_articles (activation_wave_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_article_apps_activation_campaign_id
  ON marketplace_article_applications (activation_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_article_apps_activation_wave_id
  ON marketplace_article_applications (activation_wave_id);

COMMENT ON TABLE freelancer_activation_campaigns IS
  'A3: Activation Engine campaign budget parent. Reserved/used stay 0 until later phases spend.';
COMMENT ON TABLE freelancer_activation_waves IS
  'A3: dated campaign wave. Does not auto-release Mini Articles.';
COMMENT ON TABLE freelancer_activation_budget_entries IS
  'A3: campaign budget ledger foundation. Do not double-count marketplace_articles.budget_spent_jod.';
COMMENT ON COLUMN marketplace_articles.activation_campaign_id IS
  'A3 optional FK. Unused by apply/settlement in A3.';

INSERT INTO schema_migrations (version)
VALUES ('169_freelancer_activation_campaigns_a3')
ON CONFLICT (version) DO NOTHING;

COMMIT;
