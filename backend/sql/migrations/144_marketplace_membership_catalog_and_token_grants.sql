-- 144: Marketplace Membership Phase A1 — catalog + article_access_level + cycle token grant uniqueness.
-- Additive / catalog update for NEW Marketplace Membership plans only.
--
-- Does NOT:
--   credit Work Tokens
--   create wallets / memberships / cycles
--   touch legacy plans / freelancer_subscriptions / plan_pages
--   enable any economy engine
--   implement Article Competition tables

BEGIN;

-- =========================================================
-- Article access level capability (foundation only)
-- =========================================================
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS article_access_level INTEGER NOT NULL DEFAULT 1;

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_article_access_level_chk;

ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_article_access_level_chk
  CHECK (article_access_level >= 1 AND article_access_level <= 5);

COMMENT ON COLUMN marketplace_membership_plans.article_access_level IS
  'Phase A1: stable Article access level 1..5 (FREE=1 .. ELITE=5). Article Competition rules are later.';

-- =========================================================
-- Preserve legacy Marketplace tier row (do not rename/delete)
-- =========================================================
UPDATE marketplace_membership_plans
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE tier_code = 'pay_as_you_work'
  AND is_active = TRUE;

-- =========================================================
-- Approved catalog upsert (NEW Marketplace Membership only)
-- =========================================================

-- FREE
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug,
  description_ar, description_en,
  is_active, sort_order,
  monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled,
  priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level
) VALUES (
  'free', 'مجاني', 'Free', 'free',
  'باقة مجانية بدون رصيد عملات عمل دوري.',
  'Free membership with zero recurring Work Tokens.',
  TRUE, 5,
  0.000,
  5.000, FALSE,
  0,
  FALSE, 1, 1,
  FALSE,
  FALSE, 0,
  1
)
ON CONFLICT (tier_code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  slug = EXCLUDED.slug,
  description_ar = EXCLUDED.description_ar,
  description_en = EXCLUDED.description_en,
  is_active = TRUE,
  sort_order = EXCLUDED.sort_order,
  monthly_price_jod = EXCLUDED.monthly_price_jod,
  max_real_order_value_jod = EXCLUDED.max_real_order_value_jod,
  unlimited_real_order_value = EXCLUDED.unlimited_real_order_value,
  included_tokens_per_cycle = EXCLUDED.included_tokens_per_cycle,
  elite_direct_orders_enabled = FALSE,
  priority_bid_enabled = EXCLUDED.priority_bid_enabled,
  priority_bid_uses_per_cycle = EXCLUDED.priority_bid_uses_per_cycle,
  article_access_level = EXCLUDED.article_access_level,
  updated_at = NOW();

-- START
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug,
  description_ar, description_en,
  is_active, sort_order,
  monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled,
  priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level
) VALUES (
  'start', 'ابدأ', 'Start', 'start',
  'باقة بدء مع 100 عملة عمل لكل دورة عضوية.',
  'Start membership with 100 Work Tokens per membership cycle.',
  TRUE, 15,
  24.990,
  15.000, FALSE,
  100,
  FALSE, 1, 1,
  FALSE,
  TRUE, 1,
  2
)
ON CONFLICT (tier_code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  slug = EXCLUDED.slug,
  description_ar = EXCLUDED.description_ar,
  description_en = EXCLUDED.description_en,
  is_active = TRUE,
  sort_order = EXCLUDED.sort_order,
  monthly_price_jod = EXCLUDED.monthly_price_jod,
  max_real_order_value_jod = EXCLUDED.max_real_order_value_jod,
  unlimited_real_order_value = EXCLUDED.unlimited_real_order_value,
  included_tokens_per_cycle = EXCLUDED.included_tokens_per_cycle,
  elite_direct_orders_enabled = FALSE,
  priority_bid_enabled = EXCLUDED.priority_bid_enabled,
  priority_bid_uses_per_cycle = EXCLUDED.priority_bid_uses_per_cycle,
  article_access_level = EXCLUDED.article_access_level,
  updated_at = NOW();

-- ACTIVE
UPDATE marketplace_membership_plans
SET
  name_ar = 'Active',
  name_en = 'Active',
  slug = COALESCE(slug, 'active'),
  description_ar = 'باقة Active مع 220 عملة عمل لكل دورة عضوية.',
  description_en = 'Active membership with 220 Work Tokens per membership cycle.',
  is_active = TRUE,
  sort_order = 20,
  monthly_price_jod = 44.990,
  max_real_order_value_jod = 25.000,
  unlimited_real_order_value = FALSE,
  included_tokens_per_cycle = 220,
  elite_direct_orders_enabled = FALSE,
  article_access_level = 3,
  updated_at = NOW()
WHERE tier_code = 'active';

-- PRO
UPDATE marketplace_membership_plans
SET
  name_ar = 'Pro',
  name_en = 'Pro',
  slug = COALESCE(slug, 'pro'),
  description_ar = 'باقة Pro مع 420 عملة عمل لكل دورة عضوية.',
  description_en = 'Pro membership with 420 Work Tokens per membership cycle.',
  is_active = TRUE,
  sort_order = 30,
  monthly_price_jod = 79.990,
  max_real_order_value_jod = 100.000,
  unlimited_real_order_value = FALSE,
  included_tokens_per_cycle = 420,
  elite_direct_orders_enabled = FALSE,
  article_access_level = 4,
  updated_at = NOW()
WHERE tier_code = 'pro';

-- ELITE (preserve elite_direct_orders_enabled = TRUE and existing PB uses)
UPDATE marketplace_membership_plans
SET
  name_ar = 'Elite',
  name_en = 'Elite',
  slug = COALESCE(slug, 'elite'),
  description_ar = 'باقة Elite مع 700 عملة عمل لكل دورة وطلبات Elite Direct.',
  description_en = 'Elite membership with 700 Work Tokens per cycle and Elite Direct Orders.',
  is_active = TRUE,
  sort_order = 40,
  monthly_price_jod = 119.990,
  max_real_order_value_jod = NULL,
  unlimited_real_order_value = TRUE,
  included_tokens_per_cycle = 700,
  elite_direct_orders_enabled = TRUE,
  article_access_level = 5,
  updated_at = NOW()
WHERE tier_code = 'elite';

-- =========================================================
-- DB invariant: at most one MEMBERSHIP_CYCLE_GRANT per cycle reference
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS work_token_ledger_membership_cycle_grant_uidx
  ON work_token_ledger_entries (reference_type, reference_id)
  WHERE event_type = 'MEMBERSHIP_CYCLE_GRANT'
    AND reference_type = 'marketplace_membership_cycle';

COMMENT ON INDEX work_token_ledger_membership_cycle_grant_uidx IS
  'Phase A1: one included Work Token grant per Marketplace Membership cycle. No historical backfill.';

INSERT INTO schema_migrations (version)
VALUES ('144_marketplace_membership_catalog_and_token_grants')
ON CONFLICT (version) DO NOTHING;

COMMIT;
