/**
 * Staging QA preflight — safety checks before local Staging QA.
 * Usage: npm run qa:staging:preflight
 *
 * Loads backend/.env.staging, refuses Production DB, checks pending migrations,
 * refuses read-only DATABASE_URL, optional Staging-only write probe (ROLLBACK).
 * Does not start the HTTP server.
 */

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
  assertDatabaseWritable,
  assertStagingWriteProbe,
  collectStagingQaWarnings,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();

  let migrationInfo = { appliedCount: null, pendingCount: null, pendingSample: [] };
  let migrationError = null;
  try {
    migrationInfo = await countPendingMigrations();
  } catch (err) {
    migrationError = err && err.message ? err.message : String(err);
  }

  printStagingBanner(target, { pendingCount: migrationInfo.pendingCount });

  const warnings = collectStagingQaWarnings();
  // eslint-disable-next-line no-console
  console.log("Preflight:");
  // eslint-disable-next-line no-console
  console.log(`  APP_ENV:              ${target.appEnv}`);
  // eslint-disable-next-line no-console
  console.log(`  DB classification:    ${target.db.classification}`);
  // eslint-disable-next-line no-console
  console.log(`  Masked host:          ${target.maskedTarget}`);
  // eslint-disable-next-line no-console
  console.log(
    `  Applied migrations:   ${migrationInfo.appliedCount === null ? "(unavailable)" : migrationInfo.appliedCount}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `  Pending migrations:   ${migrationInfo.pendingCount === null ? "(unavailable)" : migrationInfo.pendingCount}`,
  );
  if (migrationError) {
    // eslint-disable-next-line no-console
    console.log(`  Migration check error: ${migrationError}`);
  }
  if (migrationInfo.pendingSample && migrationInfo.pendingSample.length) {
    // eslint-disable-next-line no-console
    console.log(`  Pending sample:       ${migrationInfo.pendingSample.join(", ")}`);
  }

  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.log("\nWarnings:");
    for (const w of warnings) {
      // eslint-disable-next-line no-console
      console.log(`  - ${w}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("\nWarnings: none");
  }

  if (migrationInfo.pendingCount !== null && migrationInfo.pendingCount !== 0) {
    // eslint-disable-next-line no-console
    console.error("\nPREFLIGHT_FAILED: pending migrations != 0 (refuse Staging QA start until resolved).");
    process.exit(2);
  }

  if (migrationError) {
    // eslint-disable-next-line no-console
    console.error("\nPREFLIGHT_FAILED: could not verify pending migrations (read-only).");
    process.exit(2);
  }

  let readOnlyValue;
  try {
    readOnlyValue = await assertDatabaseWritable();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`\nPREFLIGHT_FAILED: ${err && err.message ? err.message : err}`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`  default_transaction_read_only: ${readOnlyValue}`);

  let writeProbe;
  try {
    writeProbe = await assertStagingWriteProbe();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `\nPREFLIGHT_FAILED: Staging write probe failed:\n${err && err.message ? err.message : err}`,
    );
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`  staging write probe:  ${writeProbe}`);

  // eslint-disable-next-line no-console
  console.log("\nPREFLIGHT_OK: safe to run npm run start:staging\n");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
