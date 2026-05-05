SELECT COUNT(*)::int AS matched
FROM fake_order_templates
WHERE skills @> '["__seed_marker:generated_fake_orders_v1_2026_05_05"]'::jsonb;

SELECT COUNT(*)::int AS ranged_left
FROM fake_order_templates
WHERE skills @> '["__seed_marker:generated_fake_orders_v1_2026_05_05"]'::jsonb
  AND min_duration <> max_duration;

SELECT id, title, min_duration, max_duration
FROM fake_order_templates
WHERE skills @> '["__seed_marker:generated_fake_orders_v1_2026_05_05"]'::jsonb
ORDER BY id DESC
LIMIT 5;
