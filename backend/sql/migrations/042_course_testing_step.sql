-- 042_course_testing_step
-- Optional per-course testing/audit step before freelancer marks course complete.

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_testing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_file_url TEXT NULL;

ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS audit_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS audit_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_course_assignments_completed
  ON course_assignments(course_id, freelancer_id)
  WHERE completed_at IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('042_course_testing_step')
ON CONFLICT (version) DO NOTHING;

COMMIT;
