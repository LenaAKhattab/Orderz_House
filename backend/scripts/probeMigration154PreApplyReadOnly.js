/**
 * READ ONLY Production probe for Migration 154 pre-apply review.
 * No mutations.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function q(sql, label) {
  const { rows } = await pool.query(sql);
  console.log(label, JSON.stringify(rows.length === 1 ? rows[0] : rows));
  return rows;
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  console.log("TARGET", info.maskedTarget, "isProduction=", info.isProduction);
  await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='153_marketplace_membership_e1_bid_rules'`,
    "SCHEMA_153",
  );
  await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='154_marketplace_article_economy_e2'`,
    "SCHEMA_154",
  );
  await q(
    `SELECT
       to_regclass('public.marketplace_bid_credit_reservations') AS reservations,
       to_regclass('public.marketplace_article_settlements') AS settlements,
       to_regclass('public.marketplace_article_bildazo_outbox') AS outbox`,
    "E2_TABLES_BEFORE",
  );
  await q(
    `SELECT
       (SELECT COUNT(*)::int FROM marketplace_articles) AS articles,
       (SELECT COUNT(*)::int FROM marketplace_article_applications) AS applications,
       (SELECT COUNT(*)::int FROM marketplace_article_application_bid_credit_economics) AS article_econ,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools,
       (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
       (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles`,
    "PROD_COUNTS",
  );
  await q(
    `SELECT bid_credits_enabled, article_applications_enabled,
            COALESCE(bid_credit_purchases_enabled,FALSE) AS purchases,
            COALESCE(priority_application_boost_enabled,FALSE) AS priority
       FROM marketplace_economy_settings WHERE id=1`,
    "FLAGS",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
