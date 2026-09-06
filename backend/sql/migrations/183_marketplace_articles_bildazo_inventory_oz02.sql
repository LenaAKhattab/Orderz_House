-- 183: OZ-Articles-Bildazo-02 — Bildazo-aligned inventory, package requirements, assignment snapshots, submission writing/refs.
-- Additive only. Do NOT apply to Production from this workstation.

BEGIN;

-- =========================================================
-- Inventory: Bildazo leaf category + writing mode
-- =========================================================
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS bildazo_category_id VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_name VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_slug VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS writing_mode VARCHAR(16) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_articles_writing_mode_chk'
  ) THEN
    ALTER TABLE marketplace_articles
      ADD CONSTRAINT marketplace_articles_writing_mode_chk
      CHECK (
        writing_mode IS NULL
        OR writing_mode IN ('ai', 'manual', 'either')
      );
  END IF;
END $$;

COMMENT ON COLUMN marketplace_articles.bildazo_category_id IS
  'OZ-Articles-Bildazo-02: Bildazo leaf category UUID used as publish categoryId.';
COMMENT ON COLUMN marketplace_articles.writing_mode IS
  'OZ-Articles-Bildazo-02: ai | manual | either — required writing declaration for submissions.';

-- =========================================================
-- Package requirements (STARTER/SILVER/PRO/ELITE words + references)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_article_package_requirements (
  plan_code VARCHAR(16) PRIMARY KEY
    CONSTRAINT marketplace_article_package_requirements_plan_chk
      CHECK (plan_code IN ('STARTER', 'SILVER', 'PRO', 'ELITE')),
  min_words INTEGER NOT NULL
    CONSTRAINT marketplace_article_package_requirements_words_chk
      CHECK (min_words > 0),
  min_references INTEGER NOT NULL
    CONSTRAINT marketplace_article_package_requirements_refs_chk
      CHECK (min_references >= 0),
  updated_by_user_id BIGINT NULL
    REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE marketplace_article_package_requirements IS
  'OZ-Articles-Bildazo-02: Super Admin editable default words/references by membership plan.';

INSERT INTO marketplace_article_package_requirements (plan_code, min_words, min_references)
VALUES
  ('STARTER', 600, 2),
  ('SILVER', 1200, 4),
  ('PRO', 1800, 6),
  ('ELITE', 2400, 8)
ON CONFLICT (plan_code) DO NOTHING;

-- =========================================================
-- Assignment snapshots (frozen at select/assign)
-- =========================================================
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS writing_mode_snapshot VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_id_snapshot VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_name_snapshot VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS bildazo_category_slug_snapshot VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS title_snapshot VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS description_snapshot TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_applications_writing_mode_snap_chk'
  ) THEN
    ALTER TABLE marketplace_article_applications
      ADD CONSTRAINT marketplace_article_applications_writing_mode_snap_chk
      CHECK (
        writing_mode_snapshot IS NULL
        OR writing_mode_snapshot IN ('ai', 'manual', 'either')
      );
  END IF;
END $$;

COMMENT ON COLUMN marketplace_article_applications.writing_mode_snapshot IS
  'OZ-Articles-Bildazo-02: writing mode frozen when application is selected/assigned.';
COMMENT ON COLUMN marketplace_article_applications.bildazo_category_id_snapshot IS
  'OZ-Articles-Bildazo-02: Bildazo leaf category UUID frozen at assignment.';

-- =========================================================
-- Submission: internal references + writing source + optional cover
-- =========================================================
ALTER TABLE marketplace_article_submissions
  ADD COLUMN IF NOT EXISTS references_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS writing_source VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_submissions_writing_source_chk'
  ) THEN
    ALTER TABLE marketplace_article_submissions
      ADD CONSTRAINT marketplace_article_submissions_writing_source_chk
      CHECK (
        writing_source IS NULL
        OR writing_source IN ('HUMAN_WRITTEN', 'AI_ASSISTED', 'UNKNOWN')
      );
  END IF;
END $$;

COMMENT ON COLUMN marketplace_article_submissions.references_text IS
  'OZ-Articles-Bildazo-02: internal references only — never sent to Bildazo publish payload.';
COMMENT ON COLUMN marketplace_article_submissions.writing_source IS
  'OZ-Articles-Bildazo-02: HUMAN_WRITTEN | AI_ASSISTED | UNKNOWN — maps to Bildazo writingSource.';

INSERT INTO schema_migrations (version)
VALUES ('183_marketplace_articles_bildazo_inventory_oz02')
ON CONFLICT (version) DO NOTHING;

COMMIT;
