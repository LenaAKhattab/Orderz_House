-- Migration 153: Marketplace Membership E1 — STARTER/SILVER/PRO/ELITE rules foundation
-- Additive catalog + activation-request + daily spend counter + plan capability columns.
-- Does NOT activate memberships, grant Bids, enable engines, or backfill economics.
-- DO NOT APPLY until owner review.

BEGIN;

-- ---------------------------------------------------------------------------
-- Plan capability columns (canonical commercial config)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS cycle_duration_days INTEGER NULL;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS daily_bid_spend_limit INTEGER NULL;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS project_min_value_jod NUMERIC(12, 3) NULL;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS withdrawal_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS starter_earnings_mode VARCHAR(32) NULL;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS bid_distribution_mode VARCHAR(32) NOT NULL DEFAULT 'progressive_daily';

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS is_one_time_starter BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_cycle_duration_days_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_cycle_duration_days_chk
  CHECK (cycle_duration_days IS NULL OR cycle_duration_days >= 1);

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_daily_bid_spend_limit_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_daily_bid_spend_limit_chk
  CHECK (daily_bid_spend_limit IS NULL OR daily_bid_spend_limit >= 0);

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_project_min_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_project_min_chk
  CHECK (project_min_value_jod IS NULL OR project_min_value_jod >= 0);

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_starter_earnings_mode_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_starter_earnings_mode_chk
  CHECK (
    starter_earnings_mode IS NULL
    OR starter_earnings_mode IN ('pending', 'standard')
  );

ALTER TABLE marketplace_membership_plans
  DROP CONSTRAINT IF EXISTS marketplace_membership_plans_bid_distribution_mode_chk;
ALTER TABLE marketplace_membership_plans
  ADD CONSTRAINT marketplace_membership_plans_bid_distribution_mode_chk
  CHECK (bid_distribution_mode IN ('progressive_daily', 'full_cycle'));

COMMENT ON COLUMN marketplace_membership_plans.cycle_duration_days IS
  'E1: membership cycle length in days from company approval / Starter activation.';
COMMENT ON COLUMN marketplace_membership_plans.daily_bid_spend_limit IS
  'E1: max Bid-requiring opportunities spendable per business day (not a daily refill).';
COMMENT ON COLUMN marketplace_membership_plans.bid_distribution_mode IS
  'E1: full_cycle = grant entire monthly_bid_allowance on activation; progressive_daily = legacy B3.';
COMMENT ON COLUMN marketplace_membership_plans.starter_earnings_mode IS
  'E1: pending = Starter earnings held non-withdrawable until upgrade rules (E2/E3 detail).';
COMMENT ON COLUMN marketplace_membership_plans.project_min_value_jod IS
  'E1: minimum real-order project value (JOD). Max remains max_real_order_value_jod / unlimited.';

-- ---------------------------------------------------------------------------
-- Economy: required training course for paid activation (nullable = unset)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS marketplace_membership_required_course_id BIGINT NULL;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS marketplace_membership_business_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Amman';

COMMENT ON COLUMN marketplace_economy_settings.marketplace_membership_required_course_id IS
  'E1: when set, paid membership activation requests require course_assignments.completed_at for this course.';
COMMENT ON COLUMN marketplace_economy_settings.marketplace_membership_business_timezone IS
  'E1: IANA timezone for daily Bid spend day boundaries (default Asia/Amman).';

-- ---------------------------------------------------------------------------
-- Activation requests (paid: waiting company approval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_membership_activation_requests (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CONSTRAINT marketplace_membership_activation_requests_status_chk
      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  payment_recorded_at TIMESTAMPTZ NULL,
  training_completed_at TIMESTAMPTZ NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL,
  approved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ NULL,
  rejected_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT NULL,
  activated_membership_id BIGINT NULL
    REFERENCES freelancer_marketplace_memberships(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_membership_activation_requests_pending_uidx
  ON marketplace_membership_activation_requests (freelancer_user_id, marketplace_plan_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS marketplace_membership_activation_requests_status_idx
  ON marketplace_membership_activation_requests (status, requested_at DESC);

COMMENT ON TABLE marketplace_membership_activation_requests IS
  'E1: Freelancer activation requests. Paid period starts only on company approval (approved_at).';

-- ---------------------------------------------------------------------------
-- Daily Bid spend counter (transactional; business-date keyed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_freelancer_daily_bid_spend (
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  spend_date DATE NOT NULL,
  amount_spent INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_freelancer_daily_bid_spend_amt_chk CHECK (amount_spent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (freelancer_user_id, spend_date)
);

COMMENT ON TABLE marketplace_freelancer_daily_bid_spend IS
  'E1: authoritative daily Bid opportunity spend counter. Limit enforced in-app under row lock.';

-- ---------------------------------------------------------------------------
-- Catalog cutover: deactivate legacy FREE/START/ACTIVE; upsert E1 four plans
-- Historical rows retained (is_active=false). Zero memberships on Production.
-- ---------------------------------------------------------------------------
UPDATE marketplace_membership_plans
   SET is_active = FALSE, updated_at = NOW()
 WHERE tier_code IN ('free', 'start', 'active', 'pay_as_you_work');

-- STARTER
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug, description_ar, description_en,
  is_active, sort_order, monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle, monthly_bid_allowance,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled, priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level,
  cycle_duration_days, daily_bid_spend_limit, project_min_value_jod,
  withdrawal_enabled, starter_earnings_mode, bid_distribution_mode, is_one_time_starter
) VALUES (
  'starter', 'ستارتر', 'Starter', 'starter',
  'عضوية مجانية لمدة 10 أيام بعد التحقق. 20 عرض للدورة، حد يومي 2، مشاريع حتى 10 د.أ، السحب متوقف.',
  'Free 10-day membership after verification. 20 cycle Bids, daily limit 2, projects up to 10 JOD, withdrawal disabled.',
  TRUE, 10, 0,
  10, FALSE,
  0, 20,
  FALSE, 1, 1,
  FALSE, FALSE, 0,
  1,
  10, 2, 1,
  FALSE, 'pending', 'full_cycle', TRUE
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
  included_tokens_per_cycle = 0,
  monthly_bid_allowance = EXCLUDED.monthly_bid_allowance,
  cycle_duration_days = EXCLUDED.cycle_duration_days,
  daily_bid_spend_limit = EXCLUDED.daily_bid_spend_limit,
  project_min_value_jod = EXCLUDED.project_min_value_jod,
  withdrawal_enabled = EXCLUDED.withdrawal_enabled,
  starter_earnings_mode = EXCLUDED.starter_earnings_mode,
  bid_distribution_mode = EXCLUDED.bid_distribution_mode,
  is_one_time_starter = EXCLUDED.is_one_time_starter,
  updated_at = NOW();

-- SILVER
INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug, description_ar, description_en,
  is_active, sort_order, monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle, monthly_bid_allowance,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled, priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level,
  cycle_duration_days, daily_bid_spend_limit, project_min_value_jod,
  withdrawal_enabled, starter_earnings_mode, bid_distribution_mode, is_one_time_starter
) VALUES (
  'silver', 'فضة', 'Silver', 'silver',
  '19 د.أ / 30 يوم. 40 عرض، حد يومي 3، مشاريع حتى 20 د.أ، السحب مفعّل بعد موافقة الشركة.',
  '19 JOD / 30 days. 40 Bids, daily limit 3, projects up to 20 JOD, withdrawal enabled after company approval.',
  TRUE, 20, 19,
  20, FALSE,
  0, 40,
  TRUE, 1, 12,
  FALSE, TRUE, 3,
  2,
  30, 3, 1,
  TRUE, 'standard', 'full_cycle', FALSE
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
  included_tokens_per_cycle = 0,
  monthly_bid_allowance = EXCLUDED.monthly_bid_allowance,
  cycle_duration_days = EXCLUDED.cycle_duration_days,
  daily_bid_spend_limit = EXCLUDED.daily_bid_spend_limit,
  project_min_value_jod = EXCLUDED.project_min_value_jod,
  withdrawal_enabled = EXCLUDED.withdrawal_enabled,
  starter_earnings_mode = EXCLUDED.starter_earnings_mode,
  bid_distribution_mode = EXCLUDED.bid_distribution_mode,
  is_one_time_starter = EXCLUDED.is_one_time_starter,
  cash_allowed = EXCLUDED.cash_allowed,
  updated_at = NOW();

-- PRO (update in place if exists)
UPDATE marketplace_membership_plans SET
  name_ar = 'برو',
  name_en = 'Pro',
  slug = COALESCE(slug, 'pro'),
  description_ar = '39 د.أ / 30 يوم. 100 عرض، حد يومي 7، مشاريع حتى 50 د.أ، السحب مفعّل.',
  description_en = '39 JOD / 30 days. 100 Bids, daily limit 7, projects up to 50 JOD, withdrawal enabled.',
  is_active = TRUE,
  sort_order = 30,
  monthly_price_jod = 39,
  max_real_order_value_jod = 50,
  unlimited_real_order_value = FALSE,
  included_tokens_per_cycle = 0,
  monthly_bid_allowance = 100,
  cycle_duration_days = 30,
  daily_bid_spend_limit = 7,
  project_min_value_jod = 1,
  withdrawal_enabled = TRUE,
  starter_earnings_mode = 'standard',
  bid_distribution_mode = 'full_cycle',
  is_one_time_starter = FALSE,
  cash_allowed = TRUE,
  updated_at = NOW()
WHERE tier_code = 'pro';

INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug, description_ar, description_en,
  is_active, sort_order, monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle, monthly_bid_allowance,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled, priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level,
  cycle_duration_days, daily_bid_spend_limit, project_min_value_jod,
  withdrawal_enabled, starter_earnings_mode, bid_distribution_mode, is_one_time_starter
)
SELECT
  'pro', 'برو', 'Pro', 'pro',
  '39 د.أ / 30 يوم. 100 عرض، حد يومي 7، مشاريع حتى 50 د.أ، السحب مفعّل.',
  '39 JOD / 30 days. 100 Bids, daily limit 7, projects up to 50 JOD, withdrawal enabled.',
  TRUE, 30, 39,
  50, FALSE,
  0, 100,
  TRUE, 1, 12,
  FALSE, TRUE, 5,
  3,
  30, 7, 1,
  TRUE, 'standard', 'full_cycle', FALSE
WHERE NOT EXISTS (SELECT 1 FROM marketplace_membership_plans WHERE tier_code = 'pro');

-- ELITE
UPDATE marketplace_membership_plans SET
  name_ar = 'إيليت',
  name_en = 'Elite',
  slug = COALESCE(slug, 'elite'),
  description_ar = '59 د.أ / 30 يوم. 150 عرض، حد يومي 10، مشاريع من 1 د.أ بلا حد أعلى، السحب مفعّل.',
  description_en = '59 JOD / 30 days. 150 Bids, daily limit 10, projects from 1 JOD with no upper limit, withdrawal enabled.',
  is_active = TRUE,
  sort_order = 40,
  monthly_price_jod = 59,
  max_real_order_value_jod = NULL,
  unlimited_real_order_value = TRUE,
  included_tokens_per_cycle = 0,
  monthly_bid_allowance = 150,
  cycle_duration_days = 30,
  daily_bid_spend_limit = 10,
  project_min_value_jod = 1,
  withdrawal_enabled = TRUE,
  starter_earnings_mode = 'standard',
  bid_distribution_mode = 'full_cycle',
  is_one_time_starter = FALSE,
  cash_allowed = TRUE,
  elite_direct_orders_enabled = TRUE,
  updated_at = NOW()
WHERE tier_code = 'elite';

INSERT INTO marketplace_membership_plans (
  tier_code, name_ar, name_en, slug, description_ar, description_en,
  is_active, sort_order, monthly_price_jod,
  max_real_order_value_jod, unlimited_real_order_value,
  included_tokens_per_cycle, monthly_bid_allowance,
  cash_allowed, minimum_cash_months, maximum_prepaid_months,
  elite_direct_orders_enabled, priority_bid_enabled, priority_bid_uses_per_cycle,
  article_access_level,
  cycle_duration_days, daily_bid_spend_limit, project_min_value_jod,
  withdrawal_enabled, starter_earnings_mode, bid_distribution_mode, is_one_time_starter
)
SELECT
  'elite', 'إيليت', 'Elite', 'elite',
  '59 د.أ / 30 يوم. 150 عرض، حد يومي 10، مشاريع من 1 د.أ بلا حد أعلى، السحب مفعّل.',
  '59 JOD / 30 days. 150 Bids, daily limit 10, projects from 1 JOD with no upper limit, withdrawal enabled.',
  TRUE, 40, 59,
  NULL, TRUE,
  0, 150,
  TRUE, 1, 12,
  TRUE, TRUE, 10,
  5,
  30, 10, 1,
  TRUE, 'standard', 'full_cycle', FALSE
WHERE NOT EXISTS (SELECT 1 FROM marketplace_membership_plans WHERE tier_code = 'elite');

INSERT INTO schema_migrations (version)
VALUES ('153_marketplace_membership_e1_bid_rules')
ON CONFLICT (version) DO NOTHING;

COMMIT;
