-- 165: OrderzHouse Bildazo accepted-article publish tracking (Phase 2B).
-- Additive CREATE TABLE only. Do not apply to production in this phase.
-- One accepted application (work unit) maps to one Bildazo import.
-- Does not change Article bid/min-bids/fair-ranking/settlement tables.
-- Retry must NEVER re-run financial settlement.

BEGIN;

CREATE TABLE IF NOT EXISTS bildazo_article_publish_records (
  id BIGSERIAL PRIMARY KEY,
  orderz_article_id BIGINT NOT NULL
    REFERENCES marketplace_articles (id) ON DELETE RESTRICT,
  orderz_application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications (id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT,
  bildazo_user_id VARCHAR(80) NOT NULL,
  bildazo_public_id VARCHAR(120) NULL,
  bildazo_article_id VARCHAR(80) NULL,
  bildazo_article_url TEXT NULL,
  bildazo_article_status VARCHAR(40) NULL,
  status VARCHAR(32) NOT NULL
    CONSTRAINT bildazo_article_publish_records_status_chk
      CHECK (status IN (
        'pending',
        'published',
        'already_imported',
        'needs_manual_review',
        'failed',
        'skipped'
      )),
  bildazo_category_id VARCHAR(80) NULL,
  publish_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error VARCHAR(240) NULL,
  last_response_code INTEGER NULL,
  requested_at TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bildazo_article_publish_records_application_uidx
    UNIQUE (orderz_application_id)
);

CREATE INDEX IF NOT EXISTS bildazo_article_publish_records_article_idx
  ON bildazo_article_publish_records (orderz_article_id, status);

CREATE INDEX IF NOT EXISTS bildazo_article_publish_records_freelancer_idx
  ON bildazo_article_publish_records (freelancer_user_id, updated_at DESC);

COMMENT ON TABLE bildazo_article_publish_records IS
  'Phase 2B: S2S Bildazo publish tracking after OrderzHouse final article approval. Unique per application. Does not store secrets or article body.';

INSERT INTO schema_migrations (version)
VALUES ('165_bildazo_article_publish_records')
ON CONFLICT (version) DO NOTHING;

COMMIT;
