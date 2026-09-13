-- 186_super_admin_user_control_audit
-- Additive only: durable audit log for Super Admin Users Control Center.
-- No destructive changes. Does not touch payments/wallets/KYC file storage.

BEGIN;

CREATE TABLE IF NOT EXISTS super_admin_user_control_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  before_snapshot JSONB NULL,
  after_snapshot JSONB NULL,
  request_id VARCHAR(64) NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sa_user_control_audit_target_idx
  ON super_admin_user_control_audit_logs (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sa_user_control_audit_actor_idx
  ON super_admin_user_control_audit_logs (actor_admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sa_user_control_audit_action_idx
  ON super_admin_user_control_audit_logs (action, created_at DESC);

COMMENT ON TABLE super_admin_user_control_audit_logs IS
  'Super Admin Users Control Center — sensitive action audit (reason required). No secrets.';

INSERT INTO schema_migrations (version)
VALUES ('186_super_admin_user_control_audit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
