-- 063_course_test_submission
-- Post-course test: admin prompt + freelancer ChatGPT response submission.

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS test_prompt_text TEXT NULL;

ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS audit_response_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS audit_response_file_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS audit_submitted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN courses.test_prompt_text IS 'ChatGPT instructions/prompt shown to freelancers when testing is enabled.';
COMMENT ON COLUMN course_assignments.audit_response_text IS 'Pasted ChatGPT (or assistant) response text from freelancer.';
COMMENT ON COLUMN course_assignments.audit_response_file_url IS 'Optional uploaded file containing ChatGPT response.';
COMMENT ON COLUMN course_assignments.audit_submitted_at IS 'When freelancer submitted post-course test/audit response.';

INSERT INTO schema_migrations (version)
VALUES ('063_course_test_submission')
ON CONFLICT (version) DO NOTHING;

COMMIT;
