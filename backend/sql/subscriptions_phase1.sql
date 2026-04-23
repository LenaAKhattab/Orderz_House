-- Phase 1: Plans + Freelancer subscriptions (dynamic)
-- Run: (from backend/) npm run db:run -- sql/subscriptions_phase1.sql

BEGIN;

-- Master plans table (templates)
CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE, -- stable system key/slug (e.g. freelancer_pro)
  title VARCHAR(140) NOT NULL,
  description TEXT NULL,
  duration_days INT NOT NULL CHECK (duration_days > 0 AND duration_days <= 3650),
  price_cents INT NULL CHECK (price_cents IS NULL OR price_cents >= 0),
  requires_company_visit BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_visible_active ON plans(is_visible, is_active);
CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON plans(sort_order);
CREATE INDEX IF NOT EXISTS idx_plans_deleted_at ON plans(deleted_at);

-- Subscription instances assigned to freelancers (history preserved)
CREATE TABLE IF NOT EXISTS freelancer_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  assigned_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  has_first_order BOOLEAN NOT NULL DEFAULT FALSE,
  first_order_date TIMESTAMPTZ NULL,

  actual_start_date TIMESTAMPTZ NULL,
  expiry_date TIMESTAMPTZ NULL,

  status VARCHAR(40) NOT NULL CHECK (status IN (
    'assigned_not_started',
    'active',
    'expired',
    'inactive',
    'cancelled'
  )),

  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (has_first_order = FALSE AND first_order_date IS NULL AND actual_start_date IS NULL AND expiry_date IS NULL)
    OR
    (has_first_order = TRUE AND first_order_date IS NOT NULL AND actual_start_date IS NOT NULL AND expiry_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_fsub_freelancer_user_id ON freelancer_subscriptions(freelancer_user_id);
CREATE INDEX IF NOT EXISTS idx_fsub_plan_id ON freelancer_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_fsub_status ON freelancer_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_fsub_is_current ON freelancer_subscriptions(is_current);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fsub_current_per_freelancer
  ON freelancer_subscriptions(freelancer_user_id)
  WHERE is_current = TRUE;

COMMIT;

