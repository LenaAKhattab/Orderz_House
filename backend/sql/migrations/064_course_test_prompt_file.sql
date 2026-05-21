-- 064_course_test_prompt_file
-- ChatGPT prompt/instructions as uploaded file URL (replaces text field in UI).

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS test_prompt_file_url TEXT NULL;

COMMENT ON COLUMN courses.test_prompt_file_url IS 'Uploaded ChatGPT prompt/instructions file for freelancers when testing is enabled.';

INSERT INTO schema_migrations (version)
VALUES ('064_course_test_prompt_file')
ON CONFLICT (version) DO NOTHING;

COMMIT;
