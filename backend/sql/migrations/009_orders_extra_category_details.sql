-- 009_orders_extra_category_details
-- Store optional detailed (sub_subcategory) selection per extra category.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS extra_category_details JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_extra_category_details ON orders USING GIN (extra_category_details);

INSERT INTO schema_migrations (version)
VALUES ('009_orders_extra_category_details')
ON CONFLICT (version) DO NOTHING;

