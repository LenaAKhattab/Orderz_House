-- 068_course_visible_to_all_freelancers
-- Global freelancer visibility (not bulk assignment).

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_visible_to_all_freelancers BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_courses_active_global_visible
  ON courses (is_active, is_visible_to_all_freelancers)
  WHERE is_active = TRUE AND is_visible_to_all_freelancers = TRUE;

INSERT INTO schema_migrations (version)
VALUES ('068_course_visible_to_all_freelancers')
ON CONFLICT (version) DO NOTHING;

COMMIT;
