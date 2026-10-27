-- 211_client_order_payment_recovery
-- Additive. (1) One creation attempt = one client order: the Create Order form sends a per-attempt
-- key; a resubmission (double click, retry, browser Back + resubmit) returns the same order instead of
-- creating a duplicate. Distinct attempts are never merged (no content matching).
-- (2) Checkout attempts whose Stripe Session expired are recorded as 'expired' (history kept) so one
-- canonical unresolved checkout remains per pending order.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_creation_key VARCHAR(120) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_creation_key_uidx
  ON orders (created_by_user_id, client_creation_key)
  WHERE client_creation_key IS NOT NULL;

ALTER TABLE client_order_payments DROP CONSTRAINT IF EXISTS client_order_payments_status_check;
ALTER TABLE client_order_payments ADD CONSTRAINT client_order_payments_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired'));

INSERT INTO schema_migrations (version)
VALUES ('211_client_order_payment_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
