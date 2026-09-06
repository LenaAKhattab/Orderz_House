-- 166: Final Mini Article manuscript submissions (Phase 2B.1).
-- Additive CREATE TABLE only. Do not apply to production in this phase.
-- One row per application. This is the only Bildazo publish content source.
-- proposal_message remains a bid/application note and must not be published as article body.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_article_submissions (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications (id) ON DELETE RESTRICT,
  article_id BIGINT NOT NULL
    REFERENCES marketplace_articles (id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL
    CONSTRAINT marketplace_article_submissions_status_chk
      CHECK (status IN ('submitted', 'revision_requested', 'approved', 'rejected')),
  reviewer_notes TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_user_id BIGINT NULL
    REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_article_submissions_application_uidx
    UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS marketplace_article_submissions_article_idx
  ON marketplace_article_submissions (article_id, status);

CREATE INDEX IF NOT EXISTS marketplace_article_submissions_freelancer_idx
  ON marketplace_article_submissions (freelancer_user_id, submitted_at DESC);

COMMENT ON TABLE marketplace_article_submissions IS
  'Phase 2B.1: freelancer final article manuscript after selection. Unique per application. Not proposal_message and not campaign description.';

INSERT INTO schema_migrations (version)
VALUES ('166_marketplace_article_submissions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
