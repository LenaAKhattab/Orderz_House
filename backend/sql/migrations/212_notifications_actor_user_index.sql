-- 212: index the notifications.actor_user_id foreign key (users ON DELETE SET NULL).
-- No application query filters on it, but every user deletion runs the FK action, which without an index
-- scans the whole notifications table (Staging, 2.2M rows: 6.3 s seq scan; Production ~11.6M rows / 11 GB
-- would exceed the 30 s statement timeout). Partial: only rows that have an actor.
--
-- Built CONCURRENTLY (no write lock on notifications) — this file therefore has no BEGIN/COMMIT.
-- On large databases pre-build it first with `node scripts/buildNotificationsActorIndex.js --apply`
-- (direct endpoint, no statement timeout, validity check); this migration is then an instant no-op.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_actor_user_id
  ON notifications (actor_user_id)
  WHERE actor_user_id IS NOT NULL;
