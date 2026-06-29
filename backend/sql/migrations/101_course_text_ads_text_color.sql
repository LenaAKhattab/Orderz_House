-- 101_course_text_ads_text_color
-- Admin-selectable ticker text color: blue (default), black, red.

BEGIN;

ALTER TABLE course_text_ads
  ADD COLUMN IF NOT EXISTS text_color VARCHAR(16) NOT NULL DEFAULT 'blue';

ALTER TABLE course_text_ads
  DROP CONSTRAINT IF EXISTS course_text_ads_text_color_chk;

ALTER TABLE course_text_ads
  ADD CONSTRAINT course_text_ads_text_color_chk CHECK (text_color IN ('blue', 'black', 'red'));

INSERT INTO schema_migrations (version)
VALUES ('101_course_text_ads_text_color')
ON CONFLICT (version) DO NOTHING;

COMMIT;
