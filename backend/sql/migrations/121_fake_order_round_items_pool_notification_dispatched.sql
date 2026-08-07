-- 121_fake_order_round_items_pool_notification_dispatched
-- Tracks completed pool-entry notification fan-out per round item.
-- Rollout safety: pre-existing items are marked dispatched so deploy does not
-- flood freelancers with notifications for orders already visible in the pool.

BEGIN;

ALTER TABLE fake_order_round_items
  ADD COLUMN IF NOT EXISTS pool_notification_dispatched_at TIMESTAMPTZ NULL;

-- Existing / already-visible inventory at deploy time: treat as already processed.
UPDATE fake_order_round_items
SET pool_notification_dispatched_at = COALESCE(pool_notification_dispatched_at, NOW())
WHERE pool_notification_dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fake_round_items_pool_notify_due
  ON fake_order_round_items (visible_from, id)
  WHERE pool_notification_dispatched_at IS NULL AND status = 'active';

INSERT INTO schema_migrations (version)
VALUES ('121_fake_order_round_items_pool_notification_dispatched')
ON CONFLICT (version) DO NOTHING;

COMMIT;
