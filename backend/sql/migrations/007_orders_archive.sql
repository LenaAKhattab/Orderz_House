-- 007_orders_archive
-- Adds archiving support for internal/admin orders.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- When archived, the order must not be visible/published in pool.
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_orders_archive_visibility;

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_archive_visibility
  CHECK (
    (is_archived = FALSE)
    OR (is_published = FALSE AND is_open_for_pool = FALSE AND order_status = 'draft')
  );

CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived);

INSERT INTO schema_migrations (version)
VALUES ('007_orders_archive')
ON CONFLICT (version) DO NOTHING;

