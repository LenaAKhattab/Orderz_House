-- 084_delete_abandoned_stripe_pending_subscriptions
-- Removes legacy unpaid Stripe checkout placeholder rows (NOT real subscriptions).
-- Does NOT convert pending rows to free plans.
--
-- After this migration, run default-free fallback for affected freelancers:
--   CONFIRM_STRIPE_PENDING_CLEANUP=true node scripts/cleanupAbandonedStripePendingSubscriptions.js --bootstrap-only --freelancer-ids=<ids>
-- Or use the combined script (preferred for preview + bootstrap in one step):
--   node scripts/cleanupAbandonedStripePendingSubscriptions.js --dry-run
--   CONFIRM_STRIPE_PENDING_CLEANUP=true node scripts/cleanupAbandonedStripePendingSubscriptions.js --apply

BEGIN;

DELETE FROM freelancer_subscriptions
WHERE payment_status = 'pending'
  AND source = 'stripe'
  AND paid_at IS NULL
  AND first_order_id IS NULL
  AND COALESCE(has_first_order, FALSE) = FALSE
  AND (stripe_payment_intent_id IS NULL OR TRIM(stripe_payment_intent_id) = '')
  AND created_at < NOW() - INTERVAL '24 hours';

INSERT INTO schema_migrations (version)
VALUES ('084_delete_abandoned_stripe_pending_subscriptions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
