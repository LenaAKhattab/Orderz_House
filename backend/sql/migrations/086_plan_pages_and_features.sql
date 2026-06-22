-- 086: Plan pages (marketing URLs), plan_features, and freelancers landing page seed.

BEGIN;

CREATE TABLE IF NOT EXISTS plan_pages (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  subtitle TEXT NULL,
  slug VARCHAR(80) NULL,
  page_type VARCHAR(20) NOT NULL DEFAULT 'special'
    CHECK (page_type IN ('default', 'special')),
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_pages_slug_unique
  ON plan_pages (LOWER(slug))
  WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plan_pages_default_unique
  ON plan_pages (page_type)
  WHERE page_type = 'default';

CREATE TABLE IF NOT EXISTS plan_features (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id_sort
  ON plan_features (plan_id, sort_order ASC, id ASC);

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS plan_page_id BIGINT NULL REFERENCES plan_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_plan_id BIGINT NULL REFERENCES plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS button_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS button_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'JOD';

CREATE INDEX IF NOT EXISTS idx_plans_plan_page_id ON plans (plan_page_id);

-- Default public plans page (serves /plans)
INSERT INTO plan_pages (title, subtitle, slug, page_type, is_public, is_active)
VALUES (
  'باقات أوردرز هاوس',
  'اختر الباقة المناسبة لنشاطك، قارن المزايا، وابدأ أو أدر اشتراكك من مكان واحد.',
  NULL,
  'default',
  TRUE,
  TRUE
)
ON CONFLICT DO NOTHING;

-- Assign canonical subscription plans to the default page when not yet linked.
UPDATE plans p
SET plan_page_id = dp.id, updated_at = NOW()
FROM plan_pages dp
WHERE dp.page_type = 'default'
  AND p.id = ANY(ARRAY[1::bigint, 2::bigint, 3::bigint])
  AND p.deleted_at IS NULL
  AND p.plan_page_id IS NULL;

-- Copy JSONB features into plan_features for canonical plans (idempotent).
INSERT INTO plan_features (plan_id, feature_text, sort_order, is_included)
SELECT p.id, elem.value, elem.ordinality - 1, TRUE
FROM plans p
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.features, '[]'::jsonb)) WITH ORDINALITY AS elem(value, ordinality)
WHERE p.id = ANY(ARRAY[1::bigint, 2::bigint, 3::bigint])
  AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM plan_features pf WHERE pf.plan_id = p.id);

INSERT INTO schema_migrations (version) VALUES ('086_plan_pages_and_features')
ON CONFLICT (version) DO NOTHING;

COMMIT;
