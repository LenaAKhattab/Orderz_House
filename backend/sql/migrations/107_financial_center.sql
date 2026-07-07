-- Migration 107: Financial Center (people, bonus rows, allocations, audit)
-- Idempotent where possible.

BEGIN;

CREATE TABLE IF NOT EXISTS financial_people (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  job_title VARCHAR(120) NULL,
  department VARCHAR(120) NULL,
  payment_method VARCHAR(80) NULL,
  payment_details TEXT NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_people_status ON financial_people(status);
CREATE INDEX IF NOT EXISTS idx_financial_people_full_name ON financial_people(full_name);
CREATE INDEX IF NOT EXISTS idx_financial_people_user_id ON financial_people(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS financial_bonus_rows (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(240) NOT NULL,
  month_key VARCHAR(7) NOT NULL,
  note TEXT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('manual', 'subscription_payment', 'order_payment')),
  source_ref_id BIGINT NULL,
  source_label VARCHAR(500) NULL,
  gross_amount NUMERIC(12, 2) NOT NULL CHECK (gross_amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
  stripe_deduction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_percentage NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (stripe_percentage >= 0 AND stripe_percentage <= 100),
  stripe_fixed_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (stripe_fixed_fee >= 0),
  stripe_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (stripe_fee_amount >= 0),
  net_amount_after_stripe NUMERIC(12, 2) NOT NULL CHECK (net_amount_after_stripe >= 0),
  bonus_percentage NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (bonus_percentage >= 0 AND bonus_percentage <= 100),
  bonus_pool_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (bonus_pool_amount >= 0),
  received_status VARCHAR(30) NOT NULL DEFAULT 'not_received'
    CHECK (received_status IN ('received', 'not_received', 'partially_received')),
  received_amount NUMERIC(12, 2) NULL CHECK (received_amount IS NULL OR received_amount >= 0),
  received_at TIMESTAMPTZ NULL,
  received_note TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'unpaid', 'cancelled')),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_bonus_rows_month_key ON financial_bonus_rows(month_key);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_rows_status ON financial_bonus_rows(status);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_rows_source_type ON financial_bonus_rows(source_type);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_rows_received_status ON financial_bonus_rows(received_status);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_rows_created_at ON financial_bonus_rows(created_at DESC);

CREATE TABLE IF NOT EXISTS financial_bonus_allocations (
  id BIGSERIAL PRIMARY KEY,
  bonus_row_id BIGINT NOT NULL REFERENCES financial_bonus_rows(id) ON DELETE CASCADE,
  person_id BIGINT NOT NULL REFERENCES financial_people(id) ON DELETE RESTRICT,
  percentage_share NUMERIC(6, 3) NOT NULL CHECK (percentage_share > 0 AND percentage_share <= 100),
  calculated_amount NUMERIC(12, 2) NOT NULL CHECK (calculated_amount >= 0),
  paid_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (paid_status IN ('unpaid', 'paid', 'held')),
  paid_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bonus_row_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_bonus_allocations_bonus_row_id ON financial_bonus_allocations(bonus_row_id);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_allocations_person_id ON financial_bonus_allocations(person_id);
CREATE INDEX IF NOT EXISTS idx_financial_bonus_allocations_paid_status ON financial_bonus_allocations(paid_status);

CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT NOT NULL,
  action VARCHAR(60) NOT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  actor_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_entity ON financial_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_created_at ON financial_audit_logs(created_at DESC);

INSERT INTO permissions (key, module, display_name, description)
VALUES
  (
    'dashboard.super_admin.financial_center',
    'dashboard',
    'المدير الأعلى — المركز المالي',
    'إدارة البونصات والتوزيعات المالية للموظفين الداخليين.'
  )
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'dashboard.super_admin.financial_center'
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('107_financial_center')
ON CONFLICT (version) DO NOTHING;
