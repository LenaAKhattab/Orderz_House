-- Migration 120: Remove institutional storage "completed" status.
-- Completing a storage is retired; migrate existing rows to paused (non-destructive).
-- Does not touch order/batch month statuses that also use the word "completed".

BEGIN;

UPDATE institutional_order_storages
SET status = 'paused', updated_at = NOW()
WHERE status = 'completed';

ALTER TABLE institutional_order_storages
  DROP CONSTRAINT IF EXISTS institutional_order_storages_status_check;

ALTER TABLE institutional_order_storages
  ADD CONSTRAINT institutional_order_storages_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'archived'));

COMMIT;
