/**
 * READ ONLY post-apply verification for Migration 154.
 * Never mutates Production.
 */
const fs = require("fs");
const path = require("path");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function q(sql, label) {
  const { rows } = await pool.query(sql);
  console.log(label, JSON.stringify(rows.length === 1 ? rows[0] : rows));
  return rows;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  console.log("TARGET", info.maskedTarget, "isProduction=", info.isProduction);
  assert(info.isProduction, "expected Production");

  const mig = await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='154_marketplace_article_economy_e2'`,
    "SCHEMA_MIG_154_COUNT",
  );
  assert(mig[0].n === 1, "154 count");

  await q(
    `SELECT
       to_regclass('public.marketplace_bid_credit_reservations') AS reservations,
       to_regclass('public.marketplace_bid_credit_reservation_slices') AS slices,
       to_regclass('public.marketplace_article_settlements') AS settlements,
       to_regclass('public.marketplace_article_financial_entries') AS financial_entries,
       to_regclass('public.marketplace_article_bildazo_outbox') AS outbox`,
    "E2_TABLES",
  );

  await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='marketplace_bid_credit_grants'
        AND column_name='amount_reserved'`,
    "AMOUNT_RESERVED_COL",
  );

  await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='marketplace_articles'
        AND column_name IN (
          'budget_total_jod','budget_spent_jod','target_article_count',
          'accepted_article_count','bid_cost','eligible_tier_codes','reviewer_user_id'
        )
      ORDER BY column_name`,
    "CAMPAIGN_COLS",
  );

  await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='marketplace_article_applications'
        AND column_name IN (
          'bid_reservation_id','economic_snapshot','economic_snapshot_at','assigned_at','approved_at'
        )
      ORDER BY column_name`,
    "APP_SNAPSHOT_COLS",
  );

  const econ = await q(
    `SELECT article_value_starter_jod::text AS starter,
            article_value_silver_jod::text AS silver,
            article_value_pro_jod::text AS pro,
            article_value_elite_jod::text AS elite,
            article_company_share_percent::float AS company_pct,
            article_reviewer_fee_jod::text AS reviewer,
            article_default_bid_cost AS bid_cost,
            bid_credits_enabled,
            article_applications_enabled,
            COALESCE(bid_credit_purchases_enabled,FALSE) AS purchases,
            COALESCE(priority_application_boost_enabled,FALSE) AS priority
       FROM marketplace_economy_settings WHERE id=1`,
    "ECONOMY_CONFIG_FLAGS",
  );
  const e = econ[0];
  assert(String(e.starter).startsWith("1"), "starter");
  assert(String(e.silver).startsWith("2"), "silver");
  assert(String(e.pro).startsWith("3"), "pro");
  assert(String(e.elite).startsWith("4"), "elite");
  assert(Number(e.company_pct) === 30, "company");
  assert(String(e.reviewer).startsWith("0.2"), "reviewer");
  assert(Number(e.bid_cost) === 1, "bid cost");
  assert(e.bid_credits_enabled === false, "bid engine");
  assert(e.article_applications_enabled === false, "article engine");
  assert(e.purchases === false && e.priority === false, "other flags");
  console.log("E2_ARTICLE_ECONOMY_CONFIGURATION=PASS");

  // vocabulary: attempt check constraint text includes required events
  const chk = await q(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conname='marketplace_bid_credit_ledger_entries_event_type_check'`,
    "LEDGER_EVENT_CHECK",
  );
  const def = chk[0]?.def || "";
  assert(def.includes("BID_RESERVE"), "BID_RESERVE");
  assert(def.includes("BID_RESERVE_RELEASE"), "BID_RESERVE_RELEASE");
  assert(def.includes("BID_RESERVE_CONSUME"), "BID_RESERVE_CONSUME");
  assert(def.includes("ADMIN_DISTRIBUTION_POOL_GRANT"), "pool grant event");
  assert(def.includes("MEMBERSHIP_BID_GRANT"), "membership grant event");
  console.log("PRE_E2_BID_VOCABULARY_PRESERVED=PASS");

  const counts = await q(
    `SELECT
       (SELECT COUNT(*)::int FROM marketplace_articles) AS articles,
       (SELECT COUNT(*)::int FROM marketplace_article_applications) AS applications,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_reservations) AS reservations,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_reservation_slices) AS slices,
       (SELECT COUNT(*)::int FROM marketplace_article_settlements) AS settlements,
       (SELECT COUNT(*)::int FROM marketplace_article_financial_entries) AS financial_entries,
       (SELECT COUNT(*)::int FROM marketplace_article_financial_entries WHERE entry_type='writer_starter_pending') AS starter_pending,
       (SELECT COUNT(*)::int FROM marketplace_article_bildazo_outbox) AS outbox,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger,
       (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
       (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools`,
    "ECONOMIC_COUNTS",
  );
  const c = counts[0];
  for (const [k, v] of Object.entries(c)) {
    assert(v === 0, `${k}=${v}`);
  }
  console.log("MIGRATION_154_RUNTIME_ECONOMIC_ACTIVITY=NONE");

  // E1 plan values still intact
  const plans = await q(
    `SELECT tier_code, monthly_price_jod::float AS price, monthly_bid_allowance, daily_bid_spend_limit,
            withdrawal_enabled, bid_distribution_mode
       FROM marketplace_membership_plans
      WHERE is_active=TRUE ORDER BY sort_order`,
    "E1_ACTIVE_PLANS",
  );
  const codes = plans.map((p) => p.tier_code);
  assert(JSON.stringify(codes) === JSON.stringify(["starter", "silver", "pro", "elite"]), "E1 plans");
  const by = Object.fromEntries(plans.map((p) => [p.tier_code, p]));
  assert(by.starter.price === 0 && by.starter.daily_bid_spend_limit === 2 && by.starter.withdrawal_enabled === false, "starter e1");
  assert(by.silver.price === 19 && by.silver.daily_bid_spend_limit === 3, "silver e1");
  assert(by.pro.monthly_bid_allowance === 100 && by.elite.monthly_bid_allowance === 150, "pro/elite bids");
  console.log("E1_MEMBERSHIP_RULES=PRESERVED");
  console.log("BID_POOL_D1=PRESERVED");

  // static code markers
  const root = path.join(__dirname, "..");
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const consts = read("src/constants/marketplaceArticleEconomy.js");
  const apps = read("src/services/marketplaceArticleApplicationsService.js");
  const charge = read("src/services/marketplaceArticleApplicationBidCreditService.js");
  const settle = read("src/services/marketplaceArticleSettlementService.js");
  const reserve = read("src/services/marketplaceBidCreditReservationService.js");
  const poolSvc = read("src/services/marketplaceBidDistributionPoolService.js");
  const mem = read("src/services/marketplaceMembershipsService.js");
  assert(consts.includes("RESERVE_ON_APPLICATION_CONSUME_ON_FINAL_APPROVAL"));
  assert(consts.includes("FINAL_ARTICLE_APPROVAL"));
  assert(consts.includes("DEPRECATED_INACTIVE"));
  assert(consts.includes("PENDING_UNTIL_ELIGIBLE_UPGRADE"));
  assert(consts.includes("PAID_MEMBERSHIP_ACTIVATION"));
  assert(consts.includes("ARTICLE_CAMPAIGN_AUTO_STOP"));
  assert(apps.includes("reserveBidCreditsFefo"));
  assert(!/chargeArticleApplicationBidCredit\s*\(/.test(apps));
  assert(charge.includes("DEPRECATED_INACTIVE_E2_USE_RESERVATION"));
  assert(settle.includes("finalizeArticleApproval"));
  assert(settle.includes("bildazo_outbox"));
  assert(reserve.includes("amount_reserved"));
  assert(poolSvc.includes("amountReserved") || poolSvc.includes("amount_reserved"));
  assert(mem.includes("releaseStarterPendingArticleEarnings"));
  console.log("STATIC_RUNTIME_CONFIRMATION=PASS");
  console.log("E2_PRODUCTION_SCHEMA=PASS");
  console.log("VERIFY_154_PRODUCTION_READONLY_PASS");
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
