-- Migration 154: Phase E2 — Article Economy + Bid reservation + settlement foundation
-- ADDITIVE. Does NOT enable Article Applications or Bid Credits.
-- Does NOT create applications, grants, settlements, or financial activity.
-- Does NOT mutate Work Tokens. Does NOT backfill B5 historical economics.
-- DO NOT APPLY until owner review.

BEGIN;

-- ---------------------------------------------------------------------------
-- Bid Credit reservation column (unified wallet; FEFO slices stored separately)
-- spendable = granted - consumed - expired - revoked - reserved
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_bid_credit_grants
  ADD COLUMN IF NOT EXISTS amount_reserved INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_amount_reserved_chk;
ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_amount_reserved_chk
  CHECK (amount_reserved >= 0);

ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_amounts_chk;
ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_amounts_chk
  CHECK (
    amount_consumed + amount_expired + COALESCE(amount_revoked, 0) + amount_reserved
    <= amount_granted
  );

COMMENT ON COLUMN marketplace_bid_credit_grants.amount_reserved IS
  'E2: Bids reserved for open Article applications. Unavailable for other spend; not yet consumed.';

-- Ledger vocabulary for reservation lifecycle
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
    'BID_RESERVE_CONSUME'
  ));

-- ---------------------------------------------------------------------------
-- Reservation header + FEFO slices (immutable source selection at reserve time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_bid_credit_reservations (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_reservations_amount_chk CHECK (amount > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CONSTRAINT marketplace_bid_credit_reservations_status_chk
      CHECK (status IN ('active', 'consumed', 'released')),
  purpose VARCHAR(64) NOT NULL DEFAULT 'article_application',
  reference_type VARCHAR(80) NOT NULL,
  reference_id VARCHAR(80) NOT NULL,
  article_id BIGINT NULL REFERENCES marketplace_articles(id) ON DELETE SET NULL,
  article_application_id BIGINT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE SET NULL,
  daily_spend_date DATE NULL,
  daily_spend_amount INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_bid_credit_reservations_daily_amt_chk CHECK (daily_spend_amount >= 0),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  release_reason VARCHAR(80) NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_bid_credit_reservations_idem_uidx UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_bid_credit_reservations_active_ref_uidx
  ON marketplace_bid_credit_reservations (reference_type, reference_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_reservations_freelancer_status_idx
  ON marketplace_bid_credit_reservations (freelancer_user_id, status, reserved_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_reservations_article_app_idx
  ON marketplace_bid_credit_reservations (article_application_id)
  WHERE article_application_id IS NOT NULL;

COMMENT ON TABLE marketplace_bid_credit_reservations IS
  'E2: Bid reservation header. Protects FEFO slices until consume (final approval) or release.';

CREATE TABLE IF NOT EXISTS marketplace_bid_credit_reservation_slices (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL
    REFERENCES marketplace_bid_credit_reservations(id) ON DELETE CASCADE,
  grant_id BIGINT NOT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL
    CONSTRAINT marketplace_bid_credit_reservation_slices_amount_chk CHECK (amount > 0),
  grant_expires_at_snapshot TIMESTAMPTZ NOT NULL,
  grant_source_type_snapshot VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_reservation_slices_res_idx
  ON marketplace_bid_credit_reservation_slices (reservation_id);

CREATE INDEX IF NOT EXISTS marketplace_bid_credit_reservation_slices_grant_idx
  ON marketplace_bid_credit_reservation_slices (grant_id);

COMMENT ON TABLE marketplace_bid_credit_reservation_slices IS
  'E2: Immutable FEFO grant slices chosen at reservation time (not recomputed at consume).';

-- ---------------------------------------------------------------------------
-- Article economy configuration (canonical; not scattered constants)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_company_share_percent NUMERIC(5, 2) NOT NULL DEFAULT 30;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_reviewer_fee_jod NUMERIC(12, 3) NOT NULL DEFAULT 0.200;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_default_bid_cost INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_value_starter_jod NUMERIC(12, 3) NOT NULL DEFAULT 1.000;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_value_silver_jod NUMERIC(12, 3) NOT NULL DEFAULT 2.000;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_value_pro_jod NUMERIC(12, 3) NOT NULL DEFAULT 3.000;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_value_elite_jod NUMERIC(12, 3) NOT NULL DEFAULT 4.000;

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_article_company_share_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_article_company_share_chk
  CHECK (article_company_share_percent >= 0 AND article_company_share_percent <= 100);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_article_reviewer_fee_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_article_reviewer_fee_chk
  CHECK (article_reviewer_fee_jod >= 0);

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_article_default_bid_cost_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_article_default_bid_cost_chk
  CHECK (article_default_bid_cost >= 1 AND article_default_bid_cost <= 100);

COMMENT ON COLUMN marketplace_economy_settings.article_company_share_percent IS
  'E2: company share of Article gross (default 30).';
COMMENT ON COLUMN marketplace_economy_settings.article_reviewer_fee_jod IS
  'E2: fixed reviewer fee JOD per finally approved Article (default 0.200).';
COMMENT ON COLUMN marketplace_economy_settings.article_default_bid_cost IS
  'E2: default Bid reservation cost when campaign does not override (default 1).';

-- ---------------------------------------------------------------------------
-- Campaign fields on marketplace_articles (extend existing listing → campaign)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_level_value_invariant_chk;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS language VARCHAR(16) NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS keywords JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS references_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS ai_usage_policy VARCHAR(64) NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS eligible_tier_codes JSONB NOT NULL DEFAULT '["starter","silver","pro","elite"]'::jsonb;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS bid_cost INTEGER NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS application_deadline_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS writing_deadline_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS reviewer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS target_article_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS accepted_article_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS budget_total_jod NUMERIC(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS budget_spent_jod NUMERIC(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS destination VARCHAR(32) NOT NULL DEFAULT 'bildazo';

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(32) NOT NULL DEFAULT 'not_applicable';

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS campaign_stop_reason VARCHAR(64) NULL;

ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_bid_cost_chk;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT marketplace_articles_bid_cost_chk
  CHECK (bid_cost IS NULL OR (bid_cost >= 1 AND bid_cost <= 100));

ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_target_count_chk;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT marketplace_articles_target_count_chk
  CHECK (target_article_count >= 1 AND accepted_article_count >= 0
         AND accepted_article_count <= target_article_count);

ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_budget_chk;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT marketplace_articles_budget_chk
  CHECK (budget_total_jod >= 0 AND budget_spent_jod >= 0
         AND budget_spent_jod <= budget_total_jod);

ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_destination_chk;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT marketplace_articles_destination_chk
  CHECK (destination IN ('bildazo', 'internal', 'other'));

ALTER TABLE marketplace_articles
  DROP CONSTRAINT IF EXISTS marketplace_articles_publication_status_chk;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT marketplace_articles_publication_status_chk
  CHECK (publication_status IN (
    'not_applicable', 'pending', 'published', 'failed', 'retry'
  ));

COMMENT ON COLUMN marketplace_articles.budget_total_jod IS
  'E2: campaign total budget (gross Article values). Backend authoritative.';
COMMENT ON COLUMN marketplace_articles.accepted_article_count IS
  'E2: finally approved Article count against target_article_count.';
COMMENT ON COLUMN marketplace_articles.bid_cost IS
  'E2: Bid reservation cost for this campaign; NULL → economy default.';

-- ---------------------------------------------------------------------------
-- Application workflow + economic snapshot (assignment-time immutable)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_article_applications
  DROP CONSTRAINT IF EXISTS marketplace_article_applications_status_chk;

ALTER TABLE marketplace_article_applications
  ADD CONSTRAINT marketplace_article_applications_status_chk
  CHECK (status IN (
    'pending',
    'selected',
    'assigned',
    'writing',
    'submitted',
    'under_review',
    'revision_requested',
    'approved',
    'rejected',
    'withdrawn',
    'cancelled'
  ));

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS bid_reservation_id BIGINT NULL
    REFERENCES marketplace_bid_credit_reservations(id) ON DELETE SET NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS economic_snapshot JSONB NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS economic_snapshot_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS under_review_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ NULL;

ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS submission_body TEXT NULL;

COMMENT ON COLUMN marketplace_article_applications.economic_snapshot IS
  'E2: immutable membership/gross/company/reviewer/writer/bid snapshot at assignment.';
COMMENT ON COLUMN marketplace_article_applications.bid_reservation_id IS
  'E2: active/consumed/released Bid reservation for this application.';

-- ---------------------------------------------------------------------------
-- Final settlement audit (one per approved application)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_article_settlements (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES marketplace_articles(id) ON DELETE RESTRICT,
  article_application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  membership_tier_code VARCHAR(64) NOT NULL,
  gross_jod NUMERIC(12, 3) NOT NULL,
  company_share_percent NUMERIC(5, 2) NOT NULL,
  company_share_jod NUMERIC(12, 3) NOT NULL,
  reviewer_fee_jod NUMERIC(12, 3) NOT NULL,
  writer_net_jod NUMERIC(12, 3) NOT NULL,
  writer_earnings_mode VARCHAR(32) NOT NULL
    CONSTRAINT marketplace_article_settlements_writer_mode_chk
      CHECK (writer_earnings_mode IN ('pending', 'available')),
  bid_reservation_id BIGINT NULL
    REFERENCES marketplace_bid_credit_reservations(id) ON DELETE SET NULL,
  bid_consumed INTEGER NOT NULL DEFAULT 0,
  economic_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_article_settlements_app_uidx UNIQUE (article_application_id),
  CONSTRAINT marketplace_article_settlements_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT marketplace_article_settlements_amounts_chk
    CHECK (
      gross_jod >= 0
      AND company_share_jod >= 0
      AND reviewer_fee_jod >= 0
      AND writer_net_jod >= 0
      AND company_share_jod + reviewer_fee_jod + writer_net_jod = gross_jod
    )
);

CREATE INDEX IF NOT EXISTS marketplace_article_settlements_article_idx
  ON marketplace_article_settlements (article_id, settled_at DESC);

COMMENT ON TABLE marketplace_article_settlements IS
  'E2: immutable final-approval financial settlement. One row per approved application.';

-- ---------------------------------------------------------------------------
-- Article financial entries (writer / reviewer / company)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_article_financial_entries (
  id BIGSERIAL PRIMARY KEY,
  settlement_id BIGINT NOT NULL
    REFERENCES marketplace_article_settlements(id) ON DELETE RESTRICT,
  article_id BIGINT NOT NULL REFERENCES marketplace_articles(id) ON DELETE RESTRICT,
  article_application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE RESTRICT,
  entry_type VARCHAR(40) NOT NULL
    CONSTRAINT marketplace_article_financial_entries_type_chk
      CHECK (entry_type IN (
        'writer_available',
        'writer_starter_pending',
        'reviewer',
        'company'
      )),
  beneficiary_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  amount_jod NUMERIC(12, 3) NOT NULL
    CONSTRAINT marketplace_article_financial_entries_amount_chk CHECK (amount_jod >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'posted'
    CONSTRAINT marketplace_article_financial_entries_status_chk
      CHECK (status IN ('posted', 'pending', 'released', 'void')),
  released_at TIMESTAMPTZ NULL,
  release_idempotency_key VARCHAR(180) NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_article_financial_entries_idem_uidx UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_article_financial_entries_release_uidx
  ON marketplace_article_financial_entries (release_idempotency_key)
  WHERE release_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_article_financial_entries_beneficiary_idx
  ON marketplace_article_financial_entries (beneficiary_user_id, entry_type, status);

COMMENT ON TABLE marketplace_article_financial_entries IS
  'E2: per-party Article settlement ledger. Starter writer rows start pending until paid membership activation.';

-- ---------------------------------------------------------------------------
-- Bildazo publish outbox (after local settlement commit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_article_bildazo_outbox (
  id BIGSERIAL PRIMARY KEY,
  settlement_id BIGINT NOT NULL
    REFERENCES marketplace_article_settlements(id) ON DELETE RESTRICT,
  article_id BIGINT NOT NULL REFERENCES marketplace_articles(id) ON DELETE RESTRICT,
  article_application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CONSTRAINT marketplace_article_bildazo_outbox_status_chk
      CHECK (status IN ('pending', 'published', 'failed', 'retry')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_article_bildazo_outbox_settlement_uidx UNIQUE (settlement_id),
  CONSTRAINT marketplace_article_bildazo_outbox_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_article_bildazo_outbox_status_idx
  ON marketplace_article_bildazo_outbox (status, next_attempt_at);

COMMENT ON TABLE marketplace_article_bildazo_outbox IS
  'E2: durable Bildazo publish jobs. Retry must NEVER re-run financial settlement.';

INSERT INTO schema_migrations (version)
VALUES ('154_marketplace_article_economy_e2')
ON CONFLICT (version) DO NOTHING;

COMMIT;
