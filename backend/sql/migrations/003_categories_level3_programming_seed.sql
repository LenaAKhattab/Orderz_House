-- Migration 003: add third-level categories (sub_subcategories) + seed programming hierarchy
-- Additive and safe to re-run (idempotent inserts).

BEGIN;

CREATE TABLE IF NOT EXISTS sub_subcategories (
  id BIGSERIAL PRIMARY KEY,
  subcategory_id BIGINT NOT NULL REFERENCES subcategories(id) ON DELETE RESTRICT,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subcategory_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_sub_subcategories_subcategory_id ON sub_subcategories(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_sub_subcategories_is_active ON sub_subcategories(is_active);

-- Extend orders to reference a third-level category
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sub_subcategory_id BIGINT NULL REFERENCES sub_subcategories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_orders_sub_subcategory_id ON orders(sub_subcategory_id);

-- Ensure "programming" category is the canonical parent for "خدمات البرمجة"
-- If the category exists, update the display name/description to match the new hierarchy.
UPDATE categories
SET name = 'خدمات البرمجة',
    description = 'خدمات برمجية احترافية للأعمال، والأبحاث الأكاديمية، والمشاريع الشخصية.',
    updated_at = NOW()
WHERE slug = 'programming';

-- Insert the 3 programming subcategories under categories.slug='programming'
WITH parent AS (
  SELECT id FROM categories WHERE slug = 'programming' LIMIT 1
)
INSERT INTO subcategories (category_id, slug, name, sort_order, is_active)
SELECT parent.id, v.slug, v.name, v.sort_order, TRUE
FROM parent
JOIN (
  VALUES
    ('business-programming', 'خدمات برمجة الأعمال', 10),
    ('academic-programming', 'خدمات البرمجة الأكاديمية', 20),
    ('personal-programming', 'خدمات البرمجة الشخصية', 30)
) AS v(slug, name, sort_order) ON TRUE
ON CONFLICT (category_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- NOTE: Sub-subcategories (third level) require the "provided source list".
-- This migration seeds the parent + 2nd level only; you can extend it later with the exact items.

-- Track migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('003_categories_level3_programming_seed')
ON CONFLICT (version) DO NOTHING;

COMMIT;

