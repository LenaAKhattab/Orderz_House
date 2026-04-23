-- 010_orders_timing
-- Adds timing fields so deadlines can be computed from duration at the correct moment:
-- - admin direct assignment: starts immediately
-- - pool take: starts only when admin accepts

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_taken_at ON orders(taken_at);
CREATE INDEX IF NOT EXISTS idx_orders_accepted_at ON orders(accepted_at);
CREATE INDEX IF NOT EXISTS idx_orders_started_at ON orders(started_at);
CREATE INDEX IF NOT EXISTS idx_orders_due_at ON orders(due_at);

INSERT INTO schema_migrations (version)
VALUES ('010_orders_timing')
ON CONFLICT (version) DO NOTHING;

COMMIT;

