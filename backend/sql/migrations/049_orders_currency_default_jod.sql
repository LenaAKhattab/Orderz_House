-- Platform standard: orders are priced in JOD. New rows default to JOD when currency_code is omitted.
-- Does NOT drop currency_code (still required by CHECK constraints and Stripe/payment audit fields).

BEGIN;

ALTER TABLE orders ALTER COLUMN currency_code SET DEFAULT 'JOD';

COMMENT ON COLUMN orders.currency_code IS 'ISO 4217; platform uses JOD only.';

INSERT INTO schema_migrations (version)
VALUES ('049_orders_currency_default_jod')
ON CONFLICT (version) DO NOTHING;

COMMIT;
