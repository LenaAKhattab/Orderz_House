-- 218_smart_orders_quotes_assignment
-- Smart Orders S3: versioned customer quotes (+ guest payment link), Stripe quote payments on the EXISTING
-- client_order_payments attempt table, freelancer assignment offers (accept / reject / expire), immutable
-- financial terms snapshots, controlled compensation change requests, audited work-before-payment
-- authorizations and an append-only commercial audit trail.
--
-- Scope: Admin-created orders WITH a customer mode (S1). Legacy internal Admin orders, client marketplace
-- orders and WhatsApp freelancer intakes keep their current flows. No VAT / split / pool is activated:
-- tax treatment is metadata only and freelancer pay stays orders.budget (now locked by terms snapshots).
--
-- Additive only. Rollback (ops manual, only while no S3 row exists): drop the new tables, the two added
-- client_order_payments columns + restore its purpose/client_id constraints, re-add NOT NULL on
-- payment_checkout_funnel_events.actor_user_id, clear schema_migrations row 218_smart_orders_quotes_assignment.

BEGIN;

CREATE TABLE IF NOT EXISTS order_quotes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'issued',
  payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
  currency VARCHAR(3) NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL,
  -- [{ "label": "...", "amount": "-5.00" }] — customer-facing lines only.
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL,
  -- Metadata only (VAT is NOT applied; policy gate G4).
  tax_treatment VARCHAR(16) NOT NULL DEFAULT 'not_applicable',
  terms_note VARCHAR(1000) NULL,
  -- Frozen commercial context: service (S2 snapshot), quantity/unit, order reference.
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  accepted_channel VARCHAR(16) NULL,
  accepted_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  acceptance_evidence VARCHAR(500) NULL,
  superseded_at TIMESTAMPTZ NULL,
  superseded_by_quote_id BIGINT NULL REFERENCES order_quotes(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ NULL,
  -- Guest payment link (sha256 only; plaintext shown once to the Admin).
  guest_token_hash CHAR(64) NULL,
  guest_token_expires_at TIMESTAMPTZ NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_expected_amount_minor BIGINT NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  paid_at TIMESTAMPTZ NULL,
  paid_amount_minor BIGINT NULL,
  created_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_quotes_version_chk CHECK (version >= 1),
  CONSTRAINT order_quotes_status_chk CHECK (status IN ('issued', 'accepted', 'expired', 'superseded', 'cancelled')),
  CONSTRAINT order_quotes_payment_status_chk CHECK (payment_status IN ('unpaid', 'paid', 'paid_inactive')),
  CONSTRAINT order_quotes_currency_chk CHECK (currency IN ('JOD', 'AED')),
  CONSTRAINT order_quotes_amounts_chk CHECK (base_amount > 0 AND total_amount > 0),
  CONSTRAINT order_quotes_tax_chk CHECK (tax_treatment IN ('not_applicable', 'taxable', 'zero_rated', 'exempt', 'out_of_scope')),
  CONSTRAINT order_quotes_channel_chk CHECK (
    accepted_channel IS NULL OR accepted_channel IN ('customer_web', 'customer_app', 'admin_recorded', 'payment')
  ),
  CONSTRAINT order_quotes_accept_chk CHECK ((accepted_at IS NULL) = (accepted_channel IS NULL)),
  CONSTRAINT order_quotes_paid_chk CHECK ((payment_status = 'unpaid') = (paid_at IS NULL)),
  CONSTRAINT order_quotes_uq UNIQUE (order_id, version)
);

-- One live (issued / accepted) quote per order.
CREATE UNIQUE INDEX IF NOT EXISTS order_quotes_live_uidx
  ON order_quotes (order_id) WHERE status IN ('issued', 'accepted');
CREATE UNIQUE INDEX IF NOT EXISTS order_quotes_guest_token_uidx
  ON order_quotes (guest_token_hash) WHERE guest_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_quotes_session_uidx
  ON order_quotes (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

-- Quote payments reuse the existing payment-attempt table.
ALTER TABLE client_order_payments ADD COLUMN IF NOT EXISTS quote_id BIGINT NULL REFERENCES order_quotes(id) ON DELETE SET NULL;
ALTER TABLE client_order_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NULL;
-- Guests pay without an account: the payer may be unknown (quote payments only).
ALTER TABLE client_order_payments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE client_order_payments DROP CONSTRAINT IF EXISTS client_order_payments_purpose_check;
ALTER TABLE client_order_payments ADD CONSTRAINT client_order_payments_purpose_check CHECK (
  purpose IN ('fixed_order_creation', 'selected_bid_payment', 'quote_payment')
) NOT VALID;
ALTER TABLE client_order_payments VALIDATE CONSTRAINT client_order_payments_purpose_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_order_payments_payer_chk') THEN
    ALTER TABLE client_order_payments ADD CONSTRAINT client_order_payments_payer_chk CHECK (
      client_id IS NOT NULL OR (purpose = 'quote_payment' AND quote_id IS NOT NULL)
    ) NOT VALID;
  END IF;
END $$;
ALTER TABLE client_order_payments VALIDATE CONSTRAINT client_order_payments_payer_chk;
CREATE INDEX IF NOT EXISTS client_order_payments_quote_idx ON client_order_payments (quote_id) WHERE quote_id IS NOT NULL;

-- Guest checkout telemetry has no signed-in actor.
ALTER TABLE payment_checkout_funnel_events ALTER COLUMN actor_user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS order_assignment_offers (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  -- Offered pay (JOD, same unit as orders.budget) — becomes the terms snapshot on acceptance.
  compensation_amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
  expires_at TIMESTAMPTZ NOT NULL,
  offered_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ NULL,
  rejection_reason_code VARCHAR(30) NULL,
  cancelled_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_assignment_offers_status_chk CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  CONSTRAINT order_assignment_offers_amount_chk CHECK (compensation_amount > 0),
  CONSTRAINT order_assignment_offers_currency_chk CHECK (currency = 'JOD'),
  CONSTRAINT order_assignment_offers_reason_chk CHECK (
    rejection_reason_code IS NULL
    OR rejection_reason_code IN ('unavailable', 'outside_skills', 'deadline_too_short', 'compensation', 'other')
  )
);

-- At most ONE open or accepted offer per order (exactly one canonical assignee).
CREATE UNIQUE INDEX IF NOT EXISTS order_assignment_offers_live_uidx
  ON order_assignment_offers (order_id) WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS order_assignment_offers_freelancer_idx
  ON order_assignment_offers (freelancer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_assignment_offers_due_idx
  ON order_assignment_offers (expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS order_financial_terms (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  offer_id BIGINT NOT NULL REFERENCES order_assignment_offers(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  terms_version INTEGER NOT NULL,
  source VARCHAR(16) NOT NULL,
  compensation_amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
  -- Current Production rule: fixed Admin-set pay (no revenue share). Kept explicit for later phases.
  compensation_basis VARCHAR(20) NOT NULL DEFAULT 'fixed_budget',
  due_at TIMESTAMPTZ NULL,
  quote_id BIGINT NULL REFERENCES order_quotes(id) ON DELETE SET NULL,
  quote_version INTEGER NULL,
  change_request_id BIGINT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_financial_terms_source_chk CHECK (source IN ('offer_acceptance', 'change_request')),
  CONSTRAINT order_financial_terms_amount_chk CHECK (compensation_amount > 0),
  CONSTRAINT order_financial_terms_basis_chk CHECK (compensation_basis IN ('fixed_budget')),
  CONSTRAINT order_financial_terms_uq UNIQUE (order_id, terms_version)
);

CREATE TABLE IF NOT EXISTS order_commercial_changes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  offer_id BIGINT NOT NULL REFERENCES order_assignment_offers(id) ON DELETE RESTRICT,
  kind VARCHAR(30) NOT NULL DEFAULT 'freelancer_compensation',
  old_amount NUMERIC(12,2) NOT NULL,
  new_amount NUMERIC(12,2) NOT NULL,
  old_due_at TIMESTAMPTZ NULL,
  new_due_at TIMESTAMPTZ NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_freelancer',
  requested_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_commercial_changes_kind_chk CHECK (kind IN ('freelancer_compensation')),
  CONSTRAINT order_commercial_changes_status_chk CHECK (status IN ('pending_freelancer', 'approved', 'rejected', 'applied', 'cancelled')),
  CONSTRAINT order_commercial_changes_amount_chk CHECK (old_amount > 0 AND new_amount > 0)
);
-- Idempotent for environments that applied an earlier draft of this migration.
ALTER TABLE order_commercial_changes ALTER COLUMN status TYPE VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS order_commercial_changes_pending_uidx
  ON order_commercial_changes (order_id) WHERE status = 'pending_freelancer';

CREATE TABLE IF NOT EXISTS order_work_authorizations (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  authorized_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authorized_by_role VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_work_authorizations_reason_chk CHECK (length(reason) >= 5)
);
CREATE INDEX IF NOT EXISTS order_work_authorizations_order_idx ON order_work_authorizations (order_id);

CREATE TABLE IF NOT EXISTS order_commercial_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_commercial_events_action_chk CHECK (action IN (
    'quote_issued', 'quote_superseded', 'quote_cancelled', 'quote_expired', 'quote_accepted', 'guest_link_created',
    'payment_checkout_created', 'payment_confirmed', 'payment_on_inactive_quote',
    'offer_created', 'offer_accepted', 'offer_rejected', 'offer_expired', 'offer_cancelled',
    'terms_snapshot', 'change_requested', 'change_approved', 'change_rejected', 'change_applied',
    'work_authorized', 'work_started'
  ))
);
CREATE INDEX IF NOT EXISTS order_commercial_events_order_idx ON order_commercial_events (order_id, created_at);

-- Append-only: terms, authorizations and events are never edited.
DROP TRIGGER IF EXISTS order_financial_terms_no_update ON order_financial_terms;
CREATE TRIGGER order_financial_terms_no_update
  BEFORE UPDATE ON order_financial_terms FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_work_authorizations_no_update ON order_work_authorizations;
CREATE TRIGGER order_work_authorizations_no_update
  BEFORE UPDATE ON order_work_authorizations FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();
DROP TRIGGER IF EXISTS order_commercial_events_no_update ON order_commercial_events;
CREATE TRIGGER order_commercial_events_no_update
  BEFORE UPDATE ON order_commercial_events FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();

-- Work-before-payment is an explicit, assignable permission (super_admin role always).
INSERT INTO permissions (key, module, display_name, description)
VALUES ('dashboard.admin.commercial_override', 'dashboard', 'لوحة الإدارة — تصريح العمل قبل الدفع',
        'السماح ببدء التنفيذ قبل تأكيد الدفع مع سبب موثق.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'dashboard.admin.commercial_override'
 WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('218_smart_orders_quotes_assignment')
ON CONFLICT (version) DO NOTHING;

COMMIT;
