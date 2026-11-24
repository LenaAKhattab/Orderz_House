-- Smart Orders S5 — financial engine (settlement breakdown, FX snapshots, tax treatment, costs,
-- adjustments, payment exceptions, catalog pricing, multi-service items).
--
-- Production policy is preserved: base currency JOD, freelancer pay = agreed compensation,
-- VAT / revenue-split / quality-check charging / employee pool are seeded DISABLED (gates G2–G7).
-- Every money row is append-only; closed settlements are immutable (corrections = new version).
-- All amounts are integer milli-units (1/1000 of the currency unit): exact for JOD (3dp) and AED (2dp).

BEGIN;

-- ---------------------------------------------------------------------------
-- Versioned financial policies (append-only; latest version per key wins).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_policy_versions (
  id BIGSERIAL PRIMARY KEY,
  policy_key VARCHAR(40) NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Free-text management approval reference (required by the service to activate a gated policy).
  approval_reference VARCHAR(300) NULL,
  note VARCHAR(500) NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finance_policy_versions_status_chk CHECK (status IN ('active', 'disabled')),
  CONSTRAINT finance_policy_versions_key_chk CHECK (policy_key IN (
    'base_currency', 'freelancer_compensation', 'revenue_split', 'vat', 'payment_fees',
    'quality_checks', 'employee_reward_pool'
  )),
  CONSTRAINT finance_policy_versions_uq UNIQUE (policy_key, version)
);

INSERT INTO finance_policy_versions (policy_key, version, status, config, note) VALUES
  ('base_currency', 1, 'active', '{"currency":"JOD"}', 'Current Production rule (G2): JOD base.'),
  ('freelancer_compensation', 1, 'active', '{"mode":"agreed_terms"}', 'Freelancer pay = accepted financial terms / Admin budget.'),
  ('revenue_split', 1, 'disabled', '{"freelancerPercentOfNet":"50.00"}', 'Spec 50/50 net split — gate G3, not approved.'),
  ('vat', 1, 'disabled', '{"ratePercent":"5.00","pricesIncludeTax":true}', 'Spec 5% VAT — gate G4, not approved.'),
  ('payment_fees', 1, 'active', '{"source":"actual_recorded","deductFrom":"company_share"}', 'Only actual recorded processor fees; never from freelancer pay (G5).'),
  ('quality_checks', 1, 'disabled', '{"unitCost":"2.00","currency":"AED","maxPerOrder":3}', 'Spec 3 x 2 AED — gate G6; no licensed integration.'),
  ('employee_reward_pool', 1, 'disabled', '{"percentOfCompanyShare":"5.00","period":"monthly"}', 'Spec 5% of company share — gate G7.')
ON CONFLICT (policy_key, version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Dated FX snapshots (never invented: source + timestamp are mandatory; immutable).
-- rate = units of quote_currency per 1 base_currency.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
  id BIGSERIAL PRIMARY KEY,
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(24,10) NOT NULL,
  source VARCHAR(120) NOT NULL,
  rate_at TIMESTAMPTZ NOT NULL,
  note VARCHAR(300) NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_rate_snapshots_rate_chk CHECK (rate > 0),
  CONSTRAINT fx_rate_snapshots_pair_chk CHECK (base_currency <> quote_currency),
  CONSTRAINT fx_rate_snapshots_ccy_chk CHECK (base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT fx_rate_snapshots_source_chk CHECK (length(btrim(source)) >= 3)
);
CREATE INDEX IF NOT EXISTS ix_fx_rate_snapshots_pair ON fx_rate_snapshots (base_currency, quote_currency, rate_at DESC);

-- ---------------------------------------------------------------------------
-- Actual order costs (processor fees, successful quality checks, approved direct expenses).
-- Immutable; voiding is a separate append-only row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_cost_entries (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  kind VARCHAR(20) NOT NULL,
  amount_milli BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  description VARCHAR(500) NOT NULL,
  -- Idempotency key from the source (e.g. Stripe balance transaction id, QC check id).
  source_ref VARCHAR(160) NULL,
  -- Quality checks: only a successful (passed) technical check may ever be recorded as a cost.
  qc_provider VARCHAR(60) NULL,
  qc_result VARCHAR(12) NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_cost_entries_kind_chk CHECK (kind IN ('payment_fee', 'quality_check', 'direct_expense')),
  CONSTRAINT order_cost_entries_amount_chk CHECK (amount_milli > 0),
  CONSTRAINT order_cost_entries_ccy_chk CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT order_cost_entries_qc_chk CHECK (kind <> 'quality_check' OR (qc_result = 'passed' AND qc_provider IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_cost_entries_source ON order_cost_entries (kind, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_order_cost_entries_order ON order_cost_entries (order_id);

CREATE TABLE IF NOT EXISTS order_cost_entry_voids (
  id BIGSERIAL PRIMARY KEY,
  cost_entry_id BIGINT NOT NULL UNIQUE REFERENCES order_cost_entries(id) ON DELETE RESTRICT,
  reason VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Refunds / dispute losses / credits / corrections (signed; positive reduces revenue).
-- Recording here never moves money: actual refunds are executed in Stripe by authorized staff.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_financial_adjustments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  kind VARCHAR(20) NOT NULL,
  amount_milli BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  source_ref VARCHAR(160) NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_financial_adjustments_kind_chk CHECK (kind IN ('refund', 'dispute_loss', 'customer_credit', 'correction')),
  CONSTRAINT order_financial_adjustments_amount_chk CHECK (amount_milli <> 0),
  CONSTRAINT order_financial_adjustments_ccy_chk CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_financial_adjustments_source ON order_financial_adjustments (kind, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_order_financial_adjustments_order ON order_financial_adjustments (order_id);

-- ---------------------------------------------------------------------------
-- Payment exceptions (Admin review queue). Only open → resolved is allowed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_exceptions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  quote_id BIGINT NULL REFERENCES order_quotes(id) ON DELETE SET NULL,
  payment_id BIGINT NULL REFERENCES client_order_payments(id) ON DELETE SET NULL,
  kind VARCHAR(24) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  amount_milli BIGINT NULL,
  currency VARCHAR(3) NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref VARCHAR(160) NOT NULL,
  resolution VARCHAR(40) NULL,
  resolution_note VARCHAR(1000) NULL,
  resolved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_exceptions_kind_chk CHECK (kind IN (
    'paid_inactive', 'superseded', 'amount_mismatch', 'duplicate_payment', 'refund', 'dispute', 'reconciliation'
  )),
  CONSTRAINT payment_exceptions_status_chk CHECK (status IN ('open', 'resolved')),
  CONSTRAINT payment_exceptions_resolution_chk CHECK (
    (status = 'open' AND resolution IS NULL)
    OR (status = 'resolved' AND resolution IN ('refunded_in_stripe', 'kept_with_authorization', 'no_action_required', 'other'))
  ),
  CONSTRAINT payment_exceptions_source_uq UNIQUE (kind, source_ref)
);
CREATE INDEX IF NOT EXISTS ix_payment_exceptions_open ON payment_exceptions (status, created_at DESC);

CREATE OR REPLACE FUNCTION payment_exceptions_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'resolved' THEN
    RAISE EXCEPTION 'resolved payment exceptions are immutable';
  END IF;
  IF NEW.kind <> OLD.kind OR NEW.source_ref <> OLD.source_ref OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.amount_milli IS DISTINCT FROM OLD.amount_milli OR NEW.detail <> OLD.detail THEN
    RAISE EXCEPTION 'payment exception facts are immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payment_exceptions_guard ON payment_exceptions;
CREATE TRIGGER payment_exceptions_guard BEFORE UPDATE ON payment_exceptions FOR EACH ROW EXECUTE FUNCTION payment_exceptions_guard();

-- ---------------------------------------------------------------------------
-- Closed settlements: immutable, versioned (a correction is a new version with a reason).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_settlements (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  gross_milli BIGINT NOT NULL,
  refunds_milli BIGINT NOT NULL,
  tax_milli BIGINT NOT NULL,
  fees_milli BIGINT NOT NULL,
  quality_checks_milli BIGINT NOT NULL,
  direct_costs_milli BIGINT NOT NULL,
  net_milli BIGINT NOT NULL,
  freelancer_milli BIGINT NOT NULL,
  company_milli BIGINT NOT NULL,
  breakdown JSONB NOT NULL,
  policy_snapshot JSONB NOT NULL,
  fx_snapshot_ids BIGINT[] NOT NULL DEFAULT '{}',
  supersedes_settlement_id BIGINT NULL REFERENCES order_settlements(id) ON DELETE RESTRICT,
  correction_reason VARCHAR(500) NULL,
  closed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_settlements_uq UNIQUE (order_id, version),
  CONSTRAINT order_settlements_version_chk CHECK (version >= 1),
  CONSTRAINT order_settlements_correction_chk CHECK (
    (version = 1 AND supersedes_settlement_id IS NULL)
    OR (version > 1 AND supersedes_settlement_id IS NOT NULL AND correction_reason IS NOT NULL)
  ),
  CONSTRAINT order_settlements_identity_chk CHECK (
    net_milli = gross_milli - refunds_milli - tax_milli - fees_milli - quality_checks_milli - direct_costs_milli
    AND company_milli = net_milli - freelancer_milli
  )
);
CREATE INDEX IF NOT EXISTS ix_order_settlements_closed ON order_settlements (closed_at);

-- ---------------------------------------------------------------------------
-- Multi-service order items (additional services on one canonical order; each item immutable).
-- The order's primary service stays in order_form_snapshots (S2); items 2..n live here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_service_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL,
  service_id BIGINT NOT NULL REFERENCES catalog_services(id) ON DELETE RESTRICT,
  service_code VARCHAR(60) NOT NULL,
  service_version INTEGER NOT NULL,
  definition JSONB NOT NULL,
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity NUMERIC(14,2) NULL,
  quantity_unit VARCHAR(30) NOT NULL,
  quantity_unspecified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Customer-facing price line for this item (optional; the quote stays the commercial truth).
  price_amount NUMERIC(12,2) NULL,
  price_currency VARCHAR(3) NULL,
  note VARCHAR(500) NULL,
  removed_at TIMESTAMPTZ NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_service_items_uq UNIQUE (order_id, item_no),
  CONSTRAINT order_service_items_no_chk CHECK (item_no >= 2),
  CONSTRAINT order_service_items_price_chk CHECK (
    (price_amount IS NULL AND price_currency IS NULL)
    OR (price_amount > 0 AND price_currency IN ('JOD', 'AED'))
  )
);

CREATE OR REPLACE FUNCTION order_service_items_guard() RETURNS trigger AS $$
BEGIN
  -- Only soft removal is allowed; the item's service/values/price are frozen.
  IF NEW.order_id <> OLD.order_id OR NEW.item_no <> OLD.item_no OR NEW.service_id <> OLD.service_id
     OR NEW.service_version <> OLD.service_version OR NEW.definition <> OLD.definition
     OR NEW.field_values <> OLD.field_values OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.quantity_unspecified <> OLD.quantity_unspecified
     OR NEW.price_amount IS DISTINCT FROM OLD.price_amount OR NEW.price_currency IS DISTINCT FROM OLD.price_currency
     OR (OLD.removed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'order service items are immutable (remove and re-add instead)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_service_items_guard ON order_service_items;
CREATE TRIGGER order_service_items_guard BEFORE UPDATE ON order_service_items FOR EACH ROW EXECUTE FUNCTION order_service_items_guard();

-- Append-only money rows (reuse the S2 forbid-update function).
DROP TRIGGER IF EXISTS finance_policy_versions_no_update ON finance_policy_versions;
CREATE TRIGGER finance_policy_versions_no_update BEFORE UPDATE ON finance_policy_versions FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS fx_rate_snapshots_no_update ON fx_rate_snapshots;
CREATE TRIGGER fx_rate_snapshots_no_update BEFORE UPDATE ON fx_rate_snapshots FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_cost_entries_no_update ON order_cost_entries;
CREATE TRIGGER order_cost_entries_no_update BEFORE UPDATE ON order_cost_entries FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_cost_entry_voids_no_update ON order_cost_entry_voids;
CREATE TRIGGER order_cost_entry_voids_no_update BEFORE UPDATE ON order_cost_entry_voids FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_financial_adjustments_no_update ON order_financial_adjustments;
CREATE TRIGGER order_financial_adjustments_no_update BEFORE UPDATE ON order_financial_adjustments FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_settlements_no_update ON order_settlements;
CREATE TRIGGER order_settlements_no_update BEFORE UPDATE ON order_settlements FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();

-- ---------------------------------------------------------------------------
-- Permissions (super_admin bypasses; grant to other roles explicitly).
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, module, display_name, description) VALUES
  ('dashboard.admin.finance_view', 'dashboard', 'لوحة الإدارة — عرض التسويات والتقارير المالية', 'عرض التفصيل المالي للطلبات والتقارير والاستثناءات.'),
  ('dashboard.admin.finance_manage', 'dashboard', 'لوحة الإدارة — إدارة القيود المالية', 'تسجيل التكاليف والتسويات وأسعار الصرف ومعالجة الاستثناءات.'),
  ('dashboard.admin.finance_policy', 'dashboard', 'لوحة الإدارة — السياسات المالية', 'تفعيل أو تعطيل السياسات المالية بموافقة الإدارة.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('dashboard.admin.finance_view', 'dashboard.admin.finance_manage', 'dashboard.admin.finance_policy')
 WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('219_smart_orders_financial_engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
