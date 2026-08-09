/**
 * READ-ONLY migration status.
 * Usage (from backend/): npm run db:migrate:status
 *
 * Connects to DATABASE_URL for SELECT only. Does not apply migrations.
 * Production/shared DB is allowed for inspection (READ_ONLY_PRODUCTION_ACCESS).
 */

const fs = require("fs");
const path = require("path");

const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const {
  classifyDatabaseUrl,
  maskDatabaseTarget,
  resolveAppEnv,
  getStripeMode,
  scanSqlForDangerousStatements,
} = require("../src/utils/databaseEnvironmentSafety");

const { pool } = require("../src/config/db");

async function main() {
  const db = classifyDatabaseUrl();
  const migrationsDir = path.join(__dirname, "..", "sql", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const client = await pool.connect();
  try {
    let applied = [];
    try {
      const { rows } = await client.query(
        `SELECT version, applied_at FROM schema_migrations ORDER BY version`,
      );
      applied = rows;
    } catch (err) {
      if (err && err.code === "42P01") {
        // schema_migrations missing
        applied = [];
      } else {
        throw err;
      }
    }

    const appliedSet = new Set(applied.map((r) => r.version));
    const pending = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      if (appliedSet.has(version)) continue;
      const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const scan = scanSqlForDangerousStatements(raw);
      pending.push({
        version,
        file,
        dangerous: scan.dangerous,
        findings: scan.findings,
      });
    }

    // eslint-disable-next-line no-console
    console.log("\n=== db:migrate:status (READ ONLY) ===");
    // eslint-disable-next-line no-console
    console.log(`APP_ENV:            ${resolveAppEnv()}`);
    // eslint-disable-next-line no-console
    console.log(`Database:           ${maskDatabaseTarget()}`);
    // eslint-disable-next-line no-console
    console.log(`Classification:     ${db.classification}${db.isProduction ? "  <<< PRODUCTION/SHARED" : ""}`);
    // eslint-disable-next-line no-console
    console.log(`Stripe mode:        ${getStripeMode().toUpperCase()}`);
    // eslint-disable-next-line no-console
    console.log(`Access mode:        READ_ONLY${db.isProduction ? "_PRODUCTION_ACCESS" : ""}`);
    // eslint-disable-next-line no-console
    console.log(`Applied migrations: ${applied.length}`);
    // eslint-disable-next-line no-console
    console.log(`Pending migrations: ${pending.length}`);
    if (pending.length) {
      // eslint-disable-next-line no-console
      console.log("\nPENDING:");
      for (const p of pending) {
        const flag = p.dangerous ? ` [DANGEROUS: ${p.findings.join(", ")}]` : "";
        // eslint-disable-next-line no-console
        console.log(`  - ${p.file}${flag}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("\nNo pending migrations.");
    }
    // eslint-disable-next-line no-console
    console.log("");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message || err);
  process.exit(1);
});
