-- 170: Freelancer Activation Engine Phase A4.2 — budget reserve/release/use idempotency.
-- Additive only. Does not edit 167/168/169. No backfill. No engine enable.
-- Do NOT apply to production from this phase.

BEGIN;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_budget_amount_jod NUMERIC(12, 3) NULL;
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_budget_reserved_at TIMESTAMPTZ NULL;
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_budget_released_at TIMESTAMPTZ NULL;
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS activation_budget_used_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fae_budget_entries_app_reserved
  ON freelancer_activation_budget_entries (application_id)
  WHERE application_id IS NOT NULL AND entry_type = 'budget_reserved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fae_budget_entries_app_released
  ON freelancer_activation_budget_entries (application_id)
  WHERE application_id IS NOT NULL AND entry_type = 'budget_released';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fae_budget_entries_app_used
  ON freelancer_activation_budget_entries (application_id)
  WHERE application_id IS NOT NULL AND entry_type = 'budget_used';

CREATE INDEX IF NOT EXISTS idx_fae_budget_entries_application_id
  ON freelancer_activation_budget_entries (application_id);

INSERT INTO schema_migrations (version)
VALUES ('170_freelancer_activation_budget_a42')
ON CONFLICT (version) DO NOTHING;

COMMIT;
