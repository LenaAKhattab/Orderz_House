-- 207: Annual plan = SILVER for 12 months (product correction of 206).
-- Additive data update of the single annual_basic row only. Internal code stays annual_basic.
-- Marketplace capabilities are copied from the live canonical SILVER row; only the annual
-- overrides differ: price 50 JOD (unchanged), 12 calendar months (unchanged), 480 applications
-- for the whole entitlement, Priority Bid uses scaled to the single 12-month cycle (3 × 12),
-- and the two company-provided services (unchanged).
-- Does NOT touch memberships, payments, ledgers, or the monthly SILVER row.

BEGIN;

UPDATE marketplace_membership_plans AS a
   SET name_ar = 'SILVER — سنوية',
       name_en = 'SILVER — Annual',
       description_ar = 'SILVER لمدة 12 شهرًا.',
       description_en = 'SILVER for 12 months.',
       monthly_bid_allowance = 480,
       daily_bid_spend_limit = s.daily_bid_spend_limit,
       project_min_value_jod = s.project_min_value_jod,
       max_real_order_value_jod = s.max_real_order_value_jod,
       unlimited_real_order_value = s.unlimited_real_order_value,
       withdrawal_enabled = s.withdrawal_enabled,
       starter_earnings_mode = s.starter_earnings_mode,
       bid_distribution_mode = s.bid_distribution_mode,
       is_one_time_starter = s.is_one_time_starter,
       elite_direct_orders_enabled = s.elite_direct_orders_enabled,
       priority_bid_enabled = s.priority_bid_enabled,
       priority_bid_uses_per_cycle = s.priority_bid_uses_per_cycle * 12,
       article_access_level = s.article_access_level,
       cash_allowed = s.cash_allowed,
       included_tokens_per_cycle = s.included_tokens_per_cycle,
       updated_at = NOW()
  FROM marketplace_membership_plans AS s
 WHERE a.tier_code = 'annual_basic'
   AND s.tier_code = 'silver';

INSERT INTO schema_migrations (version)
VALUES ('207_annual_silver_plan_alignment')
ON CONFLICT (version) DO NOTHING;

COMMIT;
