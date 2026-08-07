-- 110_user_device_tokens
-- Mobile FCM / push device token registry (one active row per token string).

BEGIN;

CREATE TABLE IF NOT EXISTS user_device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'android'
    CHECK (platform IN ('android', 'ios', 'web')),
  device_id VARCHAR(120) NULL,
  app_version VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_device_tokens_token
  ON user_device_tokens (token);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_active
  ON user_device_tokens (user_id, is_active)
  WHERE is_active = TRUE;

INSERT INTO schema_migrations (version)
VALUES ('110_user_device_tokens')
ON CONFLICT (version) DO NOTHING;

COMMIT;
