-- 098_course_side_text_ad
-- Freelancer courses side moving text ad (admin-managed JSON config).

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS course_side_text_ad JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO schema_migrations (version)
VALUES ('098_course_side_text_ad')
ON CONFLICT (version) DO NOTHING;

COMMIT;
