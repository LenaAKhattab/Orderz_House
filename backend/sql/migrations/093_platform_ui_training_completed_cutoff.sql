-- 093_platform_ui_training_completed_cutoff
-- Homepage completedOrders: count training rotations only after this deploy-time cutoff.

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS homepage_training_completed_cutoff_at TIMESTAMPTZ NULL;

UPDATE platform_ui_settings
SET homepage_training_completed_cutoff_at = NOW()
WHERE id = 1
  AND homepage_training_completed_cutoff_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('093_platform_ui_training_completed_cutoff')
ON CONFLICT (version) DO NOTHING;

COMMIT;
