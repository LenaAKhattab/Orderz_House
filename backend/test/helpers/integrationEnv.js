/**
 * Shared guards for Postgres integration tests.
 *
 * Integration tests use ONLY INTEGRATION_TEST_DATABASE_URL — never the app DATABASE_URL from
 * backend/.env (which may be Production). The test database must be explicitly authorized;
 * a Production target is explicitly denied. Evaluation happens before any DB module is loaded.
 */
const { classifyDatabaseUrl, resolveAppEnv } = require("../../src/utils/databaseEnvironmentSafety");

const INTEGRATION_DB_ENV_VAR = "INTEGRATION_TEST_DATABASE_URL";
/** Inert URL for files whose unit tests load DB modules without integration access. */
const INTEGRATION_DISABLED_DATABASE_URL =
  "postgresql://127.0.0.1:5432/integration_db_not_configured_placeholder";

function getDatabaseUrl(env = process.env) {
  return String(env[INTEGRATION_DB_ENV_VAR] || "").trim();
}

function isPlaceholderDatabaseUrl(url = getDatabaseUrl()) {
  return /placeholder/i.test(url);
}

/**
 * @returns {{ ok: boolean, code: string, message: string, maskedTarget?: string }}
 */
function evaluateIntegrationDatabase(env = process.env) {
  const url = getDatabaseUrl(env);
  if (resolveAppEnv(env) === "production") {
    return {
      ok: false,
      code: "INTEGRATION_DB_PRODUCTION_ENV_REFUSED",
      message: "Integration DB tests refuse to run with APP_ENV/NODE_ENV=production.",
    };
  }
  if (!url || isPlaceholderDatabaseUrl(url)) {
    return {
      ok: false,
      code: "INTEGRATION_DB_NOT_CONFIGURED",
      message: `${INTEGRATION_DB_ENV_VAR} is not set; Postgres integration tests are skipped (DATABASE_URL is never used).`,
    };
  }
  const db = classifyDatabaseUrl(url, env);
  if (db.isProduction) {
    return {
      ok: false,
      code: "INTEGRATION_DB_PRODUCTION_REFUSED",
      message: `${INTEGRATION_DB_ENV_VAR} points at the Production database (${db.maskedTarget}); refused.`,
      maskedTarget: db.maskedTarget,
    };
  }
  return { ok: true, code: "INTEGRATION_DB_AUTHORIZED", message: "ok", maskedTarget: db.maskedTarget };
}

let reported = false;

/**
 * True only for an explicitly authorized non-Production integration DB (+ JWT secret).
 * On success, DATABASE_URL is switched to the integration DB for this process before any
 * DB module is required. Otherwise a Production DATABASE_URL is replaced with an inert
 * placeholder so nothing in this process can reach it.
 */
function isIntegrationEnvConfigured(env = process.env) {
  const verdict = evaluateIntegrationDatabase(env);
  const jwt = String(env.JWT_SECRET || "").trim();
  if (verdict.ok && jwt.length >= 16) {
    env.DATABASE_URL = getDatabaseUrl(env);
    return true;
  }
  if (classifyDatabaseUrl(env.DATABASE_URL, env).isProduction || !String(env.DATABASE_URL || "").trim()) {
    env.DATABASE_URL = INTEGRATION_DISABLED_DATABASE_URL;
  }
  if (!reported) {
    reported = true;
    // eslint-disable-next-line no-console
    console.warn(`[integration-db] skipped: ${verdict.ok ? "JWT_SECRET (16+ chars) is not set." : verdict.message}`);
  }
  return false;
}

module.exports = {
  INTEGRATION_DB_ENV_VAR,
  INTEGRATION_DISABLED_DATABASE_URL,
  getDatabaseUrl,
  isPlaceholderDatabaseUrl,
  evaluateIntegrationDatabase,
  isIntegrationEnvConfigured,
};
