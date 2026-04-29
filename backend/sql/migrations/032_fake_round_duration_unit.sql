-- 032_fake_round_duration_unit
-- Support fake round visibility duration in minutes/hours/days.

ALTER TABLE fake_order_settings
  ADD COLUMN IF NOT EXISTS duration_value INT NULL,
  ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(20) NULL;

UPDATE fake_order_settings
SET
  duration_value = COALESCE(duration_value, GREATEST(1, duration_hours)),
  duration_unit = COALESCE(duration_unit, 'hours')
WHERE id = 1;

ALTER TABLE fake_order_settings
  ALTER COLUMN duration_value SET NOT NULL,
  ALTER COLUMN duration_unit SET NOT NULL;

ALTER TABLE fake_order_settings
  DROP CONSTRAINT IF EXISTS fake_order_settings_duration_unit_check;

ALTER TABLE fake_order_settings
  ADD CONSTRAINT fake_order_settings_duration_unit_check
  CHECK (duration_unit IN ('minutes', 'hours', 'days'));

INSERT INTO schema_migrations (version)
SELECT '032_fake_round_duration_unit'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '032_fake_round_duration_unit'
);
