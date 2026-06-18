-- 083_fake_order_settings_realign_next_automation_run
-- After restoring 12h duration, realign next_automation_run_at when still on a short test schedule.

BEGIN;

UPDATE fake_order_settings
SET
  next_automation_run_at = NOW() + (duration_value || ' ' || duration_unit)::interval,
  last_automation_next_at = NOW() + (duration_value || ' ' || duration_unit)::interval,
  updated_at = NOW()
WHERE id = 1
  AND duration_value = 12
  AND duration_unit = 'hours'
  AND automation_enabled = TRUE
  AND (
    next_automation_run_at IS NULL
    OR next_automation_run_at < NOW() + INTERVAL '1 hour'
  );

INSERT INTO schema_migrations (version)
SELECT '083_fake_order_settings_realign_next_automation_run'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '083_fake_order_settings_realign_next_automation_run'
);

COMMIT;
