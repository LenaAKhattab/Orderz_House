-- 206: Annual Plans (الباقات السنوية) — third package category on the canonical
-- marketplace membership catalog. ADDITIVE ONLY.
-- Does NOT touch existing memberships, subscriptions, payments, or bid ledgers.
-- Does NOT migrate any user onto the new plan.

BEGIN;

-- Which public package tab a plan belongs to. Existing rows stay 'marketplace'.
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS catalog_category VARCHAR(32) NOT NULL DEFAULT 'marketplace';

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_catalog_category_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_catalog_category_chk
  CHECK (catalog_category IN ('marketplace', 'annual'));

-- Calendar-month term. When set it takes precedence over cycle_duration_days.
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS entitlement_duration_months INTEGER NULL;

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_entitlement_duration_months_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_entitlement_duration_months_chk
  CHECK (
    entitlement_duration_months IS NULL
    OR (entitlement_duration_months >= 1 AND entitlement_duration_months <= 120)
  );

-- 'cycle' = monthly_bid_allowance per monthly benefit cycle (existing behaviour).
-- 'term'  = monthly_bid_allowance once for the whole entitlement (one cycle spans the term).
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS bid_allowance_scope VARCHAR(16) NOT NULL DEFAULT 'cycle';

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_bid_allowance_scope_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_bid_allowance_scope_chk
  CHECK (bid_allowance_scope IN ('cycle', 'term'));

-- Included commercial benefits shown on the card. Fulfilled by the company; no automation.
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS included_benefits JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_included_benefits_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_included_benefits_chk
  CHECK (jsonb_typeof(included_benefits) = 'array');

-- A plan must define its term one way or the other.
ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_annual_term_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_annual_term_chk
  CHECK (catalog_category <> 'annual' OR entitlement_duration_months IS NOT NULL);

COMMENT ON COLUMN marketplace_membership_plans.catalog_category IS
  '206: public package tab (marketplace = عضوية سوق أوردرز هاوس, annual = الباقات السنوية).';
COMMENT ON COLUMN marketplace_membership_plans.entitlement_duration_months IS
  '206: term length in calendar months; countdown still starts on the first real order.';
COMMENT ON COLUMN marketplace_membership_plans.bid_allowance_scope IS
  '206: cycle = allowance per monthly cycle; term = allowance once per entitlement.';
COMMENT ON COLUMN marketplace_membership_plans.included_benefits IS
  '206: [{code,labelAr,labelEn,fulfillment}] company-fulfilled benefits. Display only.';

-- Annual Basic. Price/limits are server-authoritative from this row.
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug, description_ar, description_en,
  is_active, sort_order, monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle, monthly_bid_allowance,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled, priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level,
  cycle_duration_days, daily_bid_spend_limit, project_min_value_jod,
  withdrawal_enabled, starter_earnings_mode, bid_distribution_mode, is_one_time_starter,
  catalog_category, entitlement_duration_months, bid_allowance_scope, included_benefits
) VALUES (
  'annual_basic', 'الباقة السنوية الأساسية', 'Annual Basic', 'annual-basic',
  'عضوية سنوية للعمل على أوردرز هاوس',
  'Annual OrderzHouse marketplace membership',
  TRUE, 50, 50,
  10, FALSE,
  0, 30,
  FALSE, 1, 1,
  FALSE, FALSE, 0,
  1,
  NULL, 3, 1,
  TRUE, 'standard', 'full_cycle', FALSE,
  'annual', 12, 'term',
  '[
    {"code":"content_writing_course","labelAr":"دورة كتابة المحتوى","labelEn":"Content Writing Course","fulfillment":"company_service"},
    {"code":"us_dv_lottery_application","labelAr":"التقديم على اللوتري الأمريكي","labelEn":"U.S. Diversity Visa Lottery Application Service","fulfillment":"company_service"}
  ]'::jsonb
)
ON CONFLICT (tier_code) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('206_annual_membership_plans')
ON CONFLICT (version) DO NOTHING;

COMMIT;
