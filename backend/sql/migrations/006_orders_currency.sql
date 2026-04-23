-- Migration 006: add currency_code to orders
-- Currency is required for fixed projects and must be NULL for bidding (since budget is NULL).

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NULL;

-- Keep constraint idempotent
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_by_project_type_chk;

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_by_project_type_chk
  CHECK (
    (project_type = 'fixed' AND currency_code IS NOT NULL AND char_length(currency_code) = 3)
    OR
    (project_type = 'bidding' AND currency_code IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_orders_currency_code ON orders(currency_code);

-- Track migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('006_orders_currency')
ON CONFLICT (version) DO NOTHING;

COMMIT;

