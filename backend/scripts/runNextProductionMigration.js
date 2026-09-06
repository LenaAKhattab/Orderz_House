/**
 * Apply EXACTLY ONE pending migration against Production: the first pending file.
 *
 * Usage (from backend/):
 *   npm run db:migrate:production:next
 *
 * Required env (same contract as db:migrate:production):
 *   APP_ENV=production
 *   ALLOW_PRODUCTION_DB_MIGRATIONS=1
 *   CONFIRM_PRODUCTION_DATABASE=orderzhouse-production
 *   PRODUCTION_BACKUP_CONFIRMED=1
 *   EXPECTED_MIGRATION_VERSION=<first pending version, e.g. 145_marketplace_article_level_model>
 *
 * Dry-run / inspection (no SQL DDL/DML; SELECT discovery only):
 *   npm run db:migrate:production:next -- --dry-run
 *
 * Never prints DATABASE_URL / passwords / secrets.
 * Does NOT apply all pending migrations.
 * Does NOT enable generic Production SQL execution (db:run remains blocked).
 */

const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const {
  guardMigration,
  logMigrationTarget,
  classifyDatabaseUrl,
  maskDatabaseTarget,
} = require("./lib/assertScriptDatabaseAllowed");
const {
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
  truthy,
  hasProductionMigrationApprovals,
  resolveAppEnv,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  discoverPendingMigrations,
  resolveNextMigrationPin,
  applyOneMigration,
  normalizeMigrationVersion,
} = require("./lib/migrationRunnerCore");

const dryRun = process.argv.includes("--dry-run");

function fail(code, details = []) {
  const lines = [code, ...details].filter(Boolean);
  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(1);
}

function printInspection({
  db,
  pendingFiles,
  pin,
  expected,
  guardsSatisfied,
  mode,
}) {
  // eslint-disable-next-line no-console
  console.log("\n=== db:migrate:production:next ===");
  // eslint-disable-next-line no-console
  console.log(`Mode:                  ${mode}`);
  // eslint-disable-next-line no-console
  console.log(`APP_ENV:               ${resolveAppEnv()}`);
  // eslint-disable-next-line no-console
  console.log(`Database:              ${maskDatabaseTarget()}`);
  // eslint-disable-next-line no-console
  console.log(
    `Classification:        ${db.classification}${db.isProduction ? "  <<< PRODUCTION/SHARED" : ""}`,
  );
  // eslint-disable-next-line no-console
  console.log(`Production guards OK:  ${guardsSatisfied ? "YES" : "NO"}`);
  // eslint-disable-next-line no-console
  console.log(`Pending migrations:    ${pendingFiles.length}`);
  // eslint-disable-next-line no-console
  console.log(`EXPECTED_MIGRATION:    ${expected || "(missing)"}`);
  if (pendingFiles[0]) {
    // eslint-disable-next-line no-console
    console.log(`First pending:         ${pendingFiles[0].version}`);
    // eslint-disable-next-line no-console
    console.log(`First pending file:    ${pendingFiles[0].file}`);
  } else {
    // eslint-disable-next-line no-console
    console.log("First pending:         (none)");
  }
  if (pin.ok) {
    // eslint-disable-next-line no-console
    console.log(`Pin match:             YES`);
    // eslint-disable-next-line no-console
    console.log(`Would apply:           ${pin.migration.version}`);
    // eslint-disable-next-line no-console
    console.log(`Remaining after apply: ${pin.remainingPendingAfter}`);
    if (pin.remainingPendingVersionsAfter.length) {
      // eslint-disable-next-line no-console
      console.log(
        `Still pending after:   ${pin.remainingPendingVersionsAfter.join(", ")}`,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`Pin match:             NO (${pin.code})`);
    if (pin.nextPending) {
      // eslint-disable-next-line no-console
      console.log(`Actual next pending:   ${pin.nextPending}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`SINGLE_MIGRATION_MAX_PER_INVOCATION = 1`);
  // eslint-disable-next-line no-console
  console.log("");
}

async function main() {
  const expected = normalizeMigrationVersion(process.env.EXPECTED_MIGRATION_VERSION);
  const guardsSatisfied = hasProductionMigrationApprovals(process.env);
  const db = classifyDatabaseUrl();

  if (!dryRun) {
    const gate = guardMigration({ production: true });
    if (!gate) process.exit(1);
  }

  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  try {
    // Dry-run is read-only discovery (same posture as db:migrate:status).
    // Apply path may create schema_migrations if missing.
    if (!dryRun) {
      await ensureMigrationsTable(client);
    }

    const appliedVersions = await listAppliedMigrationVersions(client);
    const pendingFiles = await discoverPendingMigrations(client, {
      appliedVersions,
    });
    const allDangerous = [];
    for (const item of pendingFiles) {
      if (item.scan.dangerous) allDangerous.push(...item.scan.findings);
    }

    const pin = resolveNextMigrationPin({
      pendingFiles,
      appliedVersions,
      expectedVersion: expected,
    });

    if (dryRun) {
      printInspection({
        db,
        pendingFiles,
        pin,
        expected,
        guardsSatisfied,
        mode: "DRY_RUN",
      });
      if (!pin.ok) {
        fail(pin.code, [
          expected ? `EXPECTED_MIGRATION_VERSION=${expected}` : null,
          pin.nextPending ? `NEXT_PENDING=${pin.nextPending}` : null,
        ]);
      }
      // eslint-disable-next-line no-console
      console.log("DRY_RUN_OK — no migration SQL executed.");
      return;
    }

    logMigrationTarget({
      production: true,
      pendingCount: pendingFiles.length,
      dangerousFindings: [...new Set(allDangerous)],
    });

    if (allDangerous.length && !truthy(process.env.ALLOW_DANGEROUS_PRODUCTION_SQL)) {
      // Only block if the selected next migration itself is dangerous, or any pending is dangerous
      // (same fail-closed posture as full production migrate when any pending matches heuristics).
      fail("PRODUCTION_DANGEROUS_SQL_REVIEW_REQUIRED", [
        `Pending SQL matched: ${[...new Set(allDangerous)].join(", ")}`,
        "Review the pending files, then set ALLOW_DANGEROUS_PRODUCTION_SQL=1 only if intentional.",
        `Also required: CONFIRM_PRODUCTION_DATABASE=${PRODUCTION_MIGRATE_CONFIRM_VALUE}`,
      ]);
    }

    if (!pin.ok) {
      fail(pin.code, [
        expected ? `EXPECTED_MIGRATION_VERSION=${expected}` : null,
        pin.nextPending ? `NEXT_PENDING=${pin.nextPending}` : null,
        pin.nextPendingFile ? `NEXT_PENDING_FILE=${pin.nextPendingFile}` : null,
        "Refusing to skip, reorder, or apply a non-next migration.",
      ]);
    }

    // eslint-disable-next-line no-console
    console.log(
      `Applying exactly one migration: ${pin.migration.file} (remaining after: ${pin.remainingPendingAfter})`,
    );

    try {
      const result = await applyOneMigration(client, pin.migration);
      // eslint-disable-next-line no-console
      console.log(
        [
          "Done.",
          `Applied: ${result.version}`,
          `Statements: ${result.statementCount}`,
          `Remaining pending: ${pin.remainingPendingAfter}`,
          "SINGLE_MIGRATION_MAX_PER_INVOCATION = 1",
        ].join(" "),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[fail] ${e.migrationFile || pin.migration.file}:`, e.message || e);
      process.exit(1);
    }
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
