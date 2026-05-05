BEGIN;

UPDATE fake_order_templates
SET
  min_duration = GREATEST(1, CEIL((COALESCE(min_duration, 1) + COALESCE(max_duration, 1)) / 2.0)::int),
  max_duration = GREATEST(1, CEIL((COALESCE(min_duration, 1) + COALESCE(max_duration, 1)) / 2.0)::int),
  updated_at = NOW()
WHERE skills @> '["__seed_marker:generated_fake_orders_v1_2026_05_05"]'::jsonb;

COMMIT;
