-- 134: Marketplace Membership plan catalog (باقات العمل) — ADDITIVE ONLY.
-- Independent of legacy plans / plan_pages / plan_features / freelancer_subscriptions.
-- Phase 1: catalog foundation. No subscriptions, Stripe objects, tokens ledger, or public /plans cutover.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_membership_plans (
  id BIGSERIAL PRIMARY KEY,

  -- Stable identity (never key business logic off display names)
  tier_code VARCHAR(64) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NULL,
  slug VARCHAR(80) NULL,
  description_ar TEXT NULL,
  description_en TEXT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,

  -- Pricing (JOD major units; Stripe Product/Price creation is a later phase)
  monthly_price_jod NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (monthly_price_jod >= 0),
  stripe_product_id VARCHAR(255) NULL,
  stripe_price_id VARCHAR(255) NULL,
  stripe_price_amount_minor BIGINT NULL,
  stripe_price_currency VARCHAR(3) NULL DEFAULT 'JOD',

  -- REAL customer-funded order access only (fake/training must never use these fields)
  max_real_order_value_jod NUMERIC(12, 3) NULL,
  unlimited_real_order_value BOOLEAN NOT NULL DEFAULT FALSE,

  -- Structural benefit slot; Phase 1 defaults to 0 (token grants not implemented yet)
  included_tokens_per_cycle INT NOT NULL DEFAULT 0 CHECK (included_tokens_per_cycle >= 0),

  -- Cash / prepaid configuration (execution in a later phase)
  cash_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_cash_months INT NOT NULL DEFAULT 1 CHECK (minimum_cash_months >= 1),
  maximum_prepaid_months INT NOT NULL DEFAULT 1 CHECK (maximum_prepaid_months >= 1),

  -- Capability flags (Elite Direct Orders entitlement wiring is a later phase)
  elite_direct_orders_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Sale / percentage discount (base monthly_price_jod is never overwritten)
  sale_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sale_percentage NUMERIC(5, 2) NULL,
  sale_reason TEXT NULL,
  sale_reason_en TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_membership_plans_tier_code_format
    CHECK (tier_code ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT marketplace_membership_plans_real_access_consistency
    CHECK (
      (unlimited_real_order_value = TRUE AND max_real_order_value_jod IS NULL)
      OR
      (unlimited_real_order_value = FALSE AND max_real_order_value_jod IS NOT NULL AND max_real_order_value_jod > 0)
    ),
  CONSTRAINT marketplace_membership_plans_cash_months_order
    CHECK (maximum_prepaid_months >= minimum_cash_months),
  CONSTRAINT marketplace_membership_plans_sale_percentage_range
    CHECK (
      sale_percentage IS NULL
      OR (sale_percentage > 0 AND sale_percentage < 100)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_plans_tier_code_uidx
  ON marketplace_membership_plans (tier_code);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_plans_slug_uidx
  ON marketplace_membership_plans (LOWER(slug))
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_membership_plans_active_sort_idx
  ON marketplace_membership_plans (is_active, sort_order ASC, id ASC);

COMMENT ON TABLE marketplace_membership_plans IS
  'MARKETPLACE_MEMBERSHIP catalog (باقات العمل). Independent of legacy plans/plan_pages. Phase 1 catalog only.';
COMMENT ON COLUMN marketplace_membership_plans.tier_code IS
  'Stable plan identity for logic (pay_as_you_work, active, pro, elite). Never match on display name.';
COMMENT ON COLUMN marketplace_membership_plans.max_real_order_value_jod IS
  'Ceiling for REAL customer-funded orders only. Must never gate fake/training orders.';
COMMENT ON COLUMN marketplace_membership_plans.unlimited_real_order_value IS
  'When true, no real-order value ceiling (Elite). max_real_order_value_jod must be NULL.';
COMMENT ON COLUMN marketplace_membership_plans.included_tokens_per_cycle IS
  'Structural slot for future cycle grants. Phase 1 default 0; not finalized business values.';
COMMENT ON COLUMN marketplace_membership_plans.stripe_product_id IS
  'Nullable Stripe Product cache. Do not create Stripe objects in Phase 1.';
COMMENT ON COLUMN marketplace_membership_plans.stripe_price_id IS
  'Nullable Stripe Price cache. Do not create Stripe objects in Phase 1.';

-- Idempotent seed of the four initial marketplace tiers (by tier_code, not numeric id).
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug,
  description_ar, description_en,
  is_active, sort_order,
  monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled
)
VALUES
  (
    'pay_as_you_work',
    'ادفع حسب عملك',
    'Pay As You Work',
    'pay-as-you-work',
    'باقة دخول مرنة للعمل على الطلبات الحقيقية ضمن سقف قيمة محدد.',
    'Flexible entry membership for real marketplace orders within a value cap.',
    TRUE, 10,
    1.990,
    10.000, FALSE,
    0,
    FALSE, 1, 1,
    FALSE
  ),
  (
    'active',
    'Active',
    'Active',
    'active',
    'باقة نشطة بحد أعلى لقيمة الطلبات الحقيقية.',
    'Active membership with a higher real-order value ceiling.',
    TRUE, 20,
    8.990,
    25.000, FALSE,
    0,
    FALSE, 1, 1,
    FALSE
  ),
  (
    'pro',
    'Pro',
    'Pro',
    'pro',
    'باقة احترافية بحد أعلى لقيمة الطلبات الحقيقية.',
    'Pro membership with an expanded real-order value ceiling.',
    TRUE, 30,
    14.990,
    100.000, FALSE,
    0,
    FALSE, 1, 1,
    FALSE
  ),
  (
    'elite',
    'Elite',
    'Elite',
    'elite',
    'باقة Elite بوصول غير محدود لقيمة الطلبات الحقيقية وقدرة الطلب المباشر (تفعيل لاحق).',
    'Elite membership with unlimited real-order value access and direct-order capability (wiring later).',
    TRUE, 40,
    49.990,
    NULL, TRUE,
    0,
    FALSE, 1, 1,
    TRUE
  )
ON CONFLICT (tier_code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('134_marketplace_membership_plans')
ON CONFLICT (version) DO NOTHING;

COMMIT;
