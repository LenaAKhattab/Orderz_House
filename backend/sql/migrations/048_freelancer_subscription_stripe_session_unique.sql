-- Ensures one Stripe Checkout Session id maps to at most one freelancer subscription row.
--
-- If this migration fails with a unique violation, find duplicates before re-running:
--   SELECT stripe_session_id, COUNT(*) AS n
--   FROM freelancer_subscriptions
--   WHERE stripe_session_id IS NOT NULL
--   GROUP BY stripe_session_id
--   HAVING COUNT(*) > 1;
-- Resolve rows (e.g. clear or fix stale stripe_session_id on non-current rows) then apply again.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_freelancer_subscriptions_stripe_session_id
  ON freelancer_subscriptions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('048_freelancer_subscription_stripe_session_unique')
ON CONFLICT (version) DO NOTHING;

COMMIT;
