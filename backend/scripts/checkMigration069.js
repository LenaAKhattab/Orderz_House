/**
 * Check whether migration 069_super_admin_home_perf_indexes was applied.
 *
 * Usage (from backend/):
 *   node scripts/checkMigration069.js
 *
 * Requires DATABASE_URL in backend/.env
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const VERSION = "069_super_admin_home_perf_indexes";
const INDEX_NAMES = [
  "idx_fsub_is_current_status",
  "idx_fsub_is_current_paid_at",
  "idx_fsub_assigned_at",
  "idx_orders_status_created_at",
  "idx_orders_created_at",
  "idx_orders_created_by_user_id",
  "idx_financial_claims_status_created_at",
];

async function main() {
  const { pool } = require("../src/config/db");
  try {
    const mig = await pool.query(
      `SELECT version, applied_at
       FROM schema_migrations
       WHERE version = $1`,
      [VERSION],
    );
    const applied = mig.rowCount > 0;
    console.log(`Migration ${VERSION}: ${applied ? "APPLIED" : "NOT APPLIED"}`);
    if (applied) {
      console.log(`  applied_at: ${mig.rows[0].applied_at}`);
    } else {
      console.log("  Run from backend/: npm run db:migrate");
    }

    const idx = await pool.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      [INDEX_NAMES],
    );
    const found = new Set(idx.rows.map((r) => r.indexname));
    console.log("\nIndexes present in database:");
    for (const name of INDEX_NAMES) {
      console.log(`  ${found.has(name) ? "✓" : "✗"} ${name}`);
    }
    const missing = INDEX_NAMES.filter((n) => !found.has(n));
    if (missing.length) {
      console.log("\nMissing indexes — apply migration 069 before expecting dashboard SQL gains.");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
