-- Migration 113: Institutional Order Storage module
-- Separate from admin create-order, real client orders, and training/fake rotation.

BEGIN;

-- ---------------------------------------------------------------------------
-- Storage header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_order_storages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  financial_limit_jod NUMERIC(12,2) NOT NULL CHECK (financial_limit_jod > 0),
  distribution_months INT NOT NULL CHECK (distribution_months >= 1 AND distribution_months <= 120),
  distribution_start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_storages_status
  ON institutional_order_storages (status);

CREATE INDEX IF NOT EXISTS idx_inst_storages_created_at
  ON institutional_order_storages (created_at DESC);

CREATE TABLE IF NOT EXISTS institutional_storage_institutions (
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  institution_id BIGINT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (storage_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_inst_storage_institutions_institution
  ON institutional_storage_institutions (institution_id);

-- ---------------------------------------------------------------------------
-- Stored orders (pre-release lifecycle; not in public marketplace)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_stored_orders (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE RESTRICT,
  -- Lifecycle
  lifecycle_status VARCHAR(40) NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN (
      'draft',
      'pending_super_admin_approval',
      'approved_unscheduled',
      'scheduled',
      'released',
      'paused',
      'archived',
      'transferred',
      'rejected',
      'deleted'
    )),
  -- Order content (mirrors admin internal order fields)
  order_code VARCHAR(32) NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id BIGINT NULL REFERENCES subcategories(id) ON DELETE RESTRICT,
  sub_subcategory_id BIGINT NULL REFERENCES sub_subcategories(id) ON DELETE RESTRICT,
  extra_category_ids BIGINT[] NOT NULL DEFAULT '{}',
  extra_category_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  project_type VARCHAR(20) NOT NULL CHECK (project_type IN ('fixed', 'bidding')),
  budget NUMERIC(12,2) NULL,
  bid_budget_min NUMERIC(12,2) NULL,
  bid_budget_max NUMERIC(12,2) NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'JOD',
  duration_value INT NOT NULL CHECK (duration_value > 0),
  duration_unit VARCHAR(10) NOT NULL CHECK (duration_unit IN ('days', 'hours', 'minutes')),
  preferred_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  -- Financial contribution (fixed: budget; bidding: bid_budget_max)
  order_price_jod NUMERIC(12,2) NOT NULL CHECK (order_price_jod > 0),
  -- Release linkage
  released_order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ NULL,
  -- Transfer to training
  transferred_fake_order_id BIGINT NULL,
  transferred_at TIMESTAMPTZ NULL,
  transferred_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  -- Soft delete / archive
  archived_at TIMESTAMPTZ NULL,
  archived_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NULL,
  deleted_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  -- Actors
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  submitted_for_approval_at TIMESTAMPTZ NULL,
  submitted_for_approval_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  approved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_inst_stored_order_budget_shape CHECK (
    (project_type = 'fixed' AND budget IS NOT NULL AND budget > 0 AND bid_budget_min IS NULL AND bid_budget_max IS NULL)
    OR (project_type = 'bidding' AND bid_budget_min IS NOT NULL AND bid_budget_max IS NOT NULL
        AND bid_budget_min > 0 AND bid_budget_max >= bid_budget_min AND budget IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_inst_stored_orders_storage_status
  ON institutional_stored_orders (storage_id, lifecycle_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inst_stored_orders_pending
  ON institutional_stored_orders (lifecycle_status, created_at DESC)
  WHERE lifecycle_status = 'pending_super_admin_approval' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_stored_orders_released_order
  ON institutional_stored_orders (released_order_id)
  WHERE released_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_stored_orders_transferred_fake
  ON institutional_stored_orders (transferred_fake_order_id)
  WHERE transferred_fake_order_id IS NOT NULL;

-- Attachments stored as JSON metadata until release (Cloudinary URLs)
CREATE TABLE IF NOT EXISTS institutional_stored_order_files (
  id BIGSERIAL PRIMARY KEY,
  stored_order_id BIGINT NOT NULL REFERENCES institutional_stored_orders(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  byte_size INT NULL,
  secure_url TEXT NOT NULL,
  public_id VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_stored_order_files_order
  ON institutional_stored_order_files (stored_order_id);

-- ---------------------------------------------------------------------------
-- Review / audit history for approval actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_order_reviews (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  stored_order_id BIGINT NOT NULL REFERENCES institutional_stored_orders(id) ON DELETE CASCADE,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(40) NOT NULL
    CHECK (action IN (
      'submit_for_approval',
      'approve',
      'reject',
      'transfer_to_training',
      'archive',
      'delete',
      'restore',
      'price_update'
    )),
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NULL,
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_order_reviews_order
  ON institutional_order_reviews (stored_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inst_order_reviews_storage
  ON institutional_order_reviews (storage_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Monthly allocation + staggered release batches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_storage_months (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  month_sequence INT NOT NULL CHECK (month_sequence >= 1),
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  target_order_count INT NOT NULL DEFAULT 0 CHECK (target_order_count >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_id, month_sequence),
  CHECK (period_end_date >= period_start_date)
);

CREATE TABLE IF NOT EXISTS institutional_release_batches (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  month_id BIGINT NOT NULL REFERENCES institutional_storage_months(id) ON DELETE CASCADE,
  month_sequence INT NOT NULL,
  scheduled_release_at TIMESTAMPTZ NOT NULL,
  assigned_order_count INT NOT NULL DEFAULT 0 CHECK (assigned_order_count >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN (
      'SCHEDULED',
      'PROCESSING',
      'RELEASED',
      'PARTIALLY_RELEASED',
      'FAILED',
      'CANCELLED'
    )),
  released_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  idempotency_key VARCHAR(80) NOT NULL,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inst_release_batches_due
  ON institutional_release_batches (scheduled_release_at, status)
  WHERE status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED');

CREATE TABLE IF NOT EXISTS institutional_batch_orders (
  batch_id BIGINT NOT NULL REFERENCES institutional_release_batches(id) ON DELETE CASCADE,
  stored_order_id BIGINT NOT NULL REFERENCES institutional_stored_orders(id) ON DELETE RESTRICT,
  position INT NOT NULL DEFAULT 0,
  release_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (release_status IN ('pending', 'released', 'failed', 'cancelled')),
  released_order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, stored_order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_batch_orders_order_unique
  ON institutional_batch_orders (stored_order_id)
  WHERE release_status IN ('pending', 'released');

CREATE TABLE IF NOT EXISTS institutional_release_logs (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  batch_id BIGINT NULL REFERENCES institutional_release_batches(id) ON DELETE SET NULL,
  stored_order_id BIGINT NULL REFERENCES institutional_stored_orders(id) ON DELETE SET NULL,
  event VARCHAR(40) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_release_logs_batch
  ON institutional_release_logs (batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS institutional_storage_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  storage_id BIGINT NOT NULL REFERENCES institutional_order_storages(id) ON DELETE CASCADE,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id BIGINT NULL,
  before_state JSONB NULL,
  after_state JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_storage_audit_storage
  ON institutional_storage_audit_logs (storage_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Real orders: institution-scoped visibility after release
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'public';

-- Constraint added idempotently without DO $$ (runner does not support dollar quotes).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_visibility_scope;
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_visibility_scope
  CHECK (visibility_scope IN ('public', 'institution'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS institutional_storage_id BIGINT NULL
    REFERENCES institutional_order_storages(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS institutional_stored_order_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_visibility_scope
  ON orders (visibility_scope)
  WHERE visibility_scope = 'institution';

CREATE INDEX IF NOT EXISTS idx_orders_institutional_storage
  ON orders (institutional_storage_id)
  WHERE institutional_storage_id IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('113_institutional_order_storage')
ON CONFLICT (version) DO NOTHING;
