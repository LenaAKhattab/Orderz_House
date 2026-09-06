/**
 * READ ONLY Production economy probe for Migration 152 final review.
 * Never mutates.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function q(sql, label) {
  try {
    const { rows } = await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log(label, JSON.stringify(rows[0] != null && Object.keys(rows[0]).length ? rows[0] : rows));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`${label}_ERR`, err.message);
  }
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  // eslint-disable-next-line no-console
  console.log("TARGET", info.maskedTarget, "isProduction=", info.isProduction);
  await q(
    `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='151_bid_credit_package_purchases') AS v151,
            EXISTS(SELECT 1 FROM schema_migrations WHERE version='152_admin_bid_distribution_pools') AS v152`,
    "MIG",
  );
  await q(`SELECT COUNT(*)::int AS n FROM marketplace_bid_credit_grants`, "GRANTS");
  await q(`SELECT COUNT(*)::int AS n FROM marketplace_bid_credit_ledger_entries`, "LEDGER");
  await q(`SELECT COUNT(*)::int AS n FROM marketplace_bid_credit_packages`, "PACKAGES");
  await q(`SELECT COUNT(*)::int AS n FROM marketplace_bid_credit_purchases`, "PURCHASES");
  await q(`SELECT COUNT(*)::int AS n FROM freelancer_marketplace_memberships`, "MEMBERSHIPS");
  await q(`SELECT COUNT(*)::int AS n FROM marketplace_membership_cycles`, "CYCLES");
  await q(
    `SELECT to_regclass('public.order_freelancer_bid_credit_economics') AS t`,
    "NORMAL_ECON_TABLE",
  );
  await q(`SELECT COUNT(*)::int AS n FROM order_freelancer_bid_credit_economics`, "NORMAL_ECON");
  await q(
    `SELECT to_regclass('public.order_freelancer_article_application_bid_credit_economics') AS t`,
    "ARTICLE_ECON_TABLE",
  );
  await q(
    `SELECT COUNT(*)::int AS n FROM order_freelancer_article_application_bid_credit_economics`,
    "ARTICLE_ECON",
  );
  await q(
    `SELECT to_regclass('public.marketplace_bid_distribution_pools') AS pools,
            to_regclass('public.marketplace_bid_distribution_batches') AS batches,
            to_regclass('public.marketplace_bid_distribution_allocations') AS allocs,
            to_regclass('public.marketplace_bid_distribution_pool_events') AS events`,
    "D1_TABLES",
  );
  await q(
    `SELECT bid_credits_enabled, COALESCE(bid_credit_purchases_enabled,false) AS bid_credit_purchases_enabled
       FROM marketplace_economy_settings WHERE id=1`,
    "FLAGS",
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
