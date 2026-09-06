-- 132: Predefined feedback topics (admin-managed) + optional topic on submissions.
-- Additive only — existing user_feedback rows remain valid with NULL topic fields.

BEGIN;

CREATE TABLE IF NOT EXISTS user_feedback_topics (
  id BIGSERIAL PRIMARY KEY,
  feedback_type VARCHAR(40) NOT NULL,
  label VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_feedback_topics_type_check CHECK (
    feedback_type IN ('problem', 'suggestion', 'other')
  ),
  CONSTRAINT user_feedback_topics_label_len_check CHECK (
    char_length(label) >= 1 AND char_length(label) <= 200
  )
);

CREATE INDEX IF NOT EXISTS ix_user_feedback_topics_type_active_sort
  ON user_feedback_topics (feedback_type, is_active, sort_order ASC, id ASC);

CREATE INDEX IF NOT EXISTS ix_user_feedback_topics_type_sort
  ON user_feedback_topics (feedback_type, sort_order ASC, id ASC);

COMMENT ON TABLE user_feedback_topics IS
  'Admin-managed predefined topics for Problems & Suggestions, keyed by feedback type.';
COMMENT ON COLUMN user_feedback_topics.feedback_type IS
  'Matches user_feedback.type: problem | suggestion | other.';
COMMENT ON COLUMN user_feedback_topics.is_active IS
  'Inactive topics are hidden from user forms; existing submissions keep their snapshot.';

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS topic_id BIGINT NULL;

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS topic_label_snapshot VARCHAR(200) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_feedback_topic_id_fkey'
  ) THEN
    ALTER TABLE user_feedback
      ADD CONSTRAINT user_feedback_topic_id_fkey
      FOREIGN KEY (topic_id)
      REFERENCES user_feedback_topics(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_user_feedback_topic_id
  ON user_feedback (topic_id)
  WHERE topic_id IS NOT NULL;

COMMENT ON COLUMN user_feedback.topic_id IS
  'Optional predefined topic selected at submit time; NULL when user wrote freely.';
COMMENT ON COLUMN user_feedback.topic_label_snapshot IS
  'Frozen topic label at submit time so history stays readable if the topic is renamed or deactivated.';

INSERT INTO schema_migrations (version) VALUES ('132_user_feedback_topics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
