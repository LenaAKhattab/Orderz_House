-- 026_courses_module
-- Courses + lessons + assignment + progress for freelancers.

BEGIN;

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  cover_image TEXT NULL,
  youtube_source_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  youtube_video_id VARCHAR(32) NOT NULL,
  youtube_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  duration_seconds INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_lessons_course_video
  ON course_lessons(course_id, youtube_video_id);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course_sort
  ON course_lessons(course_id, sort_order, id);

CREATE TABLE IF NOT EXISTS course_assignments (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_assignments_course_freelancer
  ON course_assignments(course_id, freelancer_id);

CREATE INDEX IF NOT EXISTS idx_course_assignments_freelancer
  ON course_assignments(freelancer_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS course_lesson_progress (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_progress_unique
  ON course_lesson_progress(freelancer_id, course_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_course_progress_course_freelancer
  ON course_lesson_progress(course_id, freelancer_id);

INSERT INTO schema_migrations (version)
VALUES ('026_courses_module')
ON CONFLICT (version) DO NOTHING;

COMMIT;
