-- 178: Trial pending earnings grace period + forfeiture ledger (additive).
-- Pending writer_starter_pending rows may be forfeited to company after trial.ends_at + grace days
-- when policy terms were accepted. Does NOT delete financial rows.
-- Do NOT apply to production from this phase without ops approval.

BEGIN;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_trial_pending_earnings_grace_days INTEGER NOT NULL DEFAULT 40;

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_trial_pending_grace_chk;

ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_trial_pending_grace_chk
  CHECK (
    freelancer_activation_trial_pending_earnings_grace_days >= 1
    AND freelancer_activation_trial_pending_earnings_grace_days <= 365
  );

COMMENT ON COLUMN marketplace_economy_settings.freelancer_activation_trial_pending_earnings_grace_days IS
  'Days after trial.ends_at before unpaid pending trial writer earnings are forfeited to company.';

ALTER TABLE marketplace_article_financial_entries
  DROP CONSTRAINT IF EXISTS marketplace_article_financial_entries_status_chk;

ALTER TABLE marketplace_article_financial_entries
  ADD CONSTRAINT marketplace_article_financial_entries_status_chk
  CHECK (status IN ('posted', 'pending', 'released', 'void', 'forfeited'));

ALTER TABLE marketplace_article_financial_entries
  DROP CONSTRAINT IF EXISTS marketplace_article_financial_entries_type_chk;

ALTER TABLE marketplace_article_financial_entries
  ADD CONSTRAINT marketplace_article_financial_entries_type_chk
  CHECK (entry_type IN (
    'writer_available',
    'writer_starter_pending',
    'company_trial_forfeiture',
    'reviewer',
    'company'
  ));

ALTER TABLE marketplace_article_financial_entries
  ADD COLUMN IF NOT EXISTS forfeited_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_financial_entries
  ADD COLUMN IF NOT EXISTS forfeiture_idempotency_key VARCHAR(180) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_article_financial_entries_forfeiture_uidx
  ON marketplace_article_financial_entries (forfeiture_idempotency_key)
  WHERE forfeiture_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS trial_pending_earnings_forfeiture_events (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trial_id BIGINT NULL REFERENCES freelancer_activation_trials(id) ON DELETE SET NULL,
  writer_entry_id BIGINT NOT NULL REFERENCES marketplace_article_financial_entries(id) ON DELETE RESTRICT,
  company_entry_id BIGINT NULL REFERENCES marketplace_article_financial_entries(id) ON DELETE RESTRICT,
  amount_jod NUMERIC(12, 3) NOT NULL
    CONSTRAINT trial_pending_forfeiture_amount_chk CHECK (amount_jod >= 0),
  forfeiture_deadline_at TIMESTAMPTZ NOT NULL,
  forfeited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  policy_terms_version VARCHAR(120) NOT NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trial_pending_forfeiture_events_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS trial_pending_forfeiture_events_freelancer_idx
  ON trial_pending_earnings_forfeiture_events (freelancer_user_id, forfeited_at DESC);

COMMENT ON TABLE trial_pending_earnings_forfeiture_events IS
  'Audit trail when trial pending writer earnings are closed and retained by company after grace deadline.';

COMMIT;
