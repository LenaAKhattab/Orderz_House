/**
 * Run all SQL files in sql/migrations in sorted order. Skips files whose basename (without .sql)
 * matches an existing schema_migrations.version row.
 *
 * Usage (from backend/):
 *   npm run db:migrate                 — NON-PRODUCTION ONLY
 *   npm run db:migrate:production      — production DB + multi-flag approval only
 *
 * Requires DATABASE_URL. Never prints credentials.
 */

const fs = require("fs");
const path = require("path");

const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const {
  guardMigration,
  logMigrationTarget,
  scanSqlForDangerousStatements,
} = require("./lib/assertScriptDatabaseAllowed");
const {
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
  truthy,
} = require("../src/utils/databaseEnvironmentSafety");

const productionMode =
  process.argv.includes("--production") ||
  String(process.env.ORDERZ_MIGRATE_MODE || "").trim().toLowerCase() === "production";

const gate = guardMigration({ production: productionMode });
if (!gate) process.exit(1);

const { pool } = require("../src/config/db");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(client, version) {
  const { rows } = await client.query(`SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`, [version]);
  return Boolean(rows[0]);
}

async function main() {
  const migrationsDir = path.join(__dirname, "..", "sql", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const pendingFiles = [];
    const allDangerous = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      // eslint-disable-next-line no-await-in-loop
      if (await isApplied(client, version)) continue;
      const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const scan = scanSqlForDangerousStatements(raw);
      pendingFiles.push({ file, version, raw, scan });
      if (scan.dangerous) allDangerous.push(...scan.findings);
    }

    logMigrationTarget({
      production: productionMode,
      pendingCount: pendingFiles.length,
      dangerousFindings: [...new Set(allDangerous)],
    });

    if (productionMode && allDangerous.length && !truthy(process.env.ALLOW_DANGEROUS_PRODUCTION_SQL)) {
      console.error(
        [
          "PRODUCTION_DANGEROUS_SQL_REVIEW_REQUIRED",
          `Pending SQL matched: ${[...new Set(allDangerous)].join(", ")}`,
          "Review the pending files, then set ALLOW_DANGEROUS_PRODUCTION_SQL=1 only if intentional.",
          `Also required: CONFIRM_PRODUCTION_DATABASE=${PRODUCTION_MIGRATE_CONFIRM_VALUE}`,
        ].join("\n"),
      );
      process.exit(1);
    }

    if (pendingFiles.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    let appliedCount = 0;
    let skippedCount = files.length - pendingFiles.length;

    for (const item of pendingFiles) {
      const { file, version, raw } = item;
      const cleaned = stripSqlLineComments(raw);
      const statements = splitSqlStatements(cleaned);

      if (statements.length === 0) {
        console.warn(`[warn] ${file}: no statements`);
        // eslint-disable-next-line no-await-in-loop
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [version]);
        appliedCount += 1;
        continue;
      }

      console.log(`[run] ${file} (${statements.length} statement(s))`);

      try {
        for (let i = 0; i < statements.length; i += 1) {
          const stmt = statements[i];
          // eslint-disable-next-line no-await-in-loop
          await client.query(stmt);
          const preview = stmt.replace(/\s+/g, " ").slice(0, 72);
          console.log(`  [${i + 1}/${statements.length}] OK ${preview}${stmt.length > 72 ? "…" : ""}`);
        }
        // eslint-disable-next-line no-await-in-loop
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [version]);
        appliedCount += 1;
        console.log(`[ok] ${file}`);
      } catch (e) {
        console.error(`[fail] ${file}:`, e.message || e);
        try {
          // Abort any open transaction started by the migration file (e.g. BEGIN … DO $$ …).
          // eslint-disable-next-line no-await-in-loop
          await client.query("ROLLBACK");
        } catch {
          /* ignore — connection may already be idle */
        }
        process.exit(1);
      }
    }

    console.log(`Done. Newly applied this run: ${appliedCount}, skipped (already applied): ${skippedCount}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
