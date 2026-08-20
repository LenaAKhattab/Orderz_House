-- 171: Freelancer Activation Engine Phase A5 — manuscript terms/IP snapshot.
-- Additive columns on marketplace_article_submissions. Does not edit 166–170.
-- Nullable so legacy submissions remain readable. No backfill. No engine enable.
-- Do NOT apply to production from this phase.
-- Legal copy stored here is a product placeholder and requires legal review.

BEGIN;

ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(64) NULL;
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(64) NULL;
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_accepted_user_agent VARCHAR(512) NULL;
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_snapshot_key VARCHAR(80) NULL;
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS terms_text_snapshot TEXT NULL;

COMMENT ON COLUMN marketplace_article_submissions.terms_version IS
  'A5 product placeholder version, e.g. mini_article_submission_terms_2026-08-v1. Requires legal review.';

INSERT INTO schema_migrations (version)
VALUES ('171_marketplace_article_submission_terms_a5')
ON CONFLICT (version) DO NOTHING;

COMMIT;
