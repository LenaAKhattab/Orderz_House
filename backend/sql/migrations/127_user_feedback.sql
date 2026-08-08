-- 127: User feedback (Problems & Suggestions) — additive, non-destructive.
-- Clients and freelancers submit feedback; Super Admin reviews and manages.

BEGIN;

CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_name_snapshot VARCHAR(255) NOT NULL,
  user_email_snapshot VARCHAR(255) NOT NULL,
  user_role VARCHAR(40) NOT NULL,
  type VARCHAR(40) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'new',
  priority VARCHAR(40) NOT NULL DEFAULT 'normal',
  admin_note TEXT NULL,
  assigned_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  CONSTRAINT user_feedback_type_check CHECK (
    type IN ('problem', 'suggestion', 'other')
  ),
  CONSTRAINT user_feedback_status_check CHECK (
    status IN ('new', 'in_review', 'resolved', 'closed')
  ),
  CONSTRAINT user_feedback_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT user_feedback_role_check CHECK (
    user_role IN ('client', 'freelancer')
  ),
  CONSTRAINT user_feedback_subject_len_check CHECK (
    char_length(subject) >= 1 AND char_length(subject) <= 200
  ),
  CONSTRAINT user_feedback_description_len_check CHECK (
    char_length(description) >= 1 AND char_length(description) <= 5000
  )
);

CREATE INDEX IF NOT EXISTS ix_user_feedback_created_at
  ON user_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_user_feedback_user_id_created
  ON user_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_user_feedback_status
  ON user_feedback (status);

CREATE INDEX IF NOT EXISTS ix_user_feedback_type
  ON user_feedback (type);

CREATE INDEX IF NOT EXISTS ix_user_feedback_user_role
  ON user_feedback (user_role);

CREATE INDEX IF NOT EXISTS ix_user_feedback_priority
  ON user_feedback (priority);

CREATE INDEX IF NOT EXISTS ix_user_feedback_admin_list
  ON user_feedback (status, type, user_role, created_at DESC);

COMMENT ON TABLE user_feedback IS 'Problems, suggestions, and general feedback from clients and freelancers.';
COMMENT ON COLUMN user_feedback.user_name_snapshot IS 'Display name at submission time (not updated if account name changes).';
COMMENT ON COLUMN user_feedback.user_email_snapshot IS 'Email at submission time.';
COMMENT ON COLUMN user_feedback.admin_note IS 'Internal Super Admin note — never exposed on user-facing APIs.';

INSERT INTO schema_migrations (version) VALUES ('127_user_feedback')
ON CONFLICT (version) DO NOTHING;

COMMIT;
