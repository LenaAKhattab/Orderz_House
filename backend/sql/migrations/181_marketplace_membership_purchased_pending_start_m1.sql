-- 181: Marketplace-M1 — purchased_pending_start membership model (additive).
-- Extends freelancer_marketplace_memberships for Stripe purchase → pending term start.
-- Term clock starts on first real order (service), not at payment.
-- Does NOT wire Stripe checkout/webhook. Does NOT change admin approval activation path.
-- Do NOT apply to Production from this phase unless explicitly approved.

BEGIN;

-- ------------------------------------------------------------
-- 1) Status CHECK: add payment_pending + purchased_pending_start
-- (DROP+ADD CONSTRAINT only; no data destructive ops)
-- ------------------------------------------------------------
ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_status_check;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_status_check
  CHECK (
    status IN (
      'pending',
      'payment_pending',
      'purchased_pending_start',
      'active',
      'cancel_at_period_end',
      'suspended',
      'expired',
      'cancelled',
      'superseded'
    )
  );

-- Current membership may include purchase-granted pending-start (and future payment_pending).
ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_current_status_consistency;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  CHECK (
    (
      is_current = TRUE
      AND status IN (
        'pending',
        'payment_pending',
        'purchased_pending_start',
        'active',
        'cancel_at_period_end',
        'suspended'
      )
    )
    OR (
      is_current = FALSE
    )
  );

COMMENT ON CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  ON freelancer_marketplace_memberships IS
  'M1: is_current=TRUE for pending/payment_pending/purchased_pending_start/active/cancel_at_period_end/suspended. Terminal statuses must be is_current=FALSE.';

-- ------------------------------------------------------------
-- 2) Pending-start / first-order columns (nullable, additive)
-- ------------------------------------------------------------
ALTER TABLE freelancer_marketplace_memberships
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ NULL;

ALTER TABLE freelancer_marketplace_memberships
  ADD COLUMN IF NOT EXISTS first_order_started_at TIMESTAMPTZ NULL;

ALTER TABLE freelancer_marketplace_memberships
  ADD COLUMN IF NOT EXISTS start_trigger_order_id BIGINT NULL
    REFERENCES orders(id) ON DELETE SET NULL;

-- Idempotency key for future Stripe/session grant (M2/M3). Nullable.
ALTER TABLE freelancer_marketplace_memberships
  ADD COLUMN IF NOT EXISTS purchase_payment_reference VARCHAR(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS freelancer_marketplace_memberships_purchase_payment_ref_uidx
  ON freelancer_marketplace_memberships (purchase_payment_reference)
  WHERE purchase_payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS freelancer_marketplace_memberships_start_trigger_order_idx
  ON freelancer_marketplace_memberships (start_trigger_order_id)
  WHERE start_trigger_order_id IS NOT NULL;

COMMENT ON COLUMN freelancer_marketplace_memberships.purchased_at IS
  'M1: when paid marketplace membership entitlement was granted (payment confirmed). Term clock may still be unset.';
COMMENT ON COLUMN freelancer_marketplace_memberships.first_order_started_at IS
  'M1: when purchased_pending_start transitioned to active on first real order.';
COMMENT ON COLUMN freelancer_marketplace_memberships.start_trigger_order_id IS
  'M1: orders.id that started the paid term (real pool orders only; training pool excluded).';
COMMENT ON COLUMN freelancer_marketplace_memberships.purchase_payment_reference IS
  'M1/M2: payment/session idempotency reference (e.g. Stripe Checkout Session id).';

INSERT INTO schema_migrations (version)
VALUES ('181_marketplace_membership_purchased_pending_start_m1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
