-- 131: Global Super Admin settings for subscription activation fee (enabled + amount).
-- Additive only: seeds system_settings defaults. Does NOT touch historical payments.

BEGIN;

INSERT INTO system_settings (key, value, updated_by_user_id, updated_at)
VALUES
  ('subscription_activation_fee_enabled', 'true', NULL, NOW()),
  ('subscription_activation_fee_amount_minor', '25000', NULL, NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('131_subscription_activation_fee_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
