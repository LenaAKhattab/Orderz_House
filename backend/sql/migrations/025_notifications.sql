-- 025_notifications
-- Adds in-app notifications storage with dedupe support.

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_role VARCHAR(30) NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT NULL,
  link TEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe_key
  ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
  ON notifications(recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_created
  ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(entity_type, entity_id);

INSERT INTO schema_migrations (version)
VALUES ('025_notifications')
ON CONFLICT (version) DO NOTHING;

COMMIT;
