-- 051_platform_ui_split_home_metrics
-- Replace single hero stats toggle with separate visitors / active users toggles.

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS show_home_visitors_count BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_home_active_users_count BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE platform_ui_settings
SET
  show_home_visitors_count = show_hero_public_stats,
  show_home_active_users_count = show_hero_public_stats
WHERE id = 1;

ALTER TABLE platform_ui_settings
  DROP COLUMN IF EXISTS show_hero_public_stats;

INSERT INTO schema_migrations (version)
VALUES ('051_platform_ui_split_home_metrics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
