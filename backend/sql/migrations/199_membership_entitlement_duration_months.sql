-- 199: Persist marketplace membership duration before the first real order.
-- Additive. Does not rewrite dates, payments, or existing rows.

BEGIN;

ALTER TABLE freelancer_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_duration_months INTEGER NULL;

ALTER TABLE freelancer_subscriptions
  DROP CONSTRAINT IF EXISTS freelancer_subscriptions_entitlement_duration_chk;

ALTER TABLE freelancer_subscriptions
  ADD CONSTRAINT freelancer_subscriptions_entitlement_duration_chk
  CHECK (
    entitlement_duration_months IS NULL
    OR (entitlement_duration_months >= 1 AND entitlement_duration_months <= 120)
  );

COMMENT ON COLUMN freelancer_subscriptions.entitlement_duration_months IS
  'Admin-assigned membership length in months. Countdown still starts only on the first real order; start and expiry stay NULL until then.';

INSERT INTO schema_migrations (version)
VALUES ('199_membership_entitlement_duration_months')
ON CONFLICT (version) DO NOTHING;

COMMIT;
