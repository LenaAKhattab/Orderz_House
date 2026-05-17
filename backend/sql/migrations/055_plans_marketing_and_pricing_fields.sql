-- 055: Extended plan marketing, pricing, and activation metadata (backward compatible).

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trainings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS installment_plan JSONB NULL,
  ADD COLUMN IF NOT EXISTS offer_expires_at DATE NULL,
  ADD COLUMN IF NOT EXISTS offer_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS order_value_min_jod NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS order_value_max_jod NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS activation_requirements TEXT NULL,
  ADD COLUMN IF NOT EXISTS refund_policy TEXT NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_checkout_amount_jod NUMERIC(12, 2) NULL;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_order_value_min_jod_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_order_value_min_jod_check
  CHECK (order_value_min_jod IS NULL OR order_value_min_jod >= 0);

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_order_value_max_jod_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_order_value_max_jod_check
  CHECK (order_value_max_jod IS NULL OR order_value_max_jod >= 0);

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_stripe_checkout_amount_jod_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_stripe_checkout_amount_jod_check
  CHECK (stripe_checkout_amount_jod IS NULL OR stripe_checkout_amount_jod >= 0);

COMMENT ON COLUMN plans.features IS 'Public bullet list (includes, benefits).';
COMMENT ON COLUMN plans.trainings IS 'Training items included in the plan.';
COMMENT ON COLUMN plans.installment_plan IS 'JSON: { upfrontJod, monthlyJod, months, notes? }.';
COMMENT ON COLUMN plans.stripe_checkout_amount_jod IS 'Amount charged on Stripe self-checkout when different from price_jod.';

INSERT INTO schema_migrations (version) VALUES ('055_plans_marketing_and_pricing_fields')
ON CONFLICT (version) DO NOTHING;

COMMIT;
