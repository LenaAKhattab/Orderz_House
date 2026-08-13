/**
 * READ-ONLY Marketplace Economy preflight for go-live gating.
 * NEVER mutates. NEVER enables engines. NEVER prints secrets.
 *
 * Usage:
 *   node scripts/marketplaceEconomyPreflightReadOnly.js
 *   npm run marketplace:economy:preflight
 *
 * Optional:
 *   REQUIRE_PURCHASES=1  — also require active Bid package catalog
 *   REQUIRE_PRIORITY=1   — also require Priority Uses on ≥1 active plan
 *   REQUIRE_ARTICLES=1   — also require ≥1 Article row (content readiness)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function row(label, ok, detail) {
  return { label, ok: Boolean(ok), detail: detail == null ? "" : String(detail) };
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction && process.env.ALLOW_NON_PRODUCTION_PREFLIGHT !== "1") {
    // Still allow local/staging when explicitly opted in; Production is the intended target.
    console.error(
      "DATABASE_URL is not classified as Production. Set ALLOW_NON_PRODUCTION_PREFLIGHT=1 to run anyway.",
    );
    process.exitCode = 2;
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0] || null;
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

  const checks = [];
  let exit = 0;

  try {
    await pool.query("BEGIN READ ONLY");

    const required = [
      "146_marketplace_bid_credits_foundation",
      "147_normal_application_bid_credit_economics",
      "148_priority_application_boost",
      "149_marketplace_article_applications",
      "150_article_application_bid_credit_economics",
      "151_bid_credit_package_purchases",
    ];
    const applied = (
      await q(`SELECT version FROM schema_migrations WHERE version = ANY($1::text[])`, [required])
    ).map((r) => r.version);
    const missingMig = required.filter((v) => !applied.includes(v));
    checks.push(
      row(
        "economy_migrations_146_151",
        missingMig.length === 0,
        missingMig.length ? `missing=${missingMig.join(",")}` : "all present",
      ),
    );

    const tables = [
      "marketplace_membership_plans",
      "freelancer_marketplace_memberships",
      "marketplace_membership_cycles",
      "marketplace_bid_credit_grants",
      "marketplace_bid_credit_ledger_entries",
      "order_freelancer_bid_credit_economics",
      "order_freelancer_priority_application_boosts",
      "marketplace_articles",
      "marketplace_article_applications",
      "marketplace_article_application_bid_credit_economics",
      "marketplace_bid_credit_packages",
      "marketplace_bid_credit_purchases",
    ];
    for (const t of tables) {
      const exists = (await one(`SELECT to_regclass('public.${t}') AS reg`))?.reg;
      checks.push(row(`schema_table_${t}`, Boolean(exists), exists || "MISSING"));
    }

    const flags = await one(`
      SELECT bid_credits_enabled, bid_credit_purchases_enabled,
             priority_application_boost_enabled, article_applications_enabled,
             work_tokens_enabled, priority_bidding_enabled
        FROM marketplace_economy_settings WHERE id = 1`);

    checks.push(
      row("legacy_work_tokens_off", flags && flags.work_tokens_enabled === false, flags?.work_tokens_enabled),
    );
    checks.push(
      row(
        "legacy_priority_auction_off",
        flags && flags.priority_bidding_enabled === false,
        flags?.priority_bidding_enabled,
      ),
    );
    checks.push(
      row(
        "modern_engines_currently_dormant",
        flags &&
          flags.bid_credits_enabled === false &&
          flags.bid_credit_purchases_enabled === false &&
          flags.priority_application_boost_enabled === false &&
          flags.article_applications_enabled === false,
        JSON.stringify({
          bid: flags?.bid_credits_enabled,
          purchases: flags?.bid_credit_purchases_enabled,
          priority: flags?.priority_application_boost_enabled,
          articles: flags?.article_applications_enabled,
        }),
      ),
    );

    const activePlans = await q(`
      SELECT tier_code, monthly_bid_allowance, priority_bid_uses_per_cycle, article_access_level
        FROM marketplace_membership_plans
       WHERE is_active = TRUE
       ORDER BY sort_order, id`);
    const positiveAllowances = activePlans.filter((p) => Number(p.monthly_bid_allowance) > 0);
    checks.push(
      row(
        "plan_bid_allowances_configured",
        positiveAllowances.length > 0,
        `active_plans=${activePlans.length}; positive_allowance_plans=${positiveAllowances.length}`,
      ),
    );

    const usableMemberships = Number(
      (
        await one(`
          SELECT COUNT(*)::int AS c
            FROM freelancer_marketplace_memberships
           WHERE status IN ('active','grace')`)
      )?.c || 0,
    );
    checks.push(
      row(
        "usable_marketplace_memberships",
        usableMemberships > 0,
        `count=${usableMemberships}`,
      ),
    );

    const spendableBids = Number(
      (
        await one(`
          SELECT COALESCE(SUM(amount_granted - amount_consumed - COALESCE(amount_revoked,0)),0)::int AS c
            FROM marketplace_bid_credit_grants
           WHERE status = 'active'
             AND (amount_granted - amount_consumed - COALESCE(amount_revoked,0)) > 0
             AND (expires_at IS NULL OR expires_at > NOW())
             AND frozen_at IS NULL`)
      )?.c || 0,
    );
    checks.push(row("spendable_bid_total", spendableBids > 0, `spendable=${spendableBids}`));

    const activePackages = await q(`
      SELECT id, bid_quantity, price_jod, validity_days
        FROM marketplace_bid_credit_packages
       WHERE is_active = TRUE`);
    const validPackages = activePackages.filter(
      (p) =>
        Number(p.bid_quantity) > 0 &&
        Number(p.price_jod) > 0 &&
        Number(p.validity_days) > 0,
    );
    const requirePurchases = process.env.REQUIRE_PURCHASES === "1";
    checks.push(
      row(
        requirePurchases ? "bid_package_catalog_required" : "bid_package_catalog_optional",
        requirePurchases ? validPackages.length > 0 : true,
        `active=${activePackages.length}; valid=${validPackages.length}`,
      ),
    );

    const requirePriority = process.env.REQUIRE_PRIORITY === "1";
    const priorityConfigured = activePlans.some((p) => Number(p.priority_bid_uses_per_cycle) > 0);
    checks.push(
      row(
        requirePriority ? "priority_uses_required" : "priority_uses_optional",
        requirePriority ? priorityConfigured : true,
        `priority_configured_on_active_plan=${priorityConfigured}`,
      ),
    );

    const requireArticles = process.env.REQUIRE_ARTICLES === "1";
    const articleCount = Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`))?.c || 0);
    checks.push(
      row(
        requireArticles ? "articles_content_required" : "articles_content_optional",
        requireArticles ? articleCount > 0 : true,
        `articles=${articleCount}`,
      ),
    );

    // Acquisition path: at least one of membership distribution path OR packages OR (memberships exist with grants)
    const acquisitionPath =
      positiveAllowances.length > 0 || validPackages.length > 0 || spendableBids > 0;
    checks.push(
      row(
        "legitimate_bid_acquisition_path",
        acquisitionPath,
        acquisitionPath
          ? "configured"
          : "NONE — allowances=0, packages=0, spendable=0",
      ),
    );

    await pool.query("ROLLBACK");
  } catch (err) {
    try {
      await pool.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error("PREFLIGHT_ERROR", String(err.message || err));
    process.exitCode = 2;
    await pool.end();
    return;
  } finally {
    await pool.end().catch(() => {});
  }

  console.log("=== marketplace:economy:preflight (READ ONLY) ===");
  console.log(`classification: ${info.isProduction ? "PRODUCTION" : info.classification || "OTHER"}`);
  console.log(`access: READ_ONLY — no mutations performed`);
  console.log("");

  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) exit = 1;
    console.log(`${mark}  ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }

  const criticalFail = checks.some(
    (c) =>
      !c.ok &&
      [
        "economy_migrations_146_151",
        "legacy_work_tokens_off",
        "legacy_priority_auction_off",
        "plan_bid_allowances_configured",
        "usable_marketplace_memberships",
        "legitimate_bid_acquisition_path",
        "bid_package_catalog_required",
      ].includes(c.label),
  );

  console.log("");
  if (criticalFail || exit) {
    console.log("BID_CREDITS_GO_LIVE_GATE = BLOCKED_COMMERCIAL_CONFIGURATION");
    console.log("DO_NOT_ENABLE_BID_CREDITS = YES");
  } else {
    console.log("BID_CREDITS_GO_LIVE_GATE = READY");
  }
  console.log("NO_PRODUCTION_ACTIVATION_PERFORMED = YES");

  process.exitCode = exit || (criticalFail ? 1 : 0);
}

main();
