-- 060: Hard-delete duplicate ORDERZHOUSE plan rows (ids 13, 14, 15).
-- Remaps freelancer_subscriptions to canonical ids 1, 2, 3 first.

BEGIN;

-- Move subscriptions off duplicate catalog rows onto pinned plans 1–3.
UPDATE freelancer_subscriptions fs
SET
  plan_id = CASE
    WHEN dup.name LIKE 'orderzhouse_free%' THEN 1
    WHEN dup.name LIKE 'orderzhouse_50_jod%' THEN 2
    WHEN dup.name LIKE 'orderzhouse_platinum%' THEN 3
    ELSE fs.plan_id
  END,
  updated_at = NOW()
FROM plans dup
WHERE dup.id = fs.plan_id
  AND dup.id IN (13, 14, 15);

-- Remove any rows still pointing at duplicates (non-orderzhouse orphans only).
DELETE FROM freelancer_subscriptions
WHERE plan_id IN (13, 14, 15);

DELETE FROM fake_order_settings_plans
WHERE plan_id IN (13, 14, 15);

DELETE FROM fake_order_round_plans
WHERE plan_id IN (13, 14, 15);

DELETE FROM plans
WHERE id IN (13, 14, 15);

COMMIT;

INSERT INTO schema_migrations (version)
VALUES ('060_hard_delete_duplicate_plans_13_14_15')
ON CONFLICT (version) DO NOTHING;
