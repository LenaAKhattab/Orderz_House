/**
 * Start Orderz backend for local Staging QA only.
 * Usage: npm run start:staging
 *
 * - Loads backend/.env.staging (critical keys override)
 * - Fills remaining unset secrets from backend/.env without overriding staging DB
 * - Refuses APP_ENV !== staging
 * - Refuses Production / known Production host
 * - Refuses start when pending migrations != 0
 * - Refuses read-only DATABASE_URL (pooler default_transaction_read_only=on)
 *
 * Does NOT change production deployment `npm start` behavior.
 */

const path = require("path");

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

  let migrationInfo;
  try {
    migrationInfo = await countPendingMigrations();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "STAGING_START_REFUSED: could not verify pending migrations:\n",
      err && err.message ? err.message : err,
    );
    process.exit(1);
  }

  if (migrationInfo.pendingCount !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      [
        "STAGING_START_REFUSED: pending migrations != 0",
        `Pending: ${migrationInfo.pendingCount}`,
        migrationInfo.pendingSample.length
          ? `Sample: ${migrationInfo.pendingSample.join(", ")}`
          : null,
        "Do not run migrations from this workstation against Production.",
        "Resolve Staging schema with the Staging migrate runbook, then retry.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    process.exit(1);
  }

  let readOnlyValue;
  try {
    readOnlyValue = await assertDatabaseWritable();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("STAGING_START_REFUSED:", err && err.message ? err.message : err);
    process.exit(1);
  }

  let writeProbe;
  try {
    writeProbe = await assertStagingWriteProbe();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "STAGING_START_REFUSED: Staging write probe failed:\n",
      err && err.message ? err.message : err,
    );
    process.exit(1);
  }

  printStagingBanner(target, { pendingCount: migrationInfo.pendingCount });
  // eslint-disable-next-line no-console
  console.log(`[staging-qa] default_transaction_read_only=${readOnlyValue}`);
  // eslint-disable-next-line no-console
  console.log(`[staging-qa] staging write probe=${writeProbe}`);
  const warnings = collectStagingQaWarnings();
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[staging-qa] warning: ${w}`);
  }

  // server.js will dotenv.config(.env) with override:false — staging DATABASE_URL/APP_ENV already set.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(path.join(__dirname, "..", "server.js"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
