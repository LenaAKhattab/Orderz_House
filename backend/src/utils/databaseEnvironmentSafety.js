/**
 * Shared database + APP_ENV safety classification.
 * Never logs credentials or full DATABASE_URL.
 *
 * Incident context: local NODE_ENV=development + CLIENT_URL=localhost coexisted with
 * shared/production Neon + Live Stripe in backend/.env, so migrations 130/131 were
 * applied to production from a local QA session. These guards make that fail closed.
 */

const KNOWN_PRODUCTION_HOST_MARKERS = Object.freeze([
  // Exact shared/live Neon pooler used by Orderz House (confirmed).
  "ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech",
  // Broader endpoint marker (covers pooler / non-pooler variants).
  "ep-wandering-cherry-ah474lak",
  "ep-wandering-cherry",
]);

const KNOWN_PRODUCTION_DATABASE_NAMES = Object.freeze(["neondb"]);

const APP_ENV_VALUES = Object.freeze(["local", "test", "sandbox", "staging", "production"]);

const PRODUCTION_MIGRATE_CONFIRM_VALUE = "orderzhouse-production";

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  const raw = String(databaseUrl || "").trim();
  if (!raw) {
    return { hasUrl: false, host: null, database: null, port: null };
  }
  try {
    const normalized = raw.replace(/^postgresql:/i, "postgres:");
    const u = new URL(normalized);
    return {
      hasUrl: true,
      host: u.hostname || null,
      database: (u.pathname || "").replace(/^\//, "") || null,
      port: u.port || null,
    };
  } catch {
    return { hasUrl: true, host: null, database: null, port: null, parseFailed: true };
  }
}

function maskDatabaseTarget(databaseUrl = process.env.DATABASE_URL) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed.hasUrl) return "(DATABASE_URL not set)";
  if (parsed.parseFailed || !parsed.host) return "(DATABASE_URL set, unparsed)";
  const db = parsed.database || "?";
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${parsed.host}${port}/${db}`;
}

function getConfiguredProductionHostMarkers(env = process.env) {
  const extra = String(env.PRODUCTION_DATABASE_HOST || env.PRODUCTION_DATABASE_MARKER || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...KNOWN_PRODUCTION_HOST_MARKERS.map((h) => h.toLowerCase()), ...extra];
}

/**
 * @returns {"local"|"test"|"sandbox"|"staging"|"production"}
 */
function resolveAppEnv(env = process.env) {
  const explicit = String(env.APP_ENV || "").trim().toLowerCase();
  if (APP_ENV_VALUES.includes(explicit)) return explicit;

  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "local";
}

/**
 * Classify DATABASE_URL without credentials.
 */
function classifyDatabaseUrl(databaseUrl = process.env.DATABASE_URL, env = process.env) {
  const parsed = parseDatabaseUrl(databaseUrl);
  const maskedTarget = maskDatabaseTarget(databaseUrl);
  if (!parsed.hasUrl) {
    return {
      classification: "MISSING",
      isProduction: false,
      host: null,
      database: null,
      maskedTarget,
      matchedMarker: null,
      looksLocal: false,
    };
  }

  const host = parsed.host;
  const database = parsed.database;
  const hostLower = String(host || "").toLowerCase();
  const markers = getConfiguredProductionHostMarkers(env);
  const matchedMarker = markers.find((m) => hostLower.includes(m)) || null;
  const looksLocal = hostLower === "localhost" || hostLower === "127.0.0.1";
  const looksIsolatedName =
    /sandbox|stripe.?qa|_test\b|\/orderz_house_test|qa_renewal|fazat_e2e|orderz_fazat/i.test(
      `${hostLower} ${database || ""} ${String(databaseUrl || "")}`,
    );
  const stagingHint = /staging|stage/i.test(`${hostLower} ${database || ""}`);

  let classification = "UNKNOWN_REMOTE";
  if (looksLocal) classification = "LOCAL";
  else if (matchedMarker) classification = "PRODUCTION";
  else if (looksIsolatedName) classification = "ISOLATED_TEST";
  else if (stagingHint) classification = "STAGING_REMOTE";

  if (
    matchedMarker &&
    database &&
    KNOWN_PRODUCTION_DATABASE_NAMES.includes(String(database).toLowerCase())
  ) {
    classification = "PRODUCTION";
  }

  return {
    classification,
    isProduction: classification === "PRODUCTION",
    host,
    database,
    maskedTarget,
    matchedMarker,
    looksLocal,
  };
}

function getDatabaseEnvironment(env = process.env) {
  const appEnv = resolveAppEnv(env);
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  return {
    appEnv,
    nodeEnv: String(env.NODE_ENV || "").trim() || "(unset)",
    db,
    clientUrl: String(env.CLIENT_URL || "").trim() || "(unset)",
  };
}

function isProductionDatabase(databaseUrl = process.env.DATABASE_URL, env = process.env) {
  return classifyDatabaseUrl(databaseUrl, env).isProduction;
}

function createSafetyError(code, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = 500;
  err.exposeToClient = false;
  return err;
}

function assertNonProductionDatabase(operation = "database write", env = process.env) {
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  if (!db.isProduction) return db;

  throw createSafetyError(
    "PRODUCTION_DATABASE_WRITE_BLOCKED",
    [
      "PRODUCTION_DATABASE_WRITE_BLOCKED",
      `Target database: ${db.maskedTarget}`,
      `Operation: ${operation}`,
      "Normal local/QA commands must not write to the shared/production Neon database.",
      "Use an isolated local Postgres or Neon branch, or the deliberate production migration command with approvals.",
    ].join("\n"),
  );
}

function assertProductionDatabase(operation = "production operation", env = process.env) {
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  if (db.isProduction) return db;
  throw createSafetyError(
    "PRODUCTION_DATABASE_REQUIRED",
    [
      "PRODUCTION_DATABASE_REQUIRED",
      `Target database: ${db.maskedTarget} (classification=${db.classification})`,
      `Operation: ${operation}`,
      "This command expects the known production/shared database.",
    ].join("\n"),
  );
}

function hasProductionMigrationApprovals(env = process.env) {
  return (
    resolveAppEnv(env) === "production" &&
    truthy(env.ALLOW_PRODUCTION_DB_MIGRATIONS) &&
    String(env.CONFIRM_PRODUCTION_DATABASE || "").trim() === PRODUCTION_MIGRATE_CONFIRM_VALUE &&
    truthy(env.PRODUCTION_BACKUP_CONFIRMED)
  );
}

function assertNonProductionMigrationAllowed(operation = "database migration", env = process.env) {
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  if (!db.isProduction) return { mode: "non_production", db };

  throw createSafetyError(
    "PRODUCTION_DATABASE_WRITE_BLOCKED",
    [
      "PRODUCTION_DATABASE_WRITE_BLOCKED",
      `Target database: ${db.maskedTarget}`,
      `Operation: ${operation}`,
      "npm run db:migrate is NON-PRODUCTION ONLY.",
      "For deliberate production schema changes use: npm run db:migrate:production",
      "with APP_ENV=production, ALLOW_PRODUCTION_DB_MIGRATIONS=1,",
      `CONFIRM_PRODUCTION_DATABASE=${PRODUCTION_MIGRATE_CONFIRM_VALUE},`,
      "and PRODUCTION_BACKUP_CONFIRMED=1.",
      "For Neon branch staging-ord20 use: npm run db:migrate:staging (loads backend/.env.staging only).",
    ].join("\n"),
  );
}

function assertStagingMigrationAllowed(operation = "staging database migration", env = process.env) {
  const appEnv = resolveAppEnv(env);
  if (appEnv !== "staging") {
    throw createSafetyError(
      "STAGING_APP_ENV_REQUIRED",
      [
        "STAGING_APP_ENV_REQUIRED",
        `APP_ENV must be "staging" (got "${appEnv || "(unset)"}").`,
        `Operation: ${operation}`,
        "Use backend/.env.staging — never run staging migrations with production backend/.env.",
      ].join("\n"),
    );
  }

  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  if (!String(env.DATABASE_URL || "").trim()) {
    throw createSafetyError(
      "STAGING_DATABASE_URL_REQUIRED",
      [
        "STAGING_DATABASE_URL_REQUIRED",
        "DATABASE_URL must be set in backend/.env.staging.",
        `Operation: ${operation}`,
      ].join("\n"),
    );
  }

  if (db.isProduction) {
    throw createSafetyError(
      "STAGING_DATABASE_PRODUCTION_BLOCKED",
      [
        "BLOCKED: database appears to be Production.",
        `Target database: ${db.maskedTarget}`,
        `Classification: ${db.classification}`,
        `Operation: ${operation}`,
        "Point backend/.env.staging at the Neon branch staging-ord20 (not the main/production endpoint).",
      ].join("\n"),
    );
  }

  return { mode: "staging", db, appEnv };
}

function assertProductionMigrationAllowed(operation = "production database migration", env = process.env) {
  const appEnv = resolveAppEnv(env);
  const db = assertProductionDatabase(operation, env);

  if (appEnv !== "production") {
    throw createSafetyError(
      "PRODUCTION_MIGRATION_APP_ENV_REQUIRED",
      [
        "PRODUCTION_MIGRATION_APP_ENV_REQUIRED",
        `APP_ENV must be "production" (got "${appEnv}").`,
        `Target database: ${db.maskedTarget}`,
        `Operation: ${operation}`,
      ].join("\n"),
    );
  }

  if (!truthy(env.ALLOW_PRODUCTION_DB_MIGRATIONS)) {
    throw createSafetyError(
      "PRODUCTION_MIGRATION_APPROVAL_REQUIRED",
      [
        "PRODUCTION_MIGRATION_APPROVAL_REQUIRED",
        "Set ALLOW_PRODUCTION_DB_MIGRATIONS=1 for this deployment-only command.",
        `Target database: ${db.maskedTarget}`,
      ].join("\n"),
    );
  }

  if (String(env.CONFIRM_PRODUCTION_DATABASE || "").trim() !== PRODUCTION_MIGRATE_CONFIRM_VALUE) {
    throw createSafetyError(
      "PRODUCTION_MIGRATION_CONFIRM_REQUIRED",
      [
        "PRODUCTION_MIGRATION_CONFIRM_REQUIRED",
        `Set CONFIRM_PRODUCTION_DATABASE=${PRODUCTION_MIGRATE_CONFIRM_VALUE}`,
        `Target database: ${db.maskedTarget}`,
      ].join("\n"),
    );
  }

  if (!truthy(env.PRODUCTION_BACKUP_CONFIRMED)) {
    throw createSafetyError(
      "PRODUCTION_BACKUP_CONFIRM_REQUIRED",
      [
        "PRODUCTION_BACKUP_CONFIRM_REQUIRED",
        "Confirm Neon restore point / branch / backup before migrating.",
        "Set PRODUCTION_BACKUP_CONFIRMED=1 only after that checklist is complete.",
        `Target database: ${db.maskedTarget}`,
      ].join("\n"),
    );
  }

  return { mode: "production", db, appEnv };
}

function assertQaMutationAllowed(operation = "QA / seed mutation", env = process.env) {
  try {
    return assertNonProductionDatabase(operation, env);
  } catch (err) {
    if (err && err.code === "PRODUCTION_DATABASE_WRITE_BLOCKED") {
      throw createSafetyError(
        "QA_PRODUCTION_DATABASE_BLOCKED",
        [
          "QA_PRODUCTION_DATABASE_BLOCKED",
          `Target database: ${classifyDatabaseUrl(env.DATABASE_URL, env).maskedTarget}`,
          `Operation: ${operation}`,
          "QA/seed scripts must use an isolated local or sandbox database.",
        ].join("\n"),
      );
    }
    throw err;
  }
}

/**
 * Deliberate production-capable admin/repair scripts (not generic QA seeds).
 * Production DB requires multi-flag approval; non-production always allowed.
 */
function assertOperationalScriptAllowed(operation = "operational admin script", env = process.env) {
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  if (!db.isProduction) return { mode: "non_production", db };

  if (!truthy(env.ALLOW_PRODUCTION_OPERATIONAL_SCRIPT)) {
    throw createSafetyError(
      "PRODUCTION_OPERATIONAL_SCRIPT_BLOCKED",
      [
        "PRODUCTION_OPERATIONAL_SCRIPT_BLOCKED",
        `Target database: ${db.maskedTarget}`,
        `Operation: ${operation}`,
        "Set ALLOW_PRODUCTION_OPERATIONAL_SCRIPT=1 and",
        `CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT=${PRODUCTION_MIGRATE_CONFIRM_VALUE}`,
        "only for deliberate production repairs.",
      ].join("\n"),
    );
  }
  if (String(env.CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT || "").trim() !== PRODUCTION_MIGRATE_CONFIRM_VALUE) {
    throw createSafetyError(
      "PRODUCTION_OPERATIONAL_CONFIRM_REQUIRED",
      [
        "PRODUCTION_OPERATIONAL_CONFIRM_REQUIRED",
        `Set CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT=${PRODUCTION_MIGRATE_CONFIRM_VALUE}`,
        `Target database: ${db.maskedTarget}`,
        `Operation: ${operation}`,
      ].join("\n"),
    );
  }
  return { mode: "production", db };
}

function getStripeMode(env = process.env) {
  const k = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!k) return "missing";
  if (k.startsWith("sk_test_")) return "test";
  if (k.startsWith("sk_live_")) return "live";
  return "unknown";
}

function evaluateMixedEnvironment(env = process.env) {
  const appEnv = resolveAppEnv(env);
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  const stripeMode = getStripeMode(env);
  const clientUrl = String(env.CLIENT_URL || "").trim();
  const issues = [];

  if (["local", "test", "sandbox"].includes(appEnv) && db.isProduction) {
    issues.push(
      `APP_ENV=${appEnv} cannot use production/shared DATABASE_URL (${db.maskedTarget}).`,
    );
  }

  if (["local", "test"].includes(appEnv) && stripeMode === "live") {
    if (!truthy(env.ALLOW_LIVE_STRIPE_IN_LOCAL)) {
      issues.push(
        `APP_ENV=${appEnv} cannot use Live Stripe (sk_live_) without ALLOW_LIVE_STRIPE_IN_LOCAL=1.`,
      );
    }
  }

  if (appEnv === "sandbox" && stripeMode === "live") {
    issues.push("APP_ENV=sandbox cannot use Live Stripe keys.");
  }

  if (appEnv === "production" && stripeMode === "test") {
    issues.push("APP_ENV=production cannot use Stripe TEST keys (sk_test_).");
  }

  if (appEnv === "production" && db.looksLocal) {
    issues.push("APP_ENV=production cannot use localhost DATABASE_URL.");
  }

  if (appEnv === "production" && /localhost|127\.0\.0\.1/i.test(clientUrl)) {
    issues.push("APP_ENV=production cannot use localhost CLIENT_URL.");
  }

  if (!issues.length) {
    return { ok: true, issues: [], appEnv, db, stripeMode };
  }

  const code =
    db.isProduction && ["local", "test", "sandbox"].includes(appEnv)
      ? "UNSAFE_MIXED_ENVIRONMENT"
      : "ENVIRONMENT_COMBINATION_BLOCKED";

  return {
    ok: false,
    code,
    message: [code, ...issues].join("\n"),
    issues,
    appEnv,
    db,
    stripeMode,
  };
}

function assertRuntimeEnvironmentSafe(env = process.env) {
  const result = evaluateMixedEnvironment(env);
  if (result.ok) return result;
  throw createSafetyError(result.code, result.message);
}

function printEnvironmentBanner(env = process.env, opts = {}) {
  const info = getDatabaseEnvironment(env);
  const stripeMode = getStripeMode(env).toUpperCase();
  const dbClass = info.db.classification;
  const isProd = info.appEnv === "production" || info.db.isProduction;
  const lines = [
    "",
    "══════════════════════════════════════════════════════════",
    " Orderz House Backend",
    ` APP_ENV:           ${info.appEnv}${isProd ? "  <<< PRODUCTION CONTEXT" : ""}`,
    ` NODE_ENV:          ${info.nodeEnv}`,
    ` DB:                ${info.db.maskedTarget}`,
    ` DB classification: ${dbClass}${info.db.isProduction ? "  <<< PRODUCTION/SHARED" : ""}`,
    ` Stripe mode:       ${stripeMode}${stripeMode === "LIVE" && info.appEnv !== "production" ? "  <<< REVIEW" : ""}`,
    ` Client URL:        ${info.clientUrl}`,
    "══════════════════════════════════════════════════════════",
    "",
  ];
  const log = opts.log || console.log;
  for (const line of lines) log(line);
  return info;
}

function scanSqlForDangerousStatements(sqlText) {
  const text = String(sqlText || "");
  const upper = text.toUpperCase();
  const findings = [];
  const patterns = [
    { re: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
    { re: /\bDROP\s+COLUMN\b/i, label: "DROP COLUMN" },
    { re: /\bTRUNCATE\b/i, label: "TRUNCATE" },
    { re: /\bDROP\s+SCHEMA\b/i, label: "DROP SCHEMA" },
    { re: /\bALTER\s+TYPE\b/i, label: "ALTER TYPE" },
    { re: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
  ];
  for (const p of patterns) {
    if (p.re.test(text)) findings.push(p.label);
  }
  if (/\bDELETE\s+FROM\b/i.test(upper) && !/\bDELETE\s+FROM\b[\s\S]*?\bWHERE\b/i.test(upper)) {
    findings.push("DELETE without WHERE (heuristic)");
  }
  return {
    dangerous: findings.length > 0,
    findings: [...new Set(findings)],
  };
}

module.exports = {
  APP_ENV_VALUES,
  KNOWN_PRODUCTION_HOST_MARKERS,
  KNOWN_PRODUCTION_DATABASE_NAMES,
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
  truthy,
  parseDatabaseUrl,
  maskDatabaseTarget,
  resolveAppEnv,
  classifyDatabaseUrl,
  getDatabaseEnvironment,
  isProductionDatabase,
  assertNonProductionDatabase,
  assertProductionDatabase,
  assertNonProductionMigrationAllowed,
  assertStagingMigrationAllowed,
  assertProductionMigrationAllowed,
  hasProductionMigrationApprovals,
  assertQaMutationAllowed,
  assertOperationalScriptAllowed,
  getStripeMode,
  evaluateMixedEnvironment,
  assertRuntimeEnvironmentSafe,
  printEnvironmentBanner,
  scanSqlForDangerousStatements,
  createSafetyError,
};
