-- 156_default_plan_catalog
-- Canonical Super Admin setting: which of the three existing plan catalogs is
-- shown on public /plans and /dashboard/freelancer/plans.
-- Does NOT copy, merge, or delete plan rows. Does NOT alter E1 economics.
-- Initial value preserves current public /plans source: marketplace_plans.
-- Do NOT apply automatically — review then migrate explicitly.

BEGIN;

INSERT INTO system_settings (key, value, updated_by_user_id, updated_at)
VALUES ('default_plan_catalog', 'marketplace_plans', NULL, NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('156_default_plan_catalog')
ON CONFLICT (version) DO NOTHING;

COMMIT;
