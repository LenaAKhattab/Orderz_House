-- Smart Orders S6 — employee reward pool (monthly), computed ONLY from the company share of closed
-- order settlements. Never touches freelancer compensation. Policy `employee_reward_pool` stays
-- DISABLED (gate G7): previews work, approval/payout is refused until management activates it.
-- Weights are basis points (10000 = 100.00%); allocations use largest-remainder (no value created/lost).

BEGIN;

CREATE TABLE IF NOT EXISTS reward_periods (
  id BIGSERIAL PRIMARY KEY,
  period_month DATE NOT NULL UNIQUE,
  status VARCHAR(12) NOT NULL DEFAULT 'draft',
  -- Frozen at approval:
  policy_version INTEGER NULL,
  percent_of_company_share VARCHAR(8) NULL,
  company_share_milli BIGINT NULL,
  pool_milli BIGINT NULL,
  settlement_count INTEGER NULL,
  approved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  closed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NULL,
  payment_status VARCHAR(10) NOT NULL DEFAULT 'unpaid',
  payment_reference VARCHAR(200) NULL,
  paid_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_periods_month_chk CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT reward_periods_status_chk CHECK (status IN ('draft', 'approved', 'closed')),
  CONSTRAINT reward_periods_payment_chk CHECK (payment_status IN ('unpaid', 'paid')),
  CONSTRAINT reward_periods_paid_chk CHECK (payment_status = 'unpaid' OR (status = 'closed' AND payment_reference IS NOT NULL)),
  CONSTRAINT reward_periods_approved_chk CHECK (
    status = 'draft' OR (pool_milli IS NOT NULL AND pool_milli >= 0 AND company_share_milli IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS reward_period_weights (
  id BIGSERIAL PRIMARY KEY,
  period_id BIGINT NOT NULL REFERENCES reward_periods(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  weight_bp INTEGER NOT NULL,
  CONSTRAINT reward_period_weights_uq UNIQUE (period_id, user_id),
  CONSTRAINT reward_period_weights_bp_chk CHECK (weight_bp > 0 AND weight_bp <= 10000)
);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id BIGSERIAL PRIMARY KEY,
  period_id BIGINT NOT NULL REFERENCES reward_periods(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  weight_bp INTEGER NOT NULL,
  amount_milli BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_allocations_uq UNIQUE (period_id, user_id),
  CONSTRAINT reward_allocations_amount_chk CHECK (amount_milli >= 0)
);

CREATE TABLE IF NOT EXISTS reward_adjustments (
  id BIGSERIAL PRIMARY KEY,
  period_id BIGINT NOT NULL REFERENCES reward_periods(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_milli BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_adjustments_amount_chk CHECK (amount_milli <> 0)
);

-- Weights are editable only while the period is draft.
CREATE OR REPLACE FUNCTION reward_weights_guard() RETURNS trigger AS $$
DECLARE st VARCHAR(12);
BEGIN
  SELECT status INTO st FROM reward_periods WHERE id = COALESCE(NEW.period_id, OLD.period_id);
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'reward weights are frozen once the period is approved';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reward_weights_guard ON reward_period_weights;
CREATE TRIGGER reward_weights_guard BEFORE INSERT OR UPDATE OR DELETE ON reward_period_weights
  FOR EACH ROW EXECUTE FUNCTION reward_weights_guard();

-- Period state machine: draft → approved → closed; paid only after closed; frozen facts never change.
CREATE OR REPLACE FUNCTION reward_periods_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'closed' AND (NEW.status <> 'closed' OR NEW.pool_milli IS DISTINCT FROM OLD.pool_milli
       OR NEW.company_share_milli IS DISTINCT FROM OLD.company_share_milli OR NEW.closed_at IS DISTINCT FROM OLD.closed_at) THEN
    RAISE EXCEPTION 'closed reward periods are immutable';
  END IF;
  IF OLD.payment_status = 'paid' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'paid reward periods are immutable';
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'approved reward periods cannot return to draft';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.pool_milli IS DISTINCT FROM OLD.pool_milli OR NEW.company_share_milli IS DISTINCT FROM OLD.company_share_milli) THEN
    RAISE EXCEPTION 'approved reward amounts are frozen';
  END IF;
  IF NEW.period_month <> OLD.period_month THEN
    RAISE EXCEPTION 'reward period month is immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reward_periods_guard ON reward_periods;
CREATE TRIGGER reward_periods_guard BEFORE UPDATE ON reward_periods FOR EACH ROW EXECUTE FUNCTION reward_periods_guard();

DROP TRIGGER IF EXISTS reward_allocations_no_update ON reward_allocations;
CREATE TRIGGER reward_allocations_no_update BEFORE UPDATE ON reward_allocations FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS reward_adjustments_no_update ON reward_adjustments;
CREATE TRIGGER reward_adjustments_no_update BEFORE UPDATE ON reward_adjustments FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();

INSERT INTO permissions (key, module, display_name, description) VALUES
  ('dashboard.admin.reward_manage', 'dashboard', 'لوحة الإدارة — مكافآت الموظفين', 'إنشاء فترات المكافآت وتحديد أوزان الموظفين.'),
  ('dashboard.admin.payout_approve', 'dashboard', 'لوحة الإدارة — اعتماد الصرف', 'اعتماد وإقفال فترات المكافآت وتسجيل الصرف والتعديلات.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key IN ('dashboard.admin.reward_manage', 'dashboard.admin.payout_approve')
 WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('220_employee_reward_pool')
ON CONFLICT (version) DO NOTHING;

COMMIT;
