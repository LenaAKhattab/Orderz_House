-- 096_fake_order_template_conversions_cascade
-- Allow template cleanup after conversion (conversion rows cascade-delete with template).

BEGIN;

ALTER TABLE fake_order_template_conversions
  DROP CONSTRAINT IF EXISTS fake_order_template_conversions_template_id_fkey;

ALTER TABLE fake_order_template_conversions
  ADD CONSTRAINT fake_order_template_conversions_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES fake_order_templates(id) ON DELETE CASCADE;

INSERT INTO schema_migrations (version)
SELECT '096_fake_order_template_conversions_cascade'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '096_fake_order_template_conversions_cascade'
);

COMMIT;
