-- 038_fake_order_rounds_settings_snapshot
-- Store immutable settings snapshot when a training round is generated.

BEGIN;

ALTER TABLE fake_order_rounds
  ADD COLUMN IF NOT EXISTS settings_snapshot JSONB NULL;

INSERT INTO schema_migrations (version)
SELECT '038_fake_order_rounds_settings_snapshot'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '038_fake_order_rounds_settings_snapshot'
);

COMMIT;
