-- Optional lesson description for admin-managed course content
ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

COMMENT ON COLUMN course_lessons.description IS 'Optional admin-authored lesson summary shown to freelancers';
