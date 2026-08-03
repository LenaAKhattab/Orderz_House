-- 122: Recurring monthly freelancer plan (15 JOD) + Stripe Billing support + payment-failure holds.
-- Idempotent / additive / non-destructive. Plan keyed by stable name freelancers_monthly_paid_15.
-- Avoid dollar-quoting (DO $$) — runAllMigrations statement splitter does not support it.

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS billing_interval_count INT NULL,
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_amount_minor INT NULL;

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_billing_interval_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_billing_interval_check
  CHECK (
    billing_interval IS NULL
    OR billing_interval IN ('day', 'week', 'month', 'year')
  );

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_billing_interval_count_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_billing_interval_count_check
  CHECK (
    billing_interval_count IS NULL
    OR (billing_interval_count >= 1 AND billing_interval_count <= 36)
  );

CREATE INDEX IF NOT EXISTS idx_plans_is_recurring ON plans (is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_plans_stripe_price_id ON plans (stripe_price_id) WHERE stripe_price_id IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_stripe_customer_id
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE freelancer_subscriptions
  ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS next_renewal_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_failure_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_failure_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_failure_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_failed_stripe_invoice_id TEXT NULL;

ALTER TABLE freelancer_subscriptions DROP CONSTRAINT IF EXISTS fsub_billing_mode_check;
ALTER TABLE freelancer_subscriptions
  ADD CONSTRAINT fsub_billing_mode_check
  CHECK (
    billing_mode IS NULL
    OR billing_mode IN ('one_time', 'recurring_stripe')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fsub_stripe_subscription_id
  ON freelancer_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fsub_billing_mode ON freelancer_subscriptions (billing_mode);
CREATE INDEX IF NOT EXISTS idx_fsub_next_renewal_at ON freelancer_subscriptions (next_renewal_at);

CREATE TABLE IF NOT EXISTS freelancer_account_holds (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_code VARCHAR(80) NOT NULL,
  reason_detail TEXT NULL,
  stripe_subscription_id TEXT NULL,
  stripe_invoice_id TEXT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'stripe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ NULL,
  cleared_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  clear_reason TEXT NULL,
  clear_source VARCHAR(40) NULL,
  CONSTRAINT freelancer_account_holds_reason_check
    CHECK (reason_code IN (
      'stripe_subscription_payment_failed'
    )),
  CONSTRAINT freelancer_account_holds_source_check
    CHECK (source IN ('stripe', 'admin', 'system')),
  CONSTRAINT freelancer_account_holds_clear_source_check
    CHECK (
      clear_source IS NULL
      OR clear_source IN ('stripe', 'admin', 'system')
    )
);

CREATE INDEX IF NOT EXISTS idx_fah_freelancer_active
  ON freelancer_account_holds (freelancer_user_id)
  WHERE cleared_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fah_active_payment_fail_per_invoice
  ON freelancer_account_holds (freelancer_user_id, stripe_invoice_id)
  WHERE cleared_at IS NULL
    AND reason_code = 'stripe_subscription_payment_failed'
    AND stripe_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS freelancer_account_hold_audit (
  id BIGSERIAL PRIMARY KEY,
  hold_id BIGINT NULL REFERENCES freelancer_account_holds(id) ON DELETE SET NULL,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  actor_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fah_audit_action_check
    CHECK (action IN ('create', 'clear_stripe', 'clear_admin', 'reactivate_admin'))
);

CREATE INDEX IF NOT EXISTS idx_fah_audit_freelancer
  ON freelancer_account_hold_audit (freelancer_user_id, created_at DESC);

ALTER TABLE freelancer_subscription_checkout_sessions
  DROP CONSTRAINT IF EXISTS freelancer_subscription_checkout_sessions_checkout_kind_check;

ALTER TABLE freelancer_subscription_checkout_sessions
  ADD CONSTRAINT freelancer_subscription_checkout_sessions_checkout_kind_check
  CHECK (checkout_kind IN ('subscription', 'activation_fee_only', 'recurring_subscription'));

INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  price_intro_text, price_intro_text_en,
  is_popular, is_featured,
  is_recurring, billing_interval, billing_interval_count,
  admin_notes
)
SELECT
  'freelancers_monthly_paid_15',
  'الاشتراك الشهري المدفوع',
  'Paid Monthly Subscription',
  'اشتراك شهري متجدد يسحب تلقائياً من البطاقة كل شهر',
  'Recurring monthly subscription charged automatically to your card each month',
  30,
  15,
  NULL,
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  15,
  dp.id,
  NULL,
  'Monthly',
  'Monthly',
  'شهريًا',
  'Monthly',
  'اختر الباقة',
  'Choose Plan',
  'JOD',
  'يسحب تلقائياً من البطاقة كل شهر',
  'Charged automatically to your card every month',
  FALSE,
  FALSE,
  TRUE,
  'month',
  1,
  'Recurring Stripe Billing plan — 15 JOD / month. Product/Price IDs filled on first checkout.'
FROM plan_pages dp
WHERE dp.page_type = 'default'
  AND dp.is_active = TRUE
ORDER BY dp.id ASC
LIMIT 1
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = COALESCE(plans.plan_page_id, EXCLUDED.plan_page_id),
  subscription_plan_id = NULL,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  price_intro_text = EXCLUDED.price_intro_text,
  price_intro_text_en = EXCLUDED.price_intro_text_en,
  is_popular = EXCLUDED.is_popular,
  is_featured = EXCLUDED.is_featured,
  is_recurring = TRUE,
  billing_interval = 'month',
  billing_interval_count = 1,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_monthly_paid_15';

DELETE FROM plan_features pf
USING plans p
WHERE pf.plan_id = p.id
  AND p.name = 'freelancers_monthly_paid_15';

INSERT INTO plan_features (plan_id, feature_text, feature_text_en, sort_order, is_included)
SELECT p.id, f.feature_text, f.feature_text_en, f.sort_order, TRUE
FROM plans p
CROSS JOIN (
  VALUES
    (0, 'اشتراك شهري متجدد تلقائياً', 'Automatically renewing monthly subscription'),
    (1, 'يسحب تلقائياً من البطاقة كل شهر', 'Charged automatically to your card every month'),
    (2, '15 دينار أردني شهرياً', '15 JOD per month'),
    (3, 'إيقاف تلقائي عند تعذر السحب حتى إعادة التفعيل', 'Access freezes if renewal payment fails until reactivation')
) AS f(sort_order, feature_text, feature_text_en)
WHERE p.name = 'freelancers_monthly_paid_15'
  AND p.deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('122_freelancer_monthly_recurring_subscription')
ON CONFLICT (version) DO NOTHING;

COMMIT;
