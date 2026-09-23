-- 194: Institution ownership + visibility on marketplace articles
-- Additive only. Mirrors orders.visibility_scope pattern without duplicating Article engines.

BEGIN;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS institution_id BIGINT NULL
    REFERENCES institutions(id) ON DELETE SET NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'public';

ALTER TABLE marketplace_articles DROP CONSTRAINT IF EXISTS chk_marketplace_articles_visibility_scope;
ALTER TABLE marketplace_articles
  ADD CONSTRAINT chk_marketplace_articles_visibility_scope
  CHECK (visibility_scope IN ('public', 'institution'));

CREATE INDEX IF NOT EXISTS idx_marketplace_articles_institution_id
  ON marketplace_articles (institution_id)
  WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_articles_institution_visibility
  ON marketplace_articles (institution_id, visibility_scope, status)
  WHERE visibility_scope = 'institution' AND institution_id IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version)
VALUES ('194_marketplace_articles_institution')
ON CONFLICT (version) DO NOTHING;
