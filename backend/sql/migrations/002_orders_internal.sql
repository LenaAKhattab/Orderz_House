-- Migration 002: orders (internal admin/super_admin flow) + supporting tables
-- This migration is additive and safe to run on existing databases.

BEGIN;

CREATE TABLE IF NOT EXISTS subcategories (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(140) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON subcategories(is_active);

CREATE TABLE IF NOT EXISTS skills (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  normalized_name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_code VARCHAR(32) NOT NULL UNIQUE,

  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,

  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id BIGINT NULL REFERENCES subcategories(id) ON DELETE RESTRICT,

  project_type VARCHAR(20) NOT NULL CHECK (project_type IN ('fixed','bidding')),
  budget NUMERIC(12,2) NOT NULL CHECK (budget > 0),
  duration_value INT NOT NULL CHECK (duration_value > 0),
  duration_unit VARCHAR(10) NOT NULL CHECK (duration_unit IN ('days','hours','minutes')),

  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('admin_created','super_admin_created','client_created')),

  assigned_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,

  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  is_open_for_pool BOOLEAN NOT NULL DEFAULT TRUE,

  payment_required BOOLEAN NOT NULL DEFAULT TRUE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('not_required','unpaid','paid','refunded')),

  order_status VARCHAR(30) NOT NULL CHECK (order_status IN ('draft','published','assigned','in_progress','completed','cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_by_user_id ON orders(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_freelancer_id ON orders(assigned_freelancer_id);
CREATE INDEX IF NOT EXISTS idx_orders_pool ON orders(is_open_for_pool, is_published, assigned_freelancer_id);
CREATE INDEX IF NOT EXISTS idx_orders_category_id ON orders(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_subcategory_id ON orders(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);

CREATE TABLE IF NOT EXISTS order_skills (
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  skill_id BIGINT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  PRIMARY KEY (order_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_order_skills_skill_id ON order_skills(skill_id);

CREATE TABLE IF NOT EXISTS order_files (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_url TEXT NULL,
  original_name TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  uploaded_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id);

-- Track migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('002_orders_internal')
ON CONFLICT (version) DO NOTHING;

COMMIT;

