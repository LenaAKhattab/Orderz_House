-- 111_rate_limit_exemptions
-- Super Admin managed per-user rate limit exemptions (scoped; never auth/payment).

BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_exemptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(64) NOT NULL,
  mode VARCHAR(32) NOT NULL
    CHECK (mode IN ('bypass', 'increased_limit')),
  max_per_minute INT NULL
    CHECK (max_per_minute IS NULL OR max_per_minute >= 1),
  max_per_hour INT NULL
    CHECK (max_per_hour IS NULL OR max_per_hour >= 1),
  expires_at TIMESTAMPTZ NULL,
  reason TEXT NOT NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rate_limit_exemptions_scope CHECK (
    scope IN (
      'order_create',
      'fake_order_create',
      'training_bulk',
      'admin_write'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_user_scope_active
  ON rate_limit_exemptions (user_id, scope)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_expires
  ON rate_limit_exemptions (expires_at)
  WHERE is_active = TRUE AND expires_at IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('111_rate_limit_exemptions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
