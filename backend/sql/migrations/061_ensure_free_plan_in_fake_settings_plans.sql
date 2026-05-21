-- 061: Allow free plan (id 1) in training-order visibility allowlist.

INSERT INTO fake_order_settings_plans (plan_id)
VALUES (1)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('061_ensure_free_plan_in_fake_settings_plans')
ON CONFLICT (version) DO NOTHING;
