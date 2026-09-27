-- 198: Super Admin manual identity verification + course completion source.
-- Additive. Does not backfill. Does not create ID files. Does not rewrite lesson progress.

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_identity_manual_verifications (
  freelancer_user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL
    CONSTRAINT fimv_status_chk CHECK (status IN ('approved', 'revoked')),
  verification_method VARCHAR(40) NOT NULL
    CONSTRAINT fimv_method_chk CHECK (
      verification_method IN ('whatsapp', 'in_person', 'email', 'company_docs', 'other')
    ),
  admin_note TEXT NULL,
  verified_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ NULL,
  revoked_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoke_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE freelancer_identity_manual_verifications IS
  'Trusted Super Admin identity approval received outside the platform. No ID file keys.';

ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS completion_source VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS completed_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_completion_reason VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS admin_completion_note TEXT NULL;

ALTER TABLE course_assignments
  DROP CONSTRAINT IF EXISTS course_assignments_completion_source_chk;

ALTER TABLE course_assignments
  ADD CONSTRAINT course_assignments_completion_source_chk
  CHECK (
    completion_source IS NULL
    OR completion_source IN ('learner', 'admin_override')
  );

COMMENT ON COLUMN course_assignments.completion_source IS
  'admin_override = Super Admin confirmed requirement without fabricating lesson progress or exam score.';

INSERT INTO schema_migrations (version)
VALUES ('198_admin_manual_eligibility_overrides')
ON CONFLICT (version) DO NOTHING;

COMMIT;
