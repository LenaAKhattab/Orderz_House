-- 176: Freelancer Account Activation KYC Review (Phase A11)
-- Additive only. Private ID file keys (no public URLs). No Bid/Stripe/orders changes.
-- Do NOT apply to production from this phase alone without staging E2E.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_account_activation_requests (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review'
    CONSTRAINT faar_status_chk
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'cancelled')),
  id_front_file_key TEXT NOT NULL,
  id_back_file_key TEXT NOT NULL,
  id_front_original_name TEXT NULL,
  id_back_original_name TEXT NULL,
  id_front_mime_type VARCHAR(120) NULL,
  id_back_mime_type VARCHAR(120) NULL,
  id_front_size_bytes BIGINT NULL
    CONSTRAINT faar_front_size_nonneg_chk CHECK (id_front_size_bytes IS NULL OR id_front_size_bytes >= 0),
  id_back_size_bytes BIGINT NULL
    CONSTRAINT faar_back_size_nonneg_chk CHECK (id_back_size_bytes IS NULL OR id_back_size_bytes >= 0),
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  terms_version VARCHAR(64) NOT NULL,
  terms_snapshot TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  admin_notes TEXT NULL,
  resubmission_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT faar_resubmission_nonneg_chk CHECK (resubmission_count >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS faar_freelancer_idx
  ON freelancer_account_activation_requests (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS faar_status_idx
  ON freelancer_account_activation_requests (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS faar_submitted_idx
  ON freelancer_account_activation_requests (submitted_at DESC);

CREATE INDEX IF NOT EXISTS faar_reviewed_idx
  ON freelancer_account_activation_requests (reviewed_at DESC NULLS LAST);

-- At most one pending_review request per freelancer.
CREATE UNIQUE INDEX IF NOT EXISTS faar_one_pending_per_freelancer_uidx
  ON freelancer_account_activation_requests (freelancer_user_id)
  WHERE status = 'pending_review';

COMMENT ON TABLE freelancer_account_activation_requests IS
  'A11: Freelancer account KYC activation requests (ID front/back + terms). Private file keys only.';

INSERT INTO schema_migrations (version)
VALUES ('176_freelancer_account_activation_kyc_a11')
ON CONFLICT (version) DO NOTHING;

COMMIT;
