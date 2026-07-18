-- Migration 119: Institution frozen status + audit log (additive only).
-- Preserves active/inactive; adds frozen for Super Admin freeze workflow.

BEGIN;

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_status_check;
ALTER TABLE institutions
  ADD CONSTRAINT institutions_status_check
  CHECK (status IN ('active', 'inactive', 'frozen'));

CREATE TABLE IF NOT EXISTS institution_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  previous_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NULL,
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_audit_logs_institution_created
  ON institution_audit_logs (institution_id, created_at DESC);

COMMIT;
