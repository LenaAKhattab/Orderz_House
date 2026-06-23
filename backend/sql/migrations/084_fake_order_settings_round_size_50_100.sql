-- 084_fake_order_settings_round_size_50_100
-- Default training round size range: 50–100 orders per rotation.

BEGIN;

UPDATE fake_order_settings
SET min_orders = 50,
    max_orders = 100,
    updated_at = NOW()
WHERE id = 1;

INSERT INTO schema_migrations (version)
SELECT '084_fake_order_settings_round_size_50_100'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '084_fake_order_settings_round_size_50_100'
);

COMMIT;
