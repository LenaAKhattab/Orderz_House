-- 074_course_exam_questions
-- Admin-defined exam questions + freelancer completed exam file before final submission.

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS exam_questions JSONB NULL;

ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS completed_exam_file_url TEXT NULL;

COMMENT ON COLUMN courses.exam_questions IS 'Array of {number, text, maxMark} exam question definitions.';
COMMENT ON COLUMN course_assignments.completed_exam_file_url IS 'Freelancer uploaded completed exam/work file before ChatGPT grading step.';

INSERT INTO schema_migrations (version)
VALUES ('074_course_exam_questions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
