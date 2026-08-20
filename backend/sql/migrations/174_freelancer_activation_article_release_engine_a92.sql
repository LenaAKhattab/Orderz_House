-- 174: Freelancer Activation Engine Phase A9.2 —
-- Daily Mini Article release runs + release line items (idempotency / audit).
-- Additive only. No backfill. Does not enable engine. No wallet/claims/Stripe.
-- Do NOT apply to production from this phase.
-- Does not auto-assign winners. No cron scheduler table.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_activation_article_release_runs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE CASCADE,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  plan_tier_code VARCHAR(32) NULL,
  run_date DATE NOT NULL,
  run_type VARCHAR(20) NOT NULL
    CONSTRAINT fae_article_release_run_type_chk
    CHECK (run_type IN ('manual', 'daily_auto', 'dry_run')),
  status VARCHAR(20) NOT NULL
    CONSTRAINT fae_article_release_run_status_chk
    CHECK (status IN ('preview', 'completed', 'failed', 'skipped')),
  requested_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  released_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT fae_article_release_run_count_nonneg_chk CHECK (released_count >= 0),
  total_reserved_value_jod NUMERIC(12, 3) NOT NULL DEFAULT 0
    CONSTRAINT fae_article_release_run_value_nonneg_chk CHECK (total_reserved_value_jod >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency for real releases (not dry_run): one completed run per campaign/wave/tier/day/type
-- unless Super Admin forces a new run (force creates a separate completed run intentionally).
CREATE UNIQUE INDEX IF NOT EXISTS fae_article_release_run_idempotent_uidx
  ON freelancer_activation_article_release_runs (
    campaign_id,
    COALESCE(wave_id, 0),
    COALESCE(plan_tier_code, ''),
    run_date,
    run_type
  )
  WHERE status = 'completed' AND run_type IN ('manual', 'daily_auto');

CREATE INDEX IF NOT EXISTS fae_article_release_runs_campaign_date_idx
  ON freelancer_activation_article_release_runs (campaign_id, run_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS fae_article_release_runs_wave_date_idx
  ON freelancer_activation_article_release_runs (wave_id, run_date DESC)
  WHERE wave_id IS NOT NULL;

COMMENT ON TABLE freelancer_activation_article_release_runs IS
  'A9.2: Mini Article daily/manual release run audit. Separate from A4.2 assignment budget. Not wallet/claims.';

CREATE TABLE IF NOT EXISTS freelancer_activation_article_release_items (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES freelancer_activation_article_release_runs(id) ON DELETE CASCADE,
  inventory_item_id BIGINT NULL
    REFERENCES freelancer_activation_article_inventory_items(id) ON DELETE SET NULL,
  marketplace_article_id BIGINT NULL
    REFERENCES marketplace_articles(id) ON DELETE SET NULL,
  plan_tier_code VARCHAR(32) NOT NULL,
  total_article_value_jod NUMERIC(12, 3) NOT NULL,
  freelancer_share_jod NUMERIC(12, 3) NOT NULL,
  company_share_jod NUMERIC(12, 3) NOT NULL,
  reviewer_share_jod NUMERIC(12, 3) NOT NULL,
  status VARCHAR(20) NOT NULL
    CONSTRAINT fae_article_release_item_status_chk
    CHECK (status IN ('preview', 'released', 'skipped', 'failed')),
  skip_reason VARCHAR(80) NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fae_article_release_items_run_idx
  ON freelancer_activation_article_release_items (run_id, id ASC);

CREATE INDEX IF NOT EXISTS fae_article_release_items_article_idx
  ON freelancer_activation_article_release_items (marketplace_article_id)
  WHERE marketplace_article_id IS NOT NULL;

COMMENT ON TABLE freelancer_activation_article_release_items IS
  'A9.2: Per-article lines for a release run (preview or released). No auto-assignment.';

COMMIT;
