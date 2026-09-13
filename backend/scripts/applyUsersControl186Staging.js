/**
 * Apply Super Admin Users Control audit migration 186 on STAGING only.
 * Additive: creates super_admin_user_control_audit_logs. No Production. No payments.
 *
 * Usage (from backend/):
 *   node scripts/applyUsersControl186Staging.js
 */
const path = require("node:path");
const fs = require("node:fs");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.staging"),
  override: true,
});

const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  resolveAppEnv,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  applyOneMigration,
} = require("./lib/migrationRunnerCore");

const VERSION = "186_super_admin_user_control_audit";
const FILE = "186_super_admin_user_control_audit.sql";

async function main() {
  const appEnv = resolveAppEnv(process.env);
  if (appEnv !== "staging") {
    throw new Error(`REFUSED: APP_ENV must be staging (got ${appEnv})`);
  }

  const db = assertNonProductionDatabase("apply users-control audit 186 on staging");
  const host = String(classifyDatabaseUrl().host || "").toLowerCase();
  if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
    throw new Error("REFUSED: production Neon host detected");
  }

  console.log(
    JSON.stringify({
      phase: "target",
      appEnv,
      classification: classifyDatabaseUrl().classification,
      isProduction: db.isProduction,
      maskedTarget: maskDatabaseTarget(),
    }),
  );

  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  let applyResult = "FAILED";
  try {
    await ensureMigrationsTable(client);
    const applied = await listAppliedMigrationVersions(client);
    if (applied.includes(VERSION)) {
      applyResult = "ALREADY_APPLIED";
    } else {
      const filePath = path.join(__dirname, "..", "sql", "migrations", FILE);
      const raw = fs.readFileSync(filePath, "utf8");
      if (/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM\s+users/i.test(raw)) {
        throw new Error("REFUSED: migration contains destructive SQL");
      }
      await applyOneMigration(client, { file: FILE, version: VERSION, raw });
      applyResult = "APPLIED";
    }
    console.log(JSON.stringify({ phase: "migrate", result: applyResult, version: VERSION }));

    const verify = await client.query(`
      SELECT
        to_regclass('public.super_admin_user_control_audit_logs') IS NOT NULL AS table_ok,
        (SELECT COUNT(*)::int FROM pg_indexes
          WHERE tablename = 'super_admin_user_control_audit_logs') AS index_count,
        EXISTS (
          SELECT 1 FROM schema_migrations WHERE version = $1
        ) AS version_recorded
    `, [VERSION]);
    console.log(JSON.stringify({ phase: "verify", ...verify.rows[0] }));
  } finally {
    client.release();
  }

  // Pending count for this workspace migrations dir
  const migrationsDir = path.join(__dirname, "..", "sql", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/i, ""));
  const appliedNow = await pool.query(`SELECT version FROM schema_migrations`);
  const appliedSet = new Set(appliedNow.rows.map((r) => r.version));
  const pending = files.filter((v) => !appliedSet.has(v));
  console.log(
    JSON.stringify({
      phase: "pending",
      pendingCount: pending.length,
      pendingSample: pending.slice(0, 5),
    }),
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
