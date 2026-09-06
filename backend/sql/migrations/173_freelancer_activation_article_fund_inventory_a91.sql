-- 173: Freelancer Activation Engine Phase A9.1 —
-- Mini Article Operating Fund, plan-tier daily allocations, article inventory.
-- Additive only. No backfill. Does not enable engine. No wallet/claims/Stripe.
-- Do NOT apply to production from this phase.
-- Fund ledger is separate from A4.2 assignment budget_entries (no double-count).

BEGIN;

-- ---------------------------------------------------------------------------
-- Operating fund ledger (admin deposits / withdrawals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_activation_article_fund_entries (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE SET NULL,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  entry_type VARCHAR(40) NOT NULL
    CONSTRAINT fae_article_fund_entry_type_chk
    CHECK (entry_type IN (
      'fund_deposit',
      'fund_withdrawal',
      'daily_allocation',
      'daily_allocation_released',
      'manual_adjustment'
    )),
  amount_jod NUMERIC(12, 3) NOT NULL
    CONSTRAINT fae_article_fund_amount_nonneg_chk CHECK (amount_jod >= 0),
  reason TEXT NULL,
  metadata JSONB NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fae_article_fund_campaign_idx
  ON freelancer_activation_article_fund_entries (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fae_article_fund_type_idx
  ON freelancer_activation_article_fund_entries (entry_type, created_at DESC);

COMMENT ON TABLE freelancer_activation_article_fund_entries IS
  'A9.1: Mini Article operating fund ledger. Separate from A4.2 assignment budget_entries. Not wallet/claims.';

-- ---------------------------------------------------------------------------
-- Plan-tier daily allocation + per-tier financial split
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_activation_plan_daily_allocations (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE CASCADE,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  plan_tier_code VARCHAR(32) NOT NULL,
  daily_budget_jod NUMERIC(12, 3) NULL
    CONSTRAINT fae_plan_alloc_daily_budget_nonneg_chk
    CHECK (daily_budget_jod IS NULL OR daily_budget_jod >= 0),
  max_daily_articles INTEGER NULL
    CONSTRAINT fae_plan_alloc_max_daily_nonneg_chk
    CHECK (max_daily_articles IS NULL OR max_daily_articles >= 0),
  total_article_value_jod NUMERIC(12, 3) NOT NULL,
  freelancer_share_jod NUMERIC(12, 3) NOT NULL,
  company_share_jod NUMERIC(12, 3) NOT NULL,
  reviewer_share_jod NUMERIC(12, 3) NOT NULL,
  minimum_bidders_per_article INTEGER NOT NULL DEFAULT 10
    CONSTRAINT fae_plan_alloc_min_bidders_chk CHECK (minimum_bidders_per_article >= 1),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  release_mode VARCHAR(20) NOT NULL DEFAULT 'manual'
    CONSTRAINT fae_plan_alloc_release_mode_chk
    CHECK (release_mode IN ('manual', 'daily_auto')),
  recycle_when_inventory_empty BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fae_plan_alloc_shares_nonneg_chk
    CHECK (
      total_article_value_jod >= 0
      AND freelancer_share_jod >= 0
      AND company_share_jod >= 0
      AND reviewer_share_jod >= 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS fae_plan_alloc_campaign_tier_null_wave_uidx
  ON freelancer_activation_plan_daily_allocations (campaign_id, plan_tier_code)
  WHERE wave_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fae_plan_alloc_campaign_tier_wave_uidx
  ON freelancer_activation_plan_daily_allocations (campaign_id, plan_tier_code, wave_id)
  WHERE wave_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fae_plan_alloc_campaign_idx
  ON freelancer_activation_plan_daily_allocations (campaign_id, plan_tier_code);

COMMENT ON TABLE freelancer_activation_plan_daily_allocations IS
  'A9.1: per-plan-tier daily caps and article financial split. Share sum validated in app via milli-JOD.';

-- ---------------------------------------------------------------------------
-- Article inventory (templates before live release)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_activation_article_inventory_items (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE CASCADE,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  plan_tier_code VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  requirements TEXT NULL,
  category_id BIGINT NULL,
  subcategory_id BIGINT NULL,
  total_article_value_jod NUMERIC(12, 3) NOT NULL,
  freelancer_share_jod NUMERIC(12, 3) NOT NULL,
  company_share_jod NUMERIC(12, 3) NOT NULL,
  reviewer_share_jod NUMERIC(12, 3) NOT NULL,
  minimum_bidders_per_article INTEGER NOT NULL DEFAULT 10
    CONSTRAINT fae_inv_min_bidders_chk CHECK (minimum_bidders_per_article >= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CONSTRAINT fae_inv_status_chk
    CHECK (status IN ('draft', 'ready', 'released', 'exhausted', 'archived')),
  release_strategy VARCHAR(20) NOT NULL DEFAULT 'one_time'
    CONSTRAINT fae_inv_release_strategy_chk
    CHECK (release_strategy IN ('one_time', 'reusable')),
  max_releases INTEGER NULL
    CONSTRAINT fae_inv_max_releases_chk CHECK (max_releases IS NULL OR max_releases >= 1),
  released_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT fae_inv_released_count_chk CHECK (released_count >= 0),
  last_released_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fae_inv_shares_nonneg_chk
    CHECK (
      total_article_value_jod >= 0
      AND freelancer_share_jod >= 0
      AND company_share_jod >= 0
      AND reviewer_share_jod >= 0
    )
);

CREATE INDEX IF NOT EXISTS fae_inv_campaign_status_idx
  ON freelancer_activation_article_inventory_items (campaign_id, status, plan_tier_code);
CREATE INDEX IF NOT EXISTS fae_inv_wave_idx
  ON freelancer_activation_article_inventory_items (wave_id)
  WHERE wave_id IS NOT NULL;

COMMENT ON TABLE freelancer_activation_article_inventory_items IS
  'A9.1: Mini Article inventory templates. Manual release creates marketplace_articles. No auto-assign.';

-- ---------------------------------------------------------------------------
-- Snapshot financial split on live marketplace articles (activation releases)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_plan_tier_code VARCHAR(32) NULL;
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_freelancer_share_jod NUMERIC(12, 3) NULL;
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_company_share_jod NUMERIC(12, 3) NULL;
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_reviewer_share_jod NUMERIC(12, 3) NULL;
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_inventory_item_id BIGINT NULL;

COMMENT ON COLUMN marketplace_articles.activation_freelancer_share_jod IS
  'A9.1: freelancer net share for activation articles. Card shows article_value_jod (gross).';
COMMENT ON COLUMN marketplace_articles.activation_inventory_item_id IS
  'A9.1: source inventory item id when manually released.';

INSERT INTO schema_migrations (version)
VALUES ('173_freelancer_activation_article_fund_inventory_a91')
ON CONFLICT (version) DO NOTHING;

COMMIT;
