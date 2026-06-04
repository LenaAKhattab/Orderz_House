-- 070_course_exam_grading
-- Extend post-course test with per-question marks and final grade (AI-assisted manual grading).

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS test_exam_instructions TEXT NULL,
  ADD COLUMN IF NOT EXISTS test_model_answer TEXT NULL,
  ADD COLUMN IF NOT EXISTS test_question_count INT NULL;

ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS exam_question_marks JSONB NULL,
  ADD COLUMN IF NOT EXISTS exam_final_grade NUMERIC(5, 2) NULL;

COMMENT ON COLUMN courses.test_exam_instructions IS 'Written exam instructions shown to freelancers on the final test step.';
COMMENT ON COLUMN courses.test_model_answer IS 'Model answer (الإجابة النموذجية) for ChatGPT-assisted grading.';
COMMENT ON COLUMN courses.test_question_count IS 'Number of exam questions; drives dynamic mark entry fields.';
COMMENT ON COLUMN course_assignments.exam_question_marks IS 'Array of per-question marks (0–100) submitted by the freelancer.';
COMMENT ON COLUMN course_assignments.exam_final_grade IS 'Calculated average of exam_question_marks (percentage).';

INSERT INTO schema_migrations (version)
VALUES ('070_course_exam_grading')
ON CONFLICT (version) DO NOTHING;

COMMIT;
