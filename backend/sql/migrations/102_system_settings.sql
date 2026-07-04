-- 102_system_settings
-- Minimal generic key/value store for editable, non-secret system configuration
-- (e.g. paid_subscription_notification_email). Never store secrets/API keys here.

BEGIN;

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('102_system_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
