/**
 * PHASE B8A — Production READ-ONLY pre-activation probe.
 * No mutations. No engine enable. No economic writes.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function tableExistsSql(name) {
  return `SELECT to_regclass('public.${name}') AS t`;
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) throw new Error("Expected Production DATABASE_URL for B8A probe");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0] || null;

  try {
    await pool.query("BEGIN READ ONLY");

    const migVersions = (
      await q(
        `SELECT version FROM schema_migrations
          WHERE version IN (
            '146_marketplace_bid_credits_foundation',
            '147_normal_application_bid_credit_economics',
            '148_priority_application_boost',
            '149_marketplace_article_applications',
            '150_article_application_bid_credit_economics',
            '151_bid_credit_package_purchases'
          )
          ORDER BY version`,
      )
    ).map((r) => r.version);

    const tables = {};
    for (const name of [
      "marketplace_membership_plans",
      "marketplace_memberships",
      "marketplace_membership_cycles",
      "marketplace_bid_credit_grants",
      "marketplace_bid_credit_ledger_entries",
      "marketplace_membership_bid_distribution_months",
      "order_freelancer_bid_credit_economics",
      "order_freelancer_priority_application_boosts",
      "marketplace_articles",
      "marketplace_article_applications",
      "marketplace_article_application_bid_credit_economics",
      "marketplace_bid_credit_packages",
      "marketplace_bid_credit_purchases",
      "marketplace_economy_settings",
    ]) {
      tables[name] = (await one(tableExistsSql(name)))?.t || null;
    }

    // Wrong-name probes from older audits
    const wrongPriorityNames = {};
    for (const name of [
      "priority_application_boosts",
      "marketplace_priority_application_boosts",
      "order_priority_application_boosts",
    ]) {
      wrongPriorityNames[name] = (await one(tableExistsSql(name)))?.t || null;
    }

    const cols = async (table, names) => {
      const rows = await q(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1
            AND column_name = ANY($2::text[])
          ORDER BY column_name`,
        [table, names],
      );
      return rows.map((r) => r.column_name);
    };

    const keyColumns = {
      marketplace_membership_plans: await cols("marketplace_membership_plans", [
        "monthly_bid_allowance",
        "priority_bid_enabled",
        "priority_bid_uses_per_cycle",
        "article_access_level",
        "included_tokens_per_cycle",
        "is_active",
        "monthly_price_jod",
      ]),
      marketplace_membership_cycles: await cols("marketplace_membership_cycles", [
        "monthly_bid_allowance_snapshot",
      ]),
      marketplace_bid_credit_grants: await cols("marketplace_bid_credit_grants", [
        "source_type",
        "status",
        "amount_granted",
        "amount_consumed",
        "amount_revoked",
        "expires_at",
        "frozen_at",
      ]),
      marketplace_bid_credit_packages: await cols("marketplace_bid_credit_packages", [
        "bid_quantity",
        "price_jod",
        "validity_days",
        "is_active",
      ]),
      marketplace_economy_settings: await cols("marketplace_economy_settings", [
        "bid_credits_enabled",
        "bid_credit_purchases_enabled",
        "priority_application_boost_enabled",
        "article_applications_enabled",
        "work_tokens_enabled",
        "priority_bidding_enabled",
        "fair_work_distribution_enabled",
        "elite_engine_enabled",
        "marketplace_commission_enabled",
        "cash_membership_payments_enabled",
        "verification_bonuses_enabled",
      ]),
      order_freelancer_priority_application_boosts: await cols(
        "order_freelancer_priority_application_boosts",
        ["order_id", "freelancer_user_id", "bid_credit_cost", "priority_use_cost", "status"],
      ),
    };

    const constraints = {};
    for (const [table, conname] of [
      ["marketplace_bid_credit_grants", "marketplace_bid_credit_grants_source_type_check"],
      ["marketplace_bid_credit_grants", "marketplace_bid_credit_grants_status_check"],
      ["marketplace_bid_credit_grants", "marketplace_bid_credit_grants_amounts_chk"],
      ["marketplace_bid_credit_packages", "marketplace_bid_credit_packages_validity_days_chk"],
      [
        "marketplace_bid_credit_purchases",
        "marketplace_bid_credit_purchases_status_chk",
      ],
    ]) {
      constraints[conname] =
        (
          await one(
            `SELECT pg_get_constraintdef(c.oid) AS def
               FROM pg_constraint c
               JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = $1 AND c.conname = $2`,
            [table, conname],
          )
        )?.def || null;
    }

    const flags = await one(`
      SELECT bid_credits_enabled,
             bid_credit_purchases_enabled,
             priority_application_boost_enabled,
             article_applications_enabled,
             work_tokens_enabled,
             priority_bidding_enabled,
             fair_work_distribution_enabled,
             elite_engine_enabled,
             marketplace_commission_enabled,
             cash_membership_payments_enabled,
             verification_bonuses_enabled
        FROM marketplace_economy_settings
       WHERE id = 1`);

    const membershipPlans = await q(`
      SELECT id, tier_code, name_ar, name_en, is_active,
             monthly_price_jod, monthly_bid_allowance,
             priority_bid_enabled, priority_bid_uses_per_cycle,
             article_access_level, included_tokens_per_cycle,
             elite_direct_orders_enabled, cash_allowed
        FROM marketplace_membership_plans
       ORDER BY sort_order ASC, id ASC`);

    const activePlans = membershipPlans.filter((p) => p.is_active === true);
    const activeAllowances = activePlans.map((p) => Number(p.monthly_bid_allowance) || 0);
    const membershipBidAllowancesConfigured =
      activePlans.length > 0 && activeAllowances.some((n) => n > 0);

    const packages = await q(`
      SELECT id, name_ar, name_en, bid_quantity, price_jod, validity_days, is_active, sort_order
        FROM marketplace_bid_credit_packages
       ORDER BY sort_order ASC NULLS LAST, id ASC`);
    const activePackages = packages.filter((p) => p.is_active === true);

    const safeCount = async (label, sql) => {
      try {
        return { [label]: Number((await one(sql))?.c || 0) };
      } catch (e) {
        return { [label]: null, [`${label}Error`]: String(e.message || e).slice(0, 200) };
      }
    };

    const counts = {
      ...(await safeCount(
        "activeFreelancers",
        `SELECT COUNT(DISTINCT u.id)::int AS c
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE r.code = 'freelancer'
            AND COALESCE(u.is_active, TRUE) = TRUE`,
      )),
      ...(await safeCount(
        "activeFreelancersAlt",
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'freelancer' AND COALESCE(is_active, TRUE) = TRUE`,
      )),
      ...(await safeCount(
        "usableMarketplaceMemberships",
        `SELECT COUNT(*)::int AS c FROM marketplace_memberships WHERE status IN ('active', 'grace')`,
      )),
      ...(await safeCount(
        "activeMembershipCycles",
        `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles WHERE status = 'active'`,
      )),
      ...(await safeCount(
        "freelancersWithSpendableBids",
        `SELECT COUNT(DISTINCT freelancer_user_id)::int AS c
           FROM marketplace_bid_credit_grants
          WHERE status = 'active'
            AND (amount_granted - amount_consumed - COALESCE(amount_revoked,0)) > 0
            AND (expires_at IS NULL OR expires_at > NOW())
            AND frozen_at IS NULL`,
      )),
      ...(await safeCount(
        "spendableBidTotal",
        `SELECT COALESCE(SUM(amount_granted - amount_consumed - COALESCE(amount_revoked,0)),0)::int AS c
           FROM marketplace_bid_credit_grants
          WHERE status = 'active'
            AND (amount_granted - amount_consumed - COALESCE(amount_revoked,0)) > 0
            AND (expires_at IS NULL OR expires_at > NOW())
            AND frozen_at IS NULL`,
      )),
      ...(await safeCount(
        "realOpenPricedBiddingOrders",
        `SELECT COUNT(*)::int AS c
           FROM orders
          WHERE project_type = 'bidding'
            AND is_published = TRUE
            AND is_open_for_pool = TRUE
            AND order_status = 'open_for_bids'
            AND COALESCE(is_fake, FALSE) = FALSE
            AND COALESCE(is_training, FALSE) = FALSE
            AND assigned_freelancer_id IS NULL`,
      )),
      ...(await safeCount(
        "pendingRealFreelancerApplications",
        `SELECT COUNT(*)::int AS c
           FROM order_freelancer_bids ofb
           JOIN orders o ON o.id = ofb.order_id
          WHERE COALESCE(o.is_fake, FALSE) = FALSE
            AND COALESCE(o.is_training, FALSE) = FALSE
            AND o.assigned_freelancer_id IS NULL
            AND o.order_status = 'open_for_bids'`,
      )),
      ...(await safeCount(
        "articleApplications",
        `SELECT COUNT(*)::int AS c FROM marketplace_article_applications`,
      )),
      ...(await safeCount(
        "priorityBoosts",
        `SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`,
      )),
      ...(await safeCount(
        "membershipsTotal",
        `SELECT COUNT(*)::int AS c FROM marketplace_memberships`,
      )),
      ...(await safeCount(
        "cyclesTotal",
        `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`,
      )),
      ...(await safeCount(
        "bidGrantsTotal",
        `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`,
      )),
      ...(await safeCount(
        "bidLedgerTotal",
        `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`,
      )),
      ...(await safeCount(
        "normalBidEconomics",
        `SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`,
      )),
      ...(await safeCount(
        "articlesTotal",
        `SELECT COUNT(*)::int AS c FROM marketplace_articles`,
      )),
      ...(await safeCount(
        "articleEconomics",
        `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
      )),
      ...(await safeCount(
        "bidPurchases",
        `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_purchases`,
      )),
      activeBidPackages: activePackages.length,
      membershipPlansTotal: membershipPlans.length,
      membershipPlansActive: activePlans.length,
      bidPackagesTotal: packages.length,
    };

    let articleStatusDist = [];
    try {
      articleStatusDist = await q(`
        SELECT status, COUNT(*)::int AS c
          FROM marketplace_articles
         GROUP BY status
         ORDER BY c DESC`);
    } catch (_) {
      articleStatusDist = [];
    }
    const openArticleStatuses = articleStatusDist
      .filter((r) =>
        ["open", "open_for_applications", "accepting_applications", "published", "active"].includes(
          String(r.status),
        ),
      )
      .reduce((s, r) => s + Number(r.c), 0);

    let bidGrantsBySource = [];
    try {
      bidGrantsBySource = await q(`
        SELECT source_type, COUNT(*)::int AS grants,
               COALESCE(SUM(amount_granted),0)::int AS granted,
               COALESCE(SUM(amount_consumed),0)::int AS consumed,
               COALESCE(SUM(COALESCE(amount_revoked,0)),0)::int AS revoked
          FROM marketplace_bid_credit_grants
         GROUP BY source_type
         ORDER BY source_type`);
    } catch (_) {
      bidGrantsBySource = [];
    }

    await pool.query("ROLLBACK");

    const report = {
      classification: "PRODUCTION_READ_ONLY",
      migVersions,
      tables,
      wrongPriorityNames,
      keyColumns,
      constraints,
      flags,
      membershipPlans: membershipPlans.map((p) => ({
        id: String(p.id),
        tierCode: p.tier_code,
        nameAr: p.name_ar,
        nameEn: p.name_en,
        isActive: p.is_active === true,
        monthlyPriceJod: p.monthly_price_jod != null ? Number(p.monthly_price_jod) : null,
        monthlyBidAllowance: Number(p.monthly_bid_allowance) || 0,
        priorityBidEnabled: p.priority_bid_enabled === true,
        priorityUsesPerCycle: Number(p.priority_bid_uses_per_cycle) || 0,
        articleAccessLevel: Number(p.article_access_level) || 1,
        includedTokensPerCycle: Number(p.included_tokens_per_cycle) || 0,
        eliteDirectOrdersEnabled: p.elite_direct_orders_enabled === true,
        cashAllowed: p.cash_allowed === true,
      })),
      MEMBERSHIP_BID_ALLOWANCES_CONFIGURED: membershipBidAllowancesConfigured ? "YES" : "NO",
      packages: packages.map((p) => ({
        id: String(p.id),
        nameAr: p.name_ar,
        nameEn: p.name_en,
        bidQuantity: Number(p.bid_quantity) || 0,
        priceJod: p.price_jod != null ? Number(p.price_jod) : null,
        validityDays: p.validity_days != null ? Number(p.validity_days) : null,
        isActive: p.is_active === true,
      })),
      BID_PURCHASE_CATALOG_CONFIGURED: activePackages.length > 0 ? "YES" : "NO",
      counts: {
        ...counts,
        currentlyOpenArticlesBestEffort: openArticleStatuses,
        articleStatusDist,
      },
      bidGrantsBySource,
      PRIORITY_BOOST_PRODUCTION_SCHEMA: tables.order_freelancer_priority_application_boosts
        ? "PRESENT"
        : "MISSING",
    };

    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    try {
      await pool.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error("B8A_PROBE_FAILED", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
