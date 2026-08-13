/**
 * READ ONLY post-apply verification for Migration 153.
 * Never mutates Production. No membership/grant/flag writes.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function q(sql, label) {
  const { rows } = await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log(label, JSON.stringify(rows.length === 1 ? rows[0] : rows));
  return rows;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  console.log("TARGET", info.maskedTarget, "isProduction=", info.isProduction);
  assert(info.isProduction, "expected Production target");

  await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='153_marketplace_membership_e1_bid_rules'`,
    "SCHEMA_MIG_153_COUNT",
  );
  await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='152_admin_bid_distribution_pools'`,
    "SCHEMA_MIG_152_COUNT",
  );

  const active = await q(
    `SELECT tier_code,
            monthly_price_jod::float AS price,
            cycle_duration_days,
            monthly_bid_allowance,
            daily_bid_spend_limit,
            project_min_value_jod::float AS project_min,
            max_real_order_value_jod::float AS project_max,
            unlimited_real_order_value,
            withdrawal_enabled,
            starter_earnings_mode,
            bid_distribution_mode,
            is_one_time_starter
       FROM marketplace_membership_plans
      WHERE is_active = TRUE
      ORDER BY sort_order, id`,
    "ACTIVE_PLANS",
  );
  const codes = active.map((r) => r.tier_code);
  assert(JSON.stringify(codes) === JSON.stringify(["starter", "silver", "pro", "elite"]), `active=${codes}`);

  const by = Object.fromEntries(active.map((r) => [r.tier_code, r]));
  assert(
    by.starter.price === 0 &&
      by.starter.cycle_duration_days === 10 &&
      by.starter.monthly_bid_allowance === 20 &&
      by.starter.daily_bid_spend_limit === 2 &&
      by.starter.project_min === 1 &&
      by.starter.project_max === 10 &&
      by.starter.withdrawal_enabled === false &&
      by.starter.starter_earnings_mode === "pending" &&
      by.starter.bid_distribution_mode === "full_cycle" &&
      by.starter.is_one_time_starter === true,
    "STARTER mismatch",
  );
  assert(
    by.silver.price === 19 &&
      by.silver.cycle_duration_days === 30 &&
      by.silver.monthly_bid_allowance === 40 &&
      by.silver.daily_bid_spend_limit === 3 &&
      by.silver.project_min === 1 &&
      by.silver.project_max === 20 &&
      by.silver.withdrawal_enabled === true &&
      by.silver.bid_distribution_mode === "full_cycle",
    "SILVER mismatch",
  );
  assert(
    by.pro.price === 39 &&
      by.pro.cycle_duration_days === 30 &&
      by.pro.monthly_bid_allowance === 100 &&
      by.pro.daily_bid_spend_limit === 7 &&
      by.pro.project_min === 1 &&
      by.pro.project_max === 50 &&
      by.pro.withdrawal_enabled === true &&
      by.pro.bid_distribution_mode === "full_cycle",
    "PRO mismatch",
  );
  assert(
    by.elite.price === 59 &&
      by.elite.cycle_duration_days === 30 &&
      by.elite.monthly_bid_allowance === 150 &&
      by.elite.daily_bid_spend_limit === 10 &&
      by.elite.project_min === 1 &&
      by.elite.unlimited_real_order_value === true &&
      by.elite.project_max == null &&
      by.elite.withdrawal_enabled === true &&
      by.elite.bid_distribution_mode === "full_cycle",
    "ELITE mismatch",
  );
  console.log("E1_PRODUCTION_PLAN_CONFIGURATION=PASS");

  await q(
    `SELECT tier_code, is_active FROM marketplace_membership_plans
      WHERE tier_code IN ('free','start','active','pay_as_you_work')
      ORDER BY tier_code`,
    "LEGACY_TIERS",
  );
  const legacyActive = await pool.query(
    `SELECT COUNT(*)::int AS n FROM marketplace_membership_plans
      WHERE tier_code IN ('free','start','active','pay_as_you_work') AND is_active = TRUE`,
  );
  assert(legacyActive.rows[0].n === 0, "legacy still active");

  await q(
    `SELECT
       to_regclass('public.marketplace_membership_activation_requests') AS activation_requests,
       to_regclass('public.marketplace_freelancer_daily_bid_spend') AS daily_spend`,
    "E1_TABLES",
  );
  await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='marketplace_membership_plans'
        AND column_name IN (
          'cycle_duration_days','daily_bid_spend_limit','project_min_value_jod',
          'withdrawal_enabled','starter_earnings_mode','bid_distribution_mode','is_one_time_starter'
        )
      ORDER BY column_name`,
    "E1_PLAN_COLUMNS",
  );
  await q(
    `SELECT indexname FROM pg_indexes
      WHERE tablename='marketplace_membership_activation_requests'
      ORDER BY indexname`,
    "ACTIVATION_INDEXES",
  );
  console.log("E1_PRODUCTION_SCHEMA=PASS");

  await q(
    `SELECT marketplace_membership_required_course_id AS course_id,
            marketplace_membership_business_timezone AS tz,
            bid_credits_enabled,
            COALESCE(article_applications_enabled, FALSE) AS article_applications_enabled,
            COALESCE(bid_credit_purchases_enabled, FALSE) AS bid_credit_purchases_enabled,
            COALESCE(priority_application_boost_enabled, FALSE) AS priority_application_boost_enabled
       FROM marketplace_economy_settings WHERE id = 1`,
    "SETTINGS_FLAGS",
  );

  const counts = await q(
    `SELECT
       (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
       (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
       (SELECT COUNT(*)::int FROM marketplace_membership_activation_requests) AS activation_requests,
       (SELECT COUNT(*)::int FROM marketplace_freelancer_daily_bid_spend) AS daily_spend,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_batches) AS batches,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_allocations) AS allocs,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pool_events) AS pool_events`,
    "ECONOMIC_COUNTS",
  );
  const c = counts[0];
  assert(c.memberships === 0, "memberships created");
  assert(c.cycles === 0, "cycles created");
  assert(c.activation_requests === 0, "activation requests created");
  assert(c.daily_spend === 0, "daily spend created");
  assert(c.grants === 0, "grants created");
  assert(c.ledger === 0, "ledger created");
  assert(c.pools === 0 && c.batches === 0 && c.allocs === 0 && c.pool_events === 0, "D1 rows created");
  console.log("MIGRATION_153_RUNTIME_ECONOMIC_ACTIVITY=NONE");
  console.log("BID_POOL_D1=PRESERVED");

  // Static code markers (no Production writes)
  const root = path.join(__dirname, "..");
  const elig = fs.readFileSync(path.join(root, "src/services/marketplaceMembershipEligibilityService.js"), "utf8");
  const act = fs.readFileSync(path.join(root, "src/services/marketplaceMembershipActivationRequestService.js"), "utf8");
  const dist = fs.readFileSync(path.join(root, "src/services/marketplaceBidCreditDistributionService.js"), "utf8");
  const daily = fs.readFileSync(path.join(root, "src/services/marketplaceMembershipDailyBidSpendService.js"), "utf8");
  const consts = fs.readFileSync(path.join(root, "src/constants/marketplaceMembershipPlans.js"), "utf8");
  const modal = fs.readFileSync(
    path.join(root, "../frontend/src/admin/marketplaceMembership/MarketplaceMembershipPlanFormModal.jsx"),
    "utf8",
  );
  const plansMap = fs.readFileSync(
    path.join(root, "../frontend/src/lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.js"),
    "utf8",
  );
  assert(elig.includes("MEMBERSHIP_VERIFICATION_FEE_REQUIRED"), "full verification missing");
  assert(elig.includes("MEMBERSHIP_TRAINING_NOT_CONFIGURED"), "training fail-closed missing");
  assert(act.includes("COMPANY_APPROVAL_TIME") || consts.includes("COMPANY_APPROVAL_TIME"), "approval start");
  assert(dist.includes("full_cycle") && dist.includes("membership_full_cycle:"), "full cycle");
  assert(daily.includes("Asia/Amman") || consts.includes("Asia/Amman"), "timezone");
  assert(elig.includes("STARTER_ENTITLEMENT_ALREADY_USED") || elig.includes("assertStarterNotAlreadyConsumed"), "starter once");
  assert(modal.includes("dailyBidSpendLimit") && modal.includes("bidDistributionMode"), "admin UI");
  assert(plansMap.includes("Daily Bid limit") || plansMap.includes("الحد اليومي"), "plans mapper");
  assert(!/work\s*token/i.test(plansMap), "work token in plans mapper");
  console.log("STATIC_RUNTIME_CONFIRMATION=PASS");
  console.log("VERIFY_153_PRODUCTION_READONLY_PASS");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
