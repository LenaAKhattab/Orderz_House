-- 036_drop_stripe_columns_from_fake_orders
-- Remove Stripe-specific columns from fake_orders table.

BEGIN;

ALTER TABLE fake_orders
  DROP COLUMN IF EXISTS stripe_checkout_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_checkout_expected_amount_minor;

INSERT INTO schema_migrations (version)
SELECT '036_drop_stripe_columns_from_fake_orders'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '036_drop_stripe_columns_from_fake_orders'
);

COMMIT;
