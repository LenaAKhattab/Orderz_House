/**
 * Run all SQL files in sql/migrations in sorted order. Skips files whose basename (without .sql)
 * matches an existing schema_migrations.version row.
 *
 * Usage (from backend/):
 *   npm run db:migrate                 — NON-PRODUCTION ONLY
 *   npm run db:migrate:production      — production DB + multi-flag approval only
 *   npm run db:migrate:production:next — production + apply ONLY first pending (pinned)
 *
 * Requires DATABASE_URL. Never prints credentials.
 */

const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const {
  guardMigration,
  logMigrationTarget,
} = require("./lib/assertScriptDatabaseAllowed");
const {
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
  truthy,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  listMigrationFilenames,
  listAppliedMigrationVersions,
  ensureMigrationsTable,
  discoverPendingMigrations,
  applyOneMigration,
  DEFAULT_MIGRATIONS_DIR,
} = require("./lib/migrationRunnerCore");

const productionMode =
  process.argv.includes("--production") ||
  String(process.env.ORDERZ_MIGRATE_MODE || "").trim().toLowerCase() === "production";

const gate = guardMigration({ production: productionMode });
if (!gate) process.exit(1);

const { pool } = require("../src/config/db");

async function main() {
  const migrationsDir = DEFAULT_MIGRATIONS_DIR;
  const files = listMigrationFilenames(migrationsDir);

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const appliedVersions = await listAppliedMigrationVersions(client);
    const pendingFiles = await discoverPendingMigrations(client, {
      migrationsDir,
      appliedVersions,
    });
    const allDangerous = [];
    for (const item of pendingFiles) {
      if (item.scan.dangerous) allDangerous.push(...item.scan.findings);
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
    const skippedCount = files.length - pendingFiles.length;

    for (const item of pendingFiles) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await applyOneMigration(client, item);
        appliedCount += 1;
      } catch (e) {
        console.error(`[fail] ${e.migrationFile || item.file}:`, e.message || e);
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
