-- 191: Legacy admin package assignment semantics
-- Additive/safe. Does NOT fake first orders or payments.
-- Allows company/admin dated entitlements WITHOUT has_first_order=true.
-- Builds on 190. Do NOT edit 189/190.

BEGIN;

-- ---------------------------------------------------------------------------
-- Relax freelancer_subscriptions_check to allow a third, scoped case:
-- admin + not_required + active/expired + dates set + has_first_order=false
-- (administrative entitlement — no real first order yet)
-- ---------------------------------------------------------------------------
ALTER TABLE freelancer_subscriptions
  DROP CONSTRAINT IF EXISTS freelancer_subscriptions_check;

ALTER TABLE freelancer_subscriptions
  ADD CONSTRAINT freelancer_subscriptions_check CHECK (
    -- Case 1: not started (no dates, no first order)
    (
      has_first_order = FALSE
      AND first_order_date IS NULL
      AND actual_start_date IS NULL
      AND expiry_date IS NULL
    )
    OR
    -- Case 2: real first-order activation (all dates + has_first_order)
    (
      has_first_order = TRUE
      AND first_order_date IS NOT NULL
      AND actual_start_date IS NOT NULL
      AND expiry_date IS NOT NULL
    )
    OR
    -- Case 3: company/admin dated entitlement WITHOUT fabricating a first order
    (
      has_first_order = FALSE
      AND first_order_date IS NULL
      AND actual_start_date IS NOT NULL
      AND expiry_date IS NOT NULL
      AND expiry_date > actual_start_date
      AND status IN ('active', 'expired')
      AND source = 'admin'
      AND payment_status = 'not_required'
    )
  );

COMMENT ON CONSTRAINT freelancer_subscriptions_check ON freelancer_subscriptions IS
  'Dates tied to has_first_order for real activations; Case 3 allows admin/company dated entitlements without faking a first order.';

-- ---------------------------------------------------------------------------
-- Repair Staging rows created by the temporary has_first_order=true workaround
-- for Legacy package assignments (no real order).
-- ---------------------------------------------------------------------------
UPDATE freelancer_subscriptions fs
   SET has_first_order = FALSE,
       first_order_date = NULL,
       updated_at = NOW()
 WHERE fs.has_first_order = TRUE
   AND fs.first_order_id IS NULL
   AND fs.source = 'admin'
   AND fs.payment_status = 'not_required'
   AND fs.actual_start_date IS NOT NULL
   AND fs.expiry_date IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM legacy_freelancer_package_assignments a
      WHERE a.subscription_id = fs.id
   );

INSERT INTO schema_migrations (version)
VALUES ('191_legacy_admin_package_semantics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
