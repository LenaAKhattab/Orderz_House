/**
 * READ-ONLY Production counts for Migration 151 pre-apply review.
 * Does not mutate. Does not apply migrations.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) {
    console.log(JSON.stringify({ skipped: true, reason: "not_production", info }, null, 2));
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
    const one = async (sql, params = []) => (await q(sql, params))[0];
    const out = {
      accessMode: "READ_ONLY_PRODUCTION_ACCESS",
      classification: info.classification || "PRODUCTION",
      has151InSchemaMigrations: Boolean(
        (
          await one(
            `SELECT 1 AS ok FROM schema_migrations WHERE version = '151_bid_credit_package_purchases'`,
          )
        )?.ok,
      ),
      purchasesTable: (await one(`SELECT to_regclass('public.marketplace_bid_credit_purchases') AS t`))
        .t,
      packages: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_packages`)).c),
      grants: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c),
      ledger: Number(
        (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)).c,
      ),
      memberships: Number(
        (await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)).c,
      ),
      cycles: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c),
      hasPurchasesFlagCol: Boolean(
        (
          await one(
            `SELECT EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='marketplace_economy_settings'
                  AND column_name='bid_credit_purchases_enabled'
             ) AS ok`,
          )
        ).ok,
      ),
      hasValidityDays: Boolean(
        (
          await one(
            `SELECT EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='marketplace_bid_credit_packages'
                  AND column_name='validity_days'
             ) AS ok`,
          )
        ).ok,
      ),
      flags: await one(
        `SELECT bid_credits_enabled, article_applications_enabled, work_tokens_enabled,
                priority_application_boost_enabled, priority_bidding_enabled,
                fair_work_distribution_enabled, elite_engine_enabled
           FROM marketplace_economy_settings WHERE id = 1`,
      ),
    };
    try {
      out.normalEcon = Number(
        (await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)).c,
      );
    } catch {
      out.normalEcon = "missing";
    }
    try {
      out.articleEcon = Number(
        (
          await one(
            `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
          )
        ).c,
      );
    } catch {
      out.articleEcon = "missing";
    }
    try {
      out.priorityBoosts = Number(
        (await one(`SELECT COUNT(*)::int AS c FROM marketplace_priority_application_boosts`)).c,
      );
    } catch {
      out.priorityBoosts = "missing";
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
