-- Migration 109: financial_departments + financial_people.department_id
BEGIN;

CREATE TABLE IF NOT EXISTS financial_departments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(60) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_departments_name_lower
  ON financial_departments (lower(name));

CREATE INDEX IF NOT EXISTS idx_financial_departments_status
  ON financial_departments (status);

INSERT INTO financial_departments (name, slug, is_default, status)
SELECT v.name, v.slug, TRUE, 'active'
FROM (VALUES
  ('Operations', 'operations'),
  ('HR', 'hr'),
  ('IT', 'it'),
  ('Other', 'other')
) AS v(name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM financial_departments fd WHERE lower(fd.name) = lower(v.name)
);

ALTER TABLE financial_people
  ADD COLUMN IF NOT EXISTS department_id BIGINT NULL REFERENCES financial_departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_people_department_id
  ON financial_people (department_id) WHERE department_id IS NOT NULL;

-- Migrate legacy text departments into catalog + link
INSERT INTO financial_departments (name, slug, is_default, status)
SELECT DISTINCT trim(p.department), NULL, FALSE, 'active'
FROM financial_people p
WHERE p.department IS NOT NULL
  AND trim(p.department) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM financial_departments fd WHERE lower(fd.name) = lower(trim(p.department))
  );

UPDATE financial_people p
SET department_id = fd.id
FROM financial_departments fd
WHERE p.department_id IS NULL
  AND p.department IS NOT NULL
  AND trim(p.department) <> ''
  AND lower(trim(p.department)) = lower(fd.name);

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('109_financial_departments')
ON CONFLICT (version) DO NOTHING;
