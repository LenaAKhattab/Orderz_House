-- Migration 112: Institutions foundation (إدارة المؤسسات)
-- Source of truth for institutional order storage institution selection.

BEGIN;

CREATE TABLE IF NOT EXISTS institutions (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(80) NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_name_lower
  ON institutions (lower(name));

CREATE INDEX IF NOT EXISTS idx_institutions_status
  ON institutions (status);

CREATE TABLE IF NOT EXISTS institution_members (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role VARCHAR(30) NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('member', 'manager')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_members_user
  ON institution_members (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_institution_members_institution
  ON institution_members (institution_id)
  WHERE status = 'active';

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('112_institutions')
ON CONFLICT (version) DO NOTHING;
