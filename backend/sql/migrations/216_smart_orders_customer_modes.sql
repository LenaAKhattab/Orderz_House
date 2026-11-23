-- 216_smart_orders_customer_modes
-- Smart Order Management S1: explicit customer mode on Admin-created orders.
--
--   existing     -> customer_user_id = a verified client account chosen by the Admin.
--   new_account  -> customer_user_id stays NULL until the customer redeems a one-time claim link
--                   (order_customer_invitations) with a verified account. The SAME order is linked.
--   guest        -> NO users row. guest_contact_id -> guest_contacts (minimal, admin-managed).
--                   customer_user_id may be set later ONLY by an explicit, audited conversion
--                   (customer_account_linked_at NOT NULL).
--   NULL         -> legacy / internal order without a customer (Path A, client orders, intakes).
--
-- Existing rows are NOT backfilled with customer data (unknown stays unknown). The only backfill is
-- order_channel='whatsapp' for orders created by an approved external WhatsApp intake (provable).
--
-- Additive only. Rollback (ops manual, only while no row uses the new columns): drop the three new
-- tables (events, invitations, guest_contacts), drop the orders columns/constraints added here and
-- clear schema_migrations row 216_smart_orders_customer_modes.

BEGIN;

CREATE TABLE IF NOT EXISTS guest_contacts (
  id BIGSERIAL PRIMARY KEY,
  -- Optional nickname / first name the customer gave. Never a login identity.
  reference_name VARCHAR(120) NULL,
  -- E.164 (+ and 8..15 digits). Optional: some guests are reached through another channel.
  phone_e164 VARCHAR(16) NULL,
  contact_channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  whatsapp_only BOOLEAN NOT NULL DEFAULT TRUE,
  -- How the customer agreed to be contacted for this order (spec 3.3).
  consent_status VARCHAR(20) NOT NULL DEFAULT 'customer_initiated',
  -- Short admin note (no PII beyond what is operationally required).
  note VARCHAR(500) NULL,
  -- Structural guarantee: a guest contact can never be used to log in.
  no_login BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Retention: contact details may be redacted after this moment (policy job, not automatic here).
  retain_until TIMESTAMPTZ NULL,
  redacted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guest_contacts_no_login_chk CHECK (no_login = TRUE),
  CONSTRAINT guest_contacts_phone_chk CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT guest_contacts_channel_chk CHECK (contact_channel IN ('whatsapp', 'phone', 'email', 'other')),
  CONSTRAINT guest_contacts_consent_chk CHECK (
    consent_status IN ('customer_initiated', 'verbal', 'written', 'withdrawn')
  ),
  CONSTRAINT guest_contacts_ref_len_chk CHECK (reference_name IS NULL OR length(reference_name) BETWEEN 1 AND 120)
);

-- Admin lookup only (never used for automatic linking).
CREATE INDEX IF NOT EXISTS guest_contacts_phone_idx ON guest_contacts (phone_e164) WHERE phone_e164 IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_mode VARCHAR(20) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_contact_id BIGINT NULL REFERENCES guest_contacts(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_account_linked_at TIMESTAMPTZ NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_manager_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_channel VARCHAR(20) NULL;
-- Customer-facing price (what the customer pays). Separate from orders.budget, which for Admin
-- orders is the freelancer compensation. Admin-only; never returned by freelancer APIs.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_pricing_status VARCHAR(20) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_price_amount NUMERIC(12,2) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_price_currency VARCHAR(3) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_mode_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_customer_mode_chk CHECK (
      (customer_mode IS NULL
        AND customer_user_id IS NULL AND guest_contact_id IS NULL AND customer_account_linked_at IS NULL)
      OR (customer_mode = 'existing'
        AND customer_user_id IS NOT NULL AND guest_contact_id IS NULL)
      OR (customer_mode = 'new_account'
        AND guest_contact_id IS NULL
        AND (customer_user_id IS NULL OR customer_account_linked_at IS NOT NULL))
      OR (customer_mode = 'guest'
        AND guest_contact_id IS NOT NULL
        AND (customer_user_id IS NULL OR customer_account_linked_at IS NOT NULL))
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_mode_source_chk') THEN
    -- Customer modes exist only on Admin-created orders (client orders own themselves).
    ALTER TABLE orders ADD CONSTRAINT orders_customer_mode_source_chk CHECK (
      customer_mode IS NULL OR source_type IN ('admin_created', 'super_admin_created')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_channel_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_channel_chk CHECK (
      order_channel IS NULL OR order_channel IN ('whatsapp', 'admin', 'app', 'web', 'phone', 'email', 'other')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_pricing_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_customer_pricing_chk CHECK (
      (customer_pricing_status IS NULL AND customer_price_amount IS NULL AND customer_price_currency IS NULL)
      OR (customer_pricing_status = 'pending_pricing' AND customer_price_amount IS NULL AND customer_price_currency IS NULL)
      OR (customer_pricing_status = 'priced' AND customer_price_amount > 0
        AND customer_price_currency IN ('JOD', 'AED'))
    ) NOT VALID;
  END IF;
END $$;

ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_mode_chk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_mode_source_chk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_order_channel_chk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_pricing_chk;

CREATE INDEX IF NOT EXISTS orders_customer_user_idx
  ON orders (customer_user_id, id DESC) WHERE customer_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_guest_contact_uidx
  ON orders (guest_contact_id) WHERE guest_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_mode_idx
  ON orders (customer_mode, id DESC) WHERE customer_mode IS NOT NULL;

-- One-time claim links. Plaintext tokens are never stored (sha256 only).
CREATE TABLE IF NOT EXISTS order_customer_invitations (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  -- Phone the Admin intends to reach (reference only; not proof of identity).
  intended_phone_e164 VARCHAR(16) NULL,
  -- For guest conversion: how the customer's explicit request was recorded.
  request_evidence VARCHAR(500) NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claimed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_customer_invitations_purpose_chk CHECK (purpose IN ('new_account', 'guest_conversion')),
  CONSTRAINT order_customer_invitations_status_chk CHECK (status IN ('pending', 'claimed', 'revoked')),
  CONSTRAINT order_customer_invitations_phone_chk CHECK (
    intended_phone_e164 IS NULL OR intended_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT order_customer_invitations_state_chk CHECK (
    (status = 'pending' AND claimed_by_user_id IS NULL AND claimed_at IS NULL AND revoked_at IS NULL)
    OR (status = 'claimed' AND claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND claimed_by_user_id IS NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT order_customer_invitations_evidence_chk CHECK (
    purpose <> 'guest_conversion' OR (request_evidence IS NOT NULL AND length(request_evidence) >= 3)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS order_customer_invitations_token_uidx
  ON order_customer_invitations (token_hash);
-- At most one live link per order (regenerating revokes the previous one).
CREATE UNIQUE INDEX IF NOT EXISTS order_customer_invitations_live_uidx
  ON order_customer_invitations (order_id) WHERE status = 'pending';

-- Append-only audit trail for customer linkage (ids/codes only; no phone numbers).
CREATE TABLE IF NOT EXISTS order_customer_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_customer_events_action_chk CHECK (
    action IN (
      'customer_mode_set',
      'invitation_created',
      'invitation_revoked',
      'account_claimed',
      'guest_converted',
      'account_manager_changed',
      'customer_pricing_set',
      'guest_contact_revealed'
    )
  )
);

CREATE INDEX IF NOT EXISTS order_customer_events_order_idx
  ON order_customer_events (order_id, created_at);

-- Provable backfill: orders created by an approved WhatsApp freelancer intake.
UPDATE orders o
   SET order_channel = 'whatsapp'
  FROM external_order_intakes i
 WHERE i.approved_order_id = o.id
   AND i.source = 'whatsapp'
   AND o.order_channel IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('216_smart_orders_customer_modes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
