-- 133: Dynamic feedback categories (admin-managed) + category snapshots on submissions.
-- Additive / backward-compatible. Does NOT drop user_feedback.type or historical rows.
-- Seeds legacy categories: problem / suggestion / other.
-- Maps existing topics + feedback onto those categories.
-- Relaxes type CHECKs so new admin-created category keys can be stored in compatibility columns.
--
-- DO NOT apply automatically in agent workflows against shared Production.
-- Apply only via the documented protected migration process after review.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Categories catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_feedback_categories (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(64) NOT NULL,
  label VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_feedback_categories_key_len_check CHECK (
    char_length(key) >= 1 AND char_length(key) <= 64
  ),
  CONSTRAINT user_feedback_categories_label_len_check CHECK (
    char_length(label) >= 1 AND char_length(label) <= 200
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_feedback_categories_key
  ON user_feedback_categories (key);

CREATE INDEX IF NOT EXISTS ix_user_feedback_categories_active_sort
  ON user_feedback_categories (is_active, sort_order ASC, id ASC);

COMMENT ON TABLE user_feedback_categories IS
  'Admin-managed feedback categories shown on client/freelancer forms.';
COMMENT ON COLUMN user_feedback_categories.key IS
  'Stable identity (legacy: problem|suggestion|other; custom: cat_<id>). Never use label alone as identity.';
COMMENT ON COLUMN user_feedback_categories.label IS
  'Current display label. Historical submissions use category_label_snapshot.';

-- Seed the three legacy categories (idempotent by key).
INSERT INTO user_feedback_categories (key, label, is_active, sort_order, created_at, updated_at)
SELECT v.key, v.label, TRUE, v.sort_order, NOW(), NOW()
FROM (
  VALUES
    ('problem', 'مشكلة', 1),
    ('suggestion', 'اقتراح', 2),
    ('other', 'ملاحظة أخرى', 3)
) AS v(key, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM user_feedback_categories c WHERE c.key = v.key
);

-- ---------------------------------------------------------------------------
-- 2) Topics: attach category_id (keep feedback_type for compatibility)
-- ---------------------------------------------------------------------------
ALTER TABLE user_feedback_topics
  ADD COLUMN IF NOT EXISTS category_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_feedback_topics_category_id_fkey'
  ) THEN
    ALTER TABLE user_feedback_topics
      ADD CONSTRAINT user_feedback_topics_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES user_feedback_categories(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill topic.category_id from legacy feedback_type → category.key
UPDATE user_feedback_topics t
SET category_id = c.id
FROM user_feedback_categories c
WHERE t.category_id IS NULL
  AND t.feedback_type = c.key;

CREATE INDEX IF NOT EXISTS ix_user_feedback_topics_category_active_sort
  ON user_feedback_topics (category_id, is_active, sort_order ASC, id ASC);

-- Relax topics type CHECK so custom category keys can mirror into feedback_type.
ALTER TABLE user_feedback_topics
  DROP CONSTRAINT IF EXISTS user_feedback_topics_type_check;

COMMENT ON COLUMN user_feedback_topics.category_id IS
  'Owning category. Preferred association for new topic management.';
COMMENT ON COLUMN user_feedback_topics.feedback_type IS
  'Compatibility mirror of category.key (legacy problem|suggestion|other + custom keys).';

-- ---------------------------------------------------------------------------
-- 3) Submissions: category_id + snapshot (keep type for compatibility)
-- ---------------------------------------------------------------------------
ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS category_id BIGINT NULL;

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS category_label_snapshot VARCHAR(200) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_feedback_category_id_fkey'
  ) THEN
    ALTER TABLE user_feedback
      ADD CONSTRAINT user_feedback_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES user_feedback_categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill category from legacy type; snapshot uses current category label.
UPDATE user_feedback f
SET
  category_id = c.id,
  category_label_snapshot = COALESCE(f.category_label_snapshot, c.label)
FROM user_feedback_categories c
WHERE f.category_id IS NULL
  AND f.type = c.key;

CREATE INDEX IF NOT EXISTS ix_user_feedback_category_id
  ON user_feedback (category_id)
  WHERE category_id IS NOT NULL;

-- Relax submission type CHECK so custom category keys can be stored in type.
ALTER TABLE user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_type_check;

COMMENT ON COLUMN user_feedback.category_id IS
  'Selected category at submit time; NULL for pre-category legacy rows until backfilled.';
COMMENT ON COLUMN user_feedback.category_label_snapshot IS
  'Frozen category label at submit time (survives rename/hide/delete of category).';
COMMENT ON COLUMN user_feedback.type IS
  'Compatibility mirror of category.key for legacy clients and filters.';

INSERT INTO schema_migrations (version) VALUES ('133_user_feedback_categories')
ON CONFLICT (version) DO NOTHING;

COMMIT;
