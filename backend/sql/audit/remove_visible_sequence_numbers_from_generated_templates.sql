BEGIN;

UPDATE fake_order_templates
SET
  title = regexp_replace(title, '\s\([0-9]+\)', '', 'g'),
  description = regexp_replace(description, '\s\([0-9]+\)', '', 'g'),
  updated_at = NOW()
WHERE skills @> '["__source_type:bulk_generated_fake_orders"]'::jsonb
   OR skills @> '["__seed_marker:generated_fake_orders_v1_2026_05_05"]'::jsonb;

COMMIT;
