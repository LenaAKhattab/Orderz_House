-- 071_course_model_answer_file
-- Replace text model answer / exam instructions with a PDF file URL (model answer for ChatGPT grading).

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS test_model_answer_file_url TEXT NULL;

ALTER TABLE courses
  DROP COLUMN IF EXISTS test_exam_instructions,
  DROP COLUMN IF EXISTS test_model_answer;

COMMENT ON COLUMN courses.test_model_answer_file_url IS 'PDF model answer (الإجابة النموذجية) for freelancer ChatGPT-assisted grading.';

INSERT INTO schema_migrations (version)
VALUES ('071_course_model_answer_file')
ON CONFLICT (version) DO NOTHING;

COMMIT;
