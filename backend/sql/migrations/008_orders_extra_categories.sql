-- 008_orders_extra_categories
-- Allow admins to store additional (optional) category IDs alongside the main category.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS extra_category_ids BIGINT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_orders_extra_category_ids ON orders USING GIN (extra_category_ids);

INSERT INTO schema_migrations (version)
VALUES ('008_orders_extra_categories')
ON CONFLICT (version) DO NOTHING;

