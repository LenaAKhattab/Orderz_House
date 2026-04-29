-- 034_fake_orders_split_phase1_backup_and_copy
-- Phase 1 (safe): backup + create fake_orders + copy fake rows.
-- No runtime behavior switch in this migration.

BEGIN;

-- 1) Safety backup snapshot before split.
CREATE TABLE IF NOT EXISTS orders_backup_before_fake_split AS
SELECT *
FROM orders
WHERE 1 = 0;

INSERT INTO orders_backup_before_fake_split
SELECT o.*
FROM orders o
WHERE NOT EXISTS (
  SELECT 1
  FROM orders_backup_before_fake_split b
  WHERE b.id = o.id
);

-- 2) Create fake_orders table with same structure/index defaults as orders.
CREATE TABLE IF NOT EXISTS fake_orders (LIKE orders INCLUDING ALL);

-- 3) Copy fake orders from orders -> fake_orders (id preserved).
INSERT INTO fake_orders
SELECT o.*
FROM orders o
WHERE COALESCE(o.is_fake, FALSE) = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM fake_orders f WHERE f.id = o.id
  );

INSERT INTO schema_migrations (version)
SELECT '034_fake_orders_split_phase1_backup_and_copy'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '034_fake_orders_split_phase1_backup_and_copy'
);

COMMIT;
