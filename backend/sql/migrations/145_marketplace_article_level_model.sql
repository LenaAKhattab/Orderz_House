-- 145: Marketplace Article Phase A2 — Article Level model foundation.
-- Creates dedicated marketplace_articles domain (NOT orders / fake_orders).
--
-- Does NOT:
--   enforce membership article_access_level
--   charge / reserve / consume Work Tokens
--   create applications / capacity / rounds / winners
--   enable economy engines
--   mutate legacy plans
--   fabricate historical Article rows

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_articles (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(240) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id BIGINT NULL REFERENCES subcategories(id) ON DELETE SET NULL,
  article_level INTEGER NOT NULL
    CONSTRAINT marketplace_articles_article_level_chk
      CHECK (article_level >= 1 AND article_level <= 5),
  article_value_jod NUMERIC(12, 3) NOT NULL
    CONSTRAINT marketplace_articles_article_value_nonneg_chk
      CHECK (article_value_jod >= 0),
  required_word_count INTEGER NOT NULL
    CONSTRAINT marketplace_articles_required_word_count_chk
      CHECK (required_word_count > 0),
  required_references_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_articles_required_references_count_chk
      CHECK (required_references_count >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CONSTRAINT marketplace_articles_status_chk
      CHECK (status IN ('draft', 'published', 'closed', 'cancelled')),
  -- Real Marketplace Articles = FALSE. Fake/training isolatable from economy later.
  is_fake_or_training BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Invariant: value is exactly the level in JOD (1→1.000 … 5→5.000).
  CONSTRAINT marketplace_articles_level_value_invariant_chk
    CHECK (article_value_jod = (article_level::numeric))
);

COMMENT ON TABLE marketplace_articles IS
  'Phase A2: Marketplace Article Level model. No applications/Token charges/rounds yet.';
COMMENT ON COLUMN marketplace_articles.article_level IS
  'Stable Article access/value classification 1..5. Not inferred from title or word count.';
COMMENT ON COLUMN marketplace_articles.article_value_jod IS
  'Canonical Article value in JOD. Must equal article_level (1.000..5.000).';
COMMENT ON COLUMN marketplace_articles.required_word_count IS
  'Explicit required word count for this Article. No global per-level matrix in A2.';
COMMENT ON COLUMN marketplace_articles.required_references_count IS
  'Explicit required references count (>=0). No global per-level matrix in A2.';
COMMENT ON COLUMN marketplace_articles.is_fake_or_training IS
  'FALSE = real Marketplace Article. TRUE reserved for future fake/training isolation.';
COMMENT ON COLUMN marketplace_articles.status IS
  'A2 lifecycle: draft | published | closed | cancelled. No competition-round statuses.';

CREATE INDEX IF NOT EXISTS marketplace_articles_status_idx
  ON marketplace_articles (status);

CREATE INDEX IF NOT EXISTS marketplace_articles_article_level_idx
  ON marketplace_articles (article_level);

CREATE INDEX IF NOT EXISTS marketplace_articles_category_id_idx
  ON marketplace_articles (category_id);

CREATE INDEX IF NOT EXISTS marketplace_articles_subcategory_id_idx
  ON marketplace_articles (subcategory_id);

CREATE INDEX IF NOT EXISTS marketplace_articles_created_at_idx
  ON marketplace_articles (created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_articles_real_published_idx
  ON marketplace_articles (status, article_level)
  WHERE is_fake_or_training = FALSE AND status = 'published';

INSERT INTO schema_migrations (version)
VALUES ('145_marketplace_article_level_model')
ON CONFLICT (version) DO NOTHING;

COMMIT;
