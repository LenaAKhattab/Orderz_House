-- 193: Direct Institution relation on canonical orders
-- Additive only. Does not replace storage relations.
-- Backfill only when storage is linked to exactly one institution.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS institution_id BIGINT NULL
    REFERENCES institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_institution_id
  ON orders (institution_id)
  WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_institution_visibility
  ON orders (institution_id, visibility_scope)
  WHERE visibility_scope = 'institution' AND institution_id IS NOT NULL;

-- Deterministic backfill: storage linked to exactly one institution.
UPDATE orders o
SET institution_id = sub.institution_id
FROM (
  SELECT si.storage_id, MIN(si.institution_id) AS institution_id
  FROM institutional_storage_institutions si
  GROUP BY si.storage_id
  HAVING COUNT(*) = 1
) sub
WHERE o.institutional_storage_id = sub.storage_id
  AND o.institution_id IS NULL
  AND o.visibility_scope = 'institution';

COMMIT;

INSERT INTO schema_migrations (version)
VALUES ('193_orders_institution_id')
ON CONFLICT (version) DO NOTHING;
