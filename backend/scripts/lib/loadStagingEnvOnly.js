/**
 * Load backend/.env.staging only — never production backend/.env for DATABASE_URL.
 * Clears staging-critical keys from the parent shell before applying the file.
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const {
  assertStagingMigrationAllowed,
} = require("../../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..", "..");
const STAGING_ENV_FILE = ".env.staging";

const STAGING_CRITICAL_KEYS = Object.freeze([
  "APP_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "CLIENT_URL",
]);

function loadStagingEnvOnly(operation = "staging env load") {
  const filePath = path.join(BACKEND_ROOT, STAGING_ENV_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      [
        "STAGING_ENV_NOT_LOADED",
        `Required file missing: backend/${STAGING_ENV_FILE}`,
        "Copy backend/.env.staging.example → backend/.env.staging",
        "Fill Neon branch staging-ord20 connection strings. Never commit this file.",
      ].join("\n"),
    );
  }

  for (const key of STAGING_CRITICAL_KEYS) {
    delete process.env[key];
  }

  dotenv.config({ path: filePath, override: true, quiet: true });

  return assertStagingMigrationAllowed(operation);
}

function logStagingTarget(db) {
  // eslint-disable-next-line no-console
  console.log("\n=== Staging env (backend/.env.staging) ===");
  // eslint-disable-next-line no-console
  console.log(`APP_ENV:              ${process.env.APP_ENV}`);
  // eslint-disable-next-line no-console
  console.log(`Database host/db:     ${db.maskedTarget}`);
  // eslint-disable-next-line no-console
  console.log(`Classification:       ${db.classification}`);
  // eslint-disable-next-line no-console
  console.log("Production backend/.env is NOT used for DATABASE_URL in this command.\n");
}

module.exports = {
  BACKEND_ROOT,
  STAGING_ENV_FILE,
  loadStagingEnvOnly,
  logStagingTarget,
};
