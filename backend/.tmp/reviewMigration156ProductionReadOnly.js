/**
 * READ-ONLY Production inspection for Migration 156 pre-apply review.
 * Does not mutate. Does not apply migrations.
 */
const path = require("path");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: info.isProduction ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  try {
    const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
    const one = async (sql, params = []) => (await q(sql, params))[0];
    const out = {
      accessMode: info.isProduction ? "READ_ONLY_PRODUCTION_ACCESS" : "READ_ONLY",
      classification: info.classification,
      isProduction: Boolean(info.isProduction),
      maskedTarget: info.maskedTarget,
      appliedCount: Number((await one(`SELECT COUNT(*)::int AS c FROM schema_migrations`)).c),
      has155: Boolean(
        (await one(`SELECT 1 AS ok FROM schema_migrations WHERE version = '155_marketplace_normal_order_rules_e3'`))
          ?.ok,
      ),
      has156: Boolean(
        (await one(`SELECT 1 AS ok FROM schema_migrations WHERE version = '156_default_plan_catalog'`))?.ok,
      ),
      lastApplied: await q(
        `SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC NULLS LAST, version DESC LIMIT 8`,
      ),
      defaultPlanCatalog: await one(
        `SELECT key, value, updated_by_user_id, updated_at
           FROM system_settings
          WHERE key = 'default_plan_catalog'`,
      ),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
