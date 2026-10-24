/**
 * Refuse a Production database from any automated test process.
 *
 * Evaluated before the pg Pool is created, so a refused target never opens a connection.
 * Integration suites must use INTEGRATION_TEST_DATABASE_URL (see test/helpers/integrationEnv.js);
 * this guard is the backstop for any test that would otherwise inherit backend/.env.
 */

const { classifyDatabaseUrl, resolveAppEnv } = require("../utils/databaseEnvironmentSafety");

const TEST_RUNTIME_PRODUCTION_DB_REFUSED = "TEST_RUNTIME_PRODUCTION_DATABASE_REFUSED";

/**
 * node --test children carry NODE_TEST_CONTEXT and --test-* exec args;
 * `node some.test.js` is caught by the entrypoint name.
 */
function isAutomatedTestRuntime({
  env = process.env,
  execArgv = process.execArgv,
  argv = process.argv,
} = {}) {
  if (String(env.NODE_TEST_CONTEXT || "").trim()) return true;
  if ((execArgv || []).some((a) => a === "--test" || String(a).startsWith("--test-"))) return true;
  return /\.test\.[cm]?js$/i.test(String((argv || [])[1] || ""));
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function evaluateTestRuntimeDatabase(databaseUrl, env = process.env) {
  const db = classifyDatabaseUrl(databaseUrl, env);
  if (db.isProduction) {
    return {
      ok: false,
      code: TEST_RUNTIME_PRODUCTION_DB_REFUSED,
      message:
        `${TEST_RUNTIME_PRODUCTION_DB_REFUSED}: automated tests must never use the Production database ` +
        `(${db.maskedTarget}). Set INTEGRATION_TEST_DATABASE_URL to an approved non-Production database.`,
    };
  }
  if (resolveAppEnv(env) === "production") {
    return {
      ok: false,
      code: TEST_RUNTIME_PRODUCTION_DB_REFUSED,
      message: `${TEST_RUNTIME_PRODUCTION_DB_REFUSED}: automated tests refuse APP_ENV/NODE_ENV=production.`,
    };
  }
  return { ok: true };
}

function assertTestRuntimeDatabaseSafe(databaseUrl = process.env.DATABASE_URL, opts = {}) {
  if (!isAutomatedTestRuntime(opts)) return;
  const verdict = evaluateTestRuntimeDatabase(databaseUrl, opts.env || process.env);
  if (!verdict.ok) {
    const err = new Error(verdict.message);
    err.code = verdict.code;
    throw err;
  }
}

module.exports = {
  TEST_RUNTIME_PRODUCTION_DB_REFUSED,
  isAutomatedTestRuntime,
  evaluateTestRuntimeDatabase,
  assertTestRuntimeDatabaseSafe,
};
