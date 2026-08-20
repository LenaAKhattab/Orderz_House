-- 168: Freelancer Activation Engine Phase A2.1 — one-time trial Bid Credit grant.
-- Additive only. Does not enable engines. Does not modify migration 167.
-- Reuses marketplace_bid_credit_grants + ledger. No parallel Bid currency.
-- Do NOT apply to production from this phase.

BEGIN;

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_source_type_check;
ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_source_type_check
  CHECK (source_type IN (
    'membership_daily_unlock',
    'admin_manual',
    'admin_adjustment',
    'normal_application_refund',
    'article_application_refund',
    'package_purchase',
    'admin_distribution_pool',
    'pantry_application_refund',
    'freelancer_activation_trial'
  ));

ALTER TABLE marketplace_bid_credit_ledger_entries
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_ledger_entries_event_type_check;
ALTER TABLE marketplace_bid_credit_ledger_entries
  ADD CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  CHECK (event_type IN (
    'MEMBERSHIP_BID_GRANT',
    'ADMIN_BID_GRANT',
    'ADMIN_BID_ADJUSTMENT',
    'APPLICATION_BID_CONSUME',
    'BID_EXPIRED',
    'NORMAL_APPLICATION_BID_REFUND',
    'ARTICLE_APPLICATION_BID_CONSUME',
    'ARTICLE_APPLICATION_BID_REFUND',
    'BID_PACKAGE_PURCHASE_GRANT',
    'BID_PACKAGE_PURCHASE_REVOKE',
    'ADMIN_DISTRIBUTION_POOL_GRANT',
    'BID_RESERVE',
    'BID_RESERVE_RELEASE',
    'BID_RESERVE_CONSUME',
    'PANTRY_APPLICATION_BID_CONSUME',
    'PANTRY_APPLICATION_BID_REFUND',
    'FREELANCER_ACTIVATION_TRIAL_GRANT'
  ));

ALTER TABLE freelancer_activation_trials
  ADD COLUMN IF NOT EXISTS trial_bid_granted_at TIMESTAMPTZ NULL;

ALTER TABLE freelancer_activation_trials
  ADD COLUMN IF NOT EXISTS trial_bid_grant_reference VARCHAR(64) NULL;

ALTER TABLE freelancer_activation_trials
  ADD COLUMN IF NOT EXISTS trial_bid_granted_amount INTEGER NULL;

ALTER TABLE freelancer_activation_trials
  DROP CONSTRAINT IF EXISTS freelancer_activation_trials_grant_amount_chk;
ALTER TABLE freelancer_activation_trials
  ADD CONSTRAINT freelancer_activation_trials_grant_amount_chk
  CHECK (trial_bid_granted_amount IS NULL OR trial_bid_granted_amount >= 0);

COMMENT ON COLUMN freelancer_activation_trials.trial_bid_grant_reference IS
  'A2.1: marketplace_bid_credit_grants.id for the one-time trial Bid grant.';
COMMENT ON COLUMN freelancer_activation_trials.trial_bid_granted_at IS
  'A2.1: when trial Bid Credits were granted. NULL means grant not completed.';

INSERT INTO schema_migrations (version)
VALUES ('168_freelancer_activation_trial_bid_grant')
ON CONFLICT (version) DO NOTHING;

COMMIT;
