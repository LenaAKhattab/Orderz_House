-- 190: Legacy Freelancer Administration Center
-- Additive only. Builds on 189. Does NOT modify Campaign 2 / tokens.
-- No DROP / no table wipe / no destructive UPDATE.

BEGIN;

-- ---------------------------------------------------------------------------
-- users: entry method + forced first-login password change
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS legacy_entry_method VARCHAR(32) NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_legacy_entry_method_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_legacy_entry_method_chk
      CHECK (
        legacy_entry_method IS NULL
        OR legacy_entry_method IN ('SHARED_INVITE', 'ADMIN_MANUAL')
      );
  END IF;
END $$;

-- Backfill Shared Invite entry method for existing Legacy users (safe, scoped).
UPDATE users
   SET legacy_entry_method = 'SHARED_INVITE'
 WHERE onboarding_source = 'LEGACY_INVITE'
   AND legacy_entry_method IS NULL;

COMMENT ON COLUMN users.legacy_entry_method IS
  'How a Legacy freelancer entered: SHARED_INVITE or ADMIN_MANUAL. NULL for non-Legacy.';
COMMENT ON COLUMN users.must_change_password IS
  'When true, user must change password before operational API access (manual Legacy creates).';

-- Campaign identity upload requirements (default TRUE for new rows; existing campaigns get TRUE via UPDATE below)
ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS require_id_front BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS require_id_back BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- Identity document records (private storage keys only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_identity_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE SET NULL,
  side VARCHAR(8) NOT NULL,
  storage_key TEXT NOT NULL,
  original_name TEXT NULL,
  mime_type VARCHAR(80) NULL,
  file_size INTEGER NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  upload_source VARCHAR(32) NOT NULL DEFAULT 'SELF_REGISTRATION',
  uploaded_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfid_side_chk CHECK (side IN ('FRONT', 'BACK')),
  CONSTRAINT lfid_upload_source_chk CHECK (upload_source IN ('SELF_REGISTRATION', 'ADMIN')),
  CONSTRAINT lfid_status_chk CHECK (status IN ('ACTIVE', 'REPLACED', 'MISSING'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lfid_user_side_active_uidx
  ON legacy_freelancer_identity_documents (user_id, side)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS lfid_user_idx
  ON legacy_freelancer_identity_documents (user_id);

-- ---------------------------------------------------------------------------
-- Signed document type catalog (Admin-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_document_types (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  label_ar TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfdt_code_uidx UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS lfdt_active_sort_idx
  ON legacy_freelancer_document_types (is_active, sort_order);

INSERT INTO legacy_freelancer_document_types (code, label_ar, description, is_active, sort_order)
VALUES
  ('CONTRACTOR_AGREEMENT', 'عقد مقاولة', 'عقد مقاولة موقّع مع الشركة', TRUE, 10),
  ('TRAINING_AGREEMENT', 'عقد تدريب', 'عقد تدريب موقّع مع الشركة', TRUE, 20)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-campaign signed document requirements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_campaign_document_requirements (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE CASCADE,
  document_type_id BIGINT NOT NULL REFERENCES legacy_freelancer_document_types(id) ON DELETE RESTRICT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfcdr_campaign_type_uidx UNIQUE (campaign_id, document_type_id),
  CONSTRAINT lfcdr_required_implies_enabled_chk CHECK (is_required = FALSE OR is_enabled = TRUE)
);

CREATE INDEX IF NOT EXISTS lfcdr_campaign_enabled_idx
  ON legacy_freelancer_campaign_document_requirements (campaign_id, is_enabled, sort_order);

-- Seed defaults for existing campaigns (enabled, not required) — idempotent
INSERT INTO legacy_freelancer_campaign_document_requirements
  (campaign_id, document_type_id, is_enabled, is_required, sort_order)
SELECT c.id, t.id, TRUE, FALSE, t.sort_order
  FROM legacy_freelancer_invite_campaigns c
 CROSS JOIN legacy_freelancer_document_types t
 WHERE t.code IN ('CONTRACTOR_AGREEMENT', 'TRAINING_AGREEMENT')
ON CONFLICT (campaign_id, document_type_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Freelancer signed-document confirmations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_signed_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE SET NULL,
  document_type_id BIGINT NOT NULL REFERENCES legacy_freelancer_document_types(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmation_source VARCHAR(32) NOT NULL DEFAULT 'SELF_REGISTRATION',
  confirmed_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfsd_source_chk CHECK (confirmation_source IN ('SELF_REGISTRATION', 'ADMIN')),
  CONSTRAINT lfsd_user_type_uidx UNIQUE (user_id, document_type_id)
);

CREATE INDEX IF NOT EXISTS lfsd_user_active_idx
  ON legacy_freelancer_signed_documents (user_id, is_active);

-- ---------------------------------------------------------------------------
-- Historical / off-platform money received (informational only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_historical_money_received (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'JOD',
  received_at DATE NULL,
  note TEXT NULL,
  recorded_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMPTZ NULL,
  voided_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  void_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfhrm_amount_positive_chk CHECK (amount > 0),
  CONSTRAINT lfhrm_currency_chk CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS lfhrm_user_active_idx
  ON legacy_freelancer_historical_money_received (user_id, is_voided);

COMMENT ON TABLE legacy_freelancer_historical_money_received IS
  'Administrative historical money records for Legacy freelancers. Does NOT affect wallets, ledgers, Stripe, or payouts.';

-- ---------------------------------------------------------------------------
-- Package assignment history (admin entitlement — non-financial)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_freelancer_package_assignments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  subscription_id BIGINT NULL REFERENCES freelancer_subscriptions(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  duration_months INTEGER NULL,
  assignment_source VARCHAR(64) NOT NULL DEFAULT 'LEGACY_ADMIN_ASSIGNMENT',
  assigned_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfpa_dates_chk CHECK (expires_at > starts_at),
  CONSTRAINT lfpa_status_chk CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'CANCELLED')),
  CONSTRAINT lfpa_source_chk CHECK (assignment_source IN ('LEGACY_ADMIN_ASSIGNMENT', 'LEGACY_INVITE_DEFAULT', 'LEGACY_BULK_ASSIGNMENT'))
);

CREATE INDEX IF NOT EXISTS lfpa_user_status_idx
  ON legacy_freelancer_package_assignments (user_id, status, expires_at DESC);

-- ---------------------------------------------------------------------------
-- Permission seed
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, module, display_name, description)
VALUES (
  'legacy_freelancers.manage',
  'legacy_freelancers',
  'إدارة الفريلانسرز القدامى',
  'Manage Legacy freelancers admin center (identity, docs, packages, historical money)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.name = 'super_admin'
   AND p.key = 'legacy_freelancers.manage'
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('190_legacy_freelancer_admin_center')
ON CONFLICT (version) DO NOTHING;

COMMIT;
