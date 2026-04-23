-- Migration 004: allow NULL budget for bidding projects
-- Rule:
-- - fixed  => budget must be > 0
-- - bidding => budget must be NULL

BEGIN;

-- Drop old budget constraints (common names)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_budget_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_budget_by_project_type_chk;

ALTER TABLE orders
  ALTER COLUMN budget DROP NOT NULL;

ALTER TABLE orders
  ADD CONSTRAINT orders_budget_by_project_type_chk
  CHECK (
    (project_type = 'fixed' AND budget IS NOT NULL AND budget > 0)
    OR
    (project_type = 'bidding' AND budget IS NULL)
  );

-- Track migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('004_bidding_budget_nullable')
ON CONFLICT (version) DO NOTHING;

COMMIT;

