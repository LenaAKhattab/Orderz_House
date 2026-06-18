-- 082_fake_order_settings_restore_12h_duration
-- Restore production-intended 12-hour training round duration when left at 2-minute test values.

BEGIN;

UPDATE fake_order_settings
SET
  duration_value = 12,
  duration_unit = 'hours',
  duration_hours = 12,
  updated_at = NOW()
WHERE id = 1
  AND duration_value = 2
  AND duration_unit = 'minutes';

INSERT INTO schema_migrations (version)
SELECT '082_fake_order_settings_restore_12h_duration'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '082_fake_order_settings_restore_12h_duration'
);

COMMIT;
