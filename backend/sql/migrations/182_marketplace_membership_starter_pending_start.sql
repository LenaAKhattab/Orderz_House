-- 182: Marketplace STARTER pending trial start (additive).
-- Adds starter_pending_start: entitlement owned, 10-day trial NOT started until
-- identity + training gates pass and freelancer clicks "ابدأ فترة التجربة".
-- Do NOT apply to Production until explicitly approved.

BEGIN;

ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_status_check;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_status_check
  CHECK (
    status IN (
      'pending',
      'payment_pending',
      'starter_pending_start',
      'purchased_pending_start',
      'active',
      'cancel_at_period_end',
      'suspended',
      'expired',
      'cancelled',
      'superseded'
    )
  );

ALTER TABLE freelancer_marketplace_memberships
  DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_current_status_consistency;

ALTER TABLE freelancer_marketplace_memberships
  ADD CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  CHECK (
    (
      is_current = TRUE
      AND status IN (
        'pending',
        'payment_pending',
        'starter_pending_start',
        'purchased_pending_start',
        'active',
        'cancel_at_period_end',
        'suspended'
      )
    )
    OR (
      is_current = FALSE
    )
  );

COMMENT ON CONSTRAINT freelancer_marketplace_memberships_current_status_consistency
  ON freelancer_marketplace_memberships IS
  'M1+STARTER: is_current=TRUE for pending/payment_pending/starter_pending_start/purchased_pending_start/active/cancel_at_period_end/suspended.';

INSERT INTO schema_migrations (version)
VALUES ('182_marketplace_membership_starter_pending_start')
ON CONFLICT (version) DO NOTHING;

COMMIT;
