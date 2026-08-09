/**
 * Shared entry for mutating npm scripts.
 * Load env first, then call before requiring config/db when possible.
 */

const {
  assertQaMutationAllowed,
  assertNonProductionDatabase,
  assertNonProductionMigrationAllowed,
  assertProductionMigrationAllowed,
  classifyDatabaseUrl,
  printEnvironmentBanner,
  maskDatabaseTarget,
  scanSqlForDangerousStatements,
} = require("../../src/utils/databaseEnvironmentSafety");

function exitOnSafetyError(err) {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

function guardQaOrSeed(operation) {
  try {
    const db = assertQaMutationAllowed(operation);
    // eslint-disable-next-line no-console
    console.log(`[db-safety] QA/seed allowed on ${db.maskedTarget} (${db.classification})`);
    return db;
  } catch (err) {
    exitOnSafetyError(err);
    return null;
  }
}

function guardNonProductionWrite(operation) {
  try {
    const db = assertNonProductionDatabase(operation);
    // eslint-disable-next-line no-console
    console.log(`[db-safety] write allowed on ${db.maskedTarget} (${db.classification})`);
    return db;
  } catch (err) {
    exitOnSafetyError(err);
    return null;
  }
}

function guardMigration({ production = false } = {}) {
  try {
    if (production) {
      const result = assertProductionMigrationAllowed("production database migration");
      // eslint-disable-next-line no-console
      console.log(
        `[db-safety] PRODUCTION migration approved for ${result.db.maskedTarget}`,
      );
      return result;
    }
    const result = assertNonProductionMigrationAllowed("database migration");
    // eslint-disable-next-line no-console
    console.log(
      `[db-safety] non-production migration allowed for ${result.db.maskedTarget}`,
    );
    return result;
  } catch (err) {
    exitOnSafetyError(err);
    return null;
  }
}

function logMigrationTarget({ production = false, pendingCount = null, dangerousFindings = [] } = {}) {
  const db = classifyDatabaseUrl();
  // eslint-disable-next-line no-console
  console.log("\n=== Migration target ===");
  // eslint-disable-next-line no-console
  console.log(`Database host/db:     ${maskDatabaseTarget()}`);
  // eslint-disable-next-line no-console
  console.log(`Classification:       ${db.classification}`);
  // eslint-disable-next-line no-console
  console.log(`Operation mode:       ${production ? "PRODUCTION" : "NON_PRODUCTION"}`);
  if (pendingCount != null) {
    // eslint-disable-next-line no-console
    console.log(`Pending migrations:   ${pendingCount}`);
  }
  if (dangerousFindings.length) {
    // eslint-disable-next-line no-console
    console.warn(`Dangerous SQL flags:  ${dangerousFindings.join(", ")}`);
  }
  // eslint-disable-next-line no-console
  console.log("");
}

module.exports = {
  guardQaOrSeed,
  guardNonProductionWrite,
  guardMigration,
  logMigrationTarget,
  printEnvironmentBanner,
  scanSqlForDangerousStatements,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  exitOnSafetyError,
};
