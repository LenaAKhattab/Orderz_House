-- 175: Freelancer Activation Engine Phase A9.3 —
-- Auto winner assignment flags + weighted-fair audit tables.
-- Additive only. Defaults DISABLED. No backfill. No wallet/claims/Stripe.
-- Do NOT apply to production from this phase.
-- Does not auto-approve, auto-settle, or auto-publish.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enablement on plan-tier allocations (inherited onto released articles)
-- ---------------------------------------------------------------------------
ALTER TABLE freelancer_activation_plan_daily_allocations
  ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE freelancer_activation_plan_daily_allocations
  ADD COLUMN IF NOT EXISTS auto_assign_mode VARCHAR(32) NOT NULL DEFAULT 'disabled';

ALTER TABLE freelancer_activation_plan_daily_allocations
  ADD COLUMN IF NOT EXISTS auto_assign_when_min_bidders_reached BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fae_plan_alloc_auto_assign_mode_chk'
  ) THEN
    ALTER TABLE freelancer_activation_plan_daily_allocations
      ADD CONSTRAINT fae_plan_alloc_auto_assign_mode_chk
      CHECK (auto_assign_mode IN ('disabled', 'weighted_fair'));
  END IF;
END $$;

COMMENT ON COLUMN freelancer_activation_plan_daily_allocations.auto_assign_enabled IS
  'A9.3: when true and mode=weighted_fair, engine may auto-select after min bidders. Default false.';

-- ---------------------------------------------------------------------------
-- Live article inherited flags (copied on A9 release)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_auto_assign_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_auto_assign_mode VARCHAR(32) NOT NULL DEFAULT 'disabled';

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS activation_auto_assign_when_min_bidders_reached BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ma_activation_auto_assign_mode_chk'
  ) THEN
    ALTER TABLE marketplace_articles
      ADD CONSTRAINT ma_activation_auto_assign_mode_chk
      CHECK (activation_auto_assign_mode IN ('disabled', 'weighted_fair'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Audit: auto-assignment runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_activation_auto_assignment_runs (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES marketplace_articles(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL REFERENCES freelancer_activation_campaigns(id) ON DELETE SET NULL,
  wave_id BIGINT NULL REFERENCES freelancer_activation_waves(id) ON DELETE SET NULL,
  plan_tier_code VARCHAR(32) NULL,
  run_type VARCHAR(40) NOT NULL
    CONSTRAINT fae_auto_assign_run_type_chk
    CHECK (run_type IN ('auto_after_min_bidders', 'manual_admin_run')),
  status VARCHAR(20) NOT NULL
    CONSTRAINT fae_auto_assign_run_status_chk
    CHECK (status IN ('skipped', 'completed', 'failed')),
  skip_reason VARCHAR(80) NULL,
  error_code VARCHAR(80) NULL,
  required_bidders INTEGER NULL,
  qualified_bidders_count INTEGER NULL,
  selected_application_id BIGINT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE SET NULL,
  selected_freelancer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  algorithm_version VARCHAR(40) NOT NULL DEFAULT 'activation_weighted_fair_v1',
  seed TEXT NULL,
  total_weight NUMERIC(14, 3) NULL,
  metadata JSONB NULL,
  triggered_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one completed auto-assignment per article (single winner product).
CREATE UNIQUE INDEX IF NOT EXISTS fae_auto_assign_completed_article_uidx
  ON freelancer_activation_auto_assignment_runs (article_id)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS fae_auto_assign_runs_article_idx
  ON freelancer_activation_auto_assignment_runs (article_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fae_auto_assign_runs_selected_app_idx
  ON freelancer_activation_auto_assignment_runs (selected_application_id)
  WHERE selected_application_id IS NOT NULL;

COMMENT ON TABLE freelancer_activation_auto_assignment_runs IS
  'A9.3: weighted-fair auto-assignment audit. Selection only — no approve/settle/publish/pay.';

CREATE TABLE IF NOT EXISTS freelancer_activation_auto_assignment_candidates (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL
    REFERENCES freelancer_activation_auto_assignment_runs(id) ON DELETE CASCADE,
  application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_rank INTEGER NULL,
  weight NUMERIC(14, 3) NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  metrics JSONB NULL,
  reason_tags JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fae_auto_assign_candidates_run_idx
  ON freelancer_activation_auto_assignment_candidates (run_id, candidate_rank ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS fae_auto_assign_candidates_app_idx
  ON freelancer_activation_auto_assignment_candidates (application_id);

COMMENT ON TABLE freelancer_activation_auto_assignment_candidates IS
  'A9.3: per-candidate weights for an auto-assignment run. Admin audit only — never expose to freelancers.';

COMMIT;
