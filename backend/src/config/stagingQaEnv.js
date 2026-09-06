/**
 * Local Staging QA env helpers.
 *
 * Loads backend/.env.staging for critical keys and refuses Production DB.
 * Does NOT change production `npm start` behavior.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const {
  classifyDatabaseUrl,
  maskDatabaseTarget,
  resolveAppEnv,
  getStripeMode,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../utils/databaseEnvironmentSafety");

const STAGING_CRITICAL_KEYS = Object.freeze([
  "APP_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "CLIENT_URL",
]);

function createStagingQaError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function resolveBackendRoot(explicitRoot) {
  if (explicitRoot) return explicitRoot;
  return path.join(__dirname, "..", "..");
}

function stagingEnvPath(root) {
  return path.join(root, ".env.staging");
}

/**
 * Force-load keys from backend/.env.staging (override for keys present in that file).
 * Optionally fill remaining unset keys from backend/.env (never overrides staging keys).
 *
 * @param {{
 *   root?: string,
 *   fillFromDefaultEnv?: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
function loadStagingQaEnv(opts = {}) {
  const {
    root = resolveBackendRoot(),
    fillFromDefaultEnv = true,
    env = process.env,
  } = opts;

  const filePath = stagingEnvPath(root);
  if (!fs.existsSync(filePath)) {
    throw createStagingQaError(
      "STAGING_ENV_MISSING",
      `STAGING_ENV_MISSING: required file missing: ${filePath}. Copy backend/.env.staging.example → backend/.env.staging.`,
    );
  }

  const parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    env[key] = value;
    applied.push(key);
  }

  if (fillFromDefaultEnv) {
    const defaultPath = path.join(root, ".env");
    if (fs.existsSync(defaultPath)) {
      // Fill only unset keys — never clobber staging DATABASE_URL / APP_ENV.
      const defaults = dotenv.parse(fs.readFileSync(defaultPath, "utf8"));
      for (const [key, value] of Object.entries(defaults)) {
        if (env[key] === undefined || env[key] === null || String(env[key]).trim() === "") {
          env[key] = value;
        }
      }
    }
  }

  return {
    root,
    stagingPath: filePath,
    appliedKeys: applied,
    criticalPresent: STAGING_CRITICAL_KEYS.filter((k) => String(env[k] || "").trim()),
  };
}

/**
 * Fail closed for local Staging QA: APP_ENV=staging and non-Production DB.
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertStagingQaTarget(env = process.env) {
  const appEnv = resolveAppEnv(env);
  if (appEnv !== "staging") {
    throw createStagingQaError(
      "STAGING_APP_ENV_REQUIRED",
      `STAGING_APP_ENV_REQUIRED: APP_ENV must be "staging" for local Staging QA (got "${appEnv}"). Use backend/.env.staging.`,
    );
  }

  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  const hostLower = String(db.host || "").toLowerCase();
  const hitsKnownProd = KNOWN_PRODUCTION_HOST_MARKERS.some((m) =>
    hostLower.includes(String(m).toLowerCase()),
  );

  if (db.isProduction || hitsKnownProd || db.classification === "PRODUCTION") {
    throw createStagingQaError(
      "STAGING_PRODUCTION_DB_REFUSED",
      [
        "STAGING_PRODUCTION_DB_REFUSED",
        `Target database: ${db.maskedTarget}`,
        `Classification: ${db.classification}`,
        "Local Staging QA must not use the Production Neon host (ep-wandering-cherry…).",
        "Fix DATABASE_URL in backend/.env.staging and retry.",
      ].join("\n"),
    );
  }

  if (!String(env.DATABASE_URL || "").trim()) {
    throw createStagingQaError(
      "STAGING_DATABASE_URL_MISSING",
      "STAGING_DATABASE_URL_MISSING: DATABASE_URL is empty after loading .env.staging.",
    );
  }

  return {
    appEnv,
    db,
    maskedTarget: db.maskedTarget || maskDatabaseTarget(env.DATABASE_URL),
    stripeMode: getStripeMode(env),
  };
}

/**
 * Read-only pending migration count. Returns null if DB unreachable.
 * @param {{ pool?: import("pg").Pool, env?: NodeJS.ProcessEnv, root?: string }} [opts]
 */
async function countPendingMigrations(opts = {}) {
  const { env = process.env, root = resolveBackendRoot() } = opts;
  let pool = opts.pool;
  let createdPool = false;
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 15000,
      statement_timeout: 20000,
    });
    createdPool = true;
  }

  const migrationsDir = path.join(root, "sql", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    let applied = [];
    try {
      const { rows } = await client.query(`SELECT version FROM schema_migrations`);
      applied = rows.map((r) => r.version);
    } catch (err) {
      if (err && err.code === "42P01") applied = [];
      else throw err;
    }
    const appliedSet = new Set(applied);
    // schema_migrations stores version without .sql — match migrateStatus.js
    const pendingFiles = files.filter((f) => !appliedSet.has(f.replace(/\.sql$/i, "")));
    return {
      appliedCount: applied.length,
      pendingCount: pendingFiles.length,
      pendingSample: pendingFiles.slice(0, 5),
    };
  } finally {
    client.release();
    if (createdPool) await pool.end();
  }
}

/**
 * Fail when DATABASE_URL session is read-only (pooler default_transaction_read_only=on).
 * Must use a fresh connection — do not reuse countPendingMigrations' client
 * (that helper sets session RO for its own safety).
 *
 * @param {{ pool?: import("pg").Pool, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<string>} 'on' | 'off' (or other SHOW value)
 */
async function assertDatabaseWritable(opts = {}) {
  const { env = process.env } = opts;
  let pool = opts.pool;
  let createdPool = false;
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 15000,
      statement_timeout: 20000,
    });
    createdPool = true;
  }

  const client = await pool.connect();
  try {
    const result = await client.query("SHOW default_transaction_read_only");
    const value = String(
      result.rows?.[0]?.default_transaction_read_only || "",
    )
      .trim()
      .toLowerCase();
    if (value === "on") {
      throw createStagingQaError(
        "STAGING_DATABASE_READ_ONLY",
        "BLOCKED: Staging DATABASE_URL is read-only. Use a writable Staging connection.",
      );
    }
    return value || "off";
  } finally {
    client.release();
    if (createdPool) await pool.end();
  }
}

/**
 * Harmless Staging-only write probe: temp table + INSERT + ROLLBACK.
 * Call only after assertStagingQaTarget (never Production).
 *
 * @param {{ pool?: import("pg").Pool, env?: NodeJS.ProcessEnv }} [opts]
 */
async function assertStagingWriteProbe(opts = {}) {
  const { env = process.env } = opts;
  let pool = opts.pool;
  let createdPool = false;
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 15000,
      statement_timeout: 20000,
    });
    createdPool = true;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE TEMP TABLE qa_write_check(id int)");
      await client.query("INSERT INTO qa_write_check VALUES (1)");
    } finally {
      await client.query("ROLLBACK");
    }
    return "ok";
  } finally {
    client.release();
    if (createdPool) await pool.end();
  }
}

function collectStagingQaWarnings(env = process.env) {
  const warnings = [];
  const stripeMode = getStripeMode(env);
  if (stripeMode === "live") {
    warnings.push("Stripe mode is LIVE (sk_live_). Do not trigger checkout during Staging QA.");
  }
  if (truthy(env.BILDAZO_ARTICLE_PUBLISH_ENABLED)) {
    warnings.push("BILDAZO_ARTICLE_PUBLISH_ENABLED is on — avoid article approve/publish paths that enqueue Bildazo.");
  }
  if (truthy(env.BILDAZO_AUTHOR_SYNC_ENABLED)) {
    warnings.push("BILDAZO_AUTHOR_SYNC_ENABLED is on — S2S author sync may call Bildazo.");
  }
  if (truthy(env.BILDAZO_AUTHOR_GATE_ENABLED)) {
    warnings.push("BILDAZO_AUTHOR_GATE_ENABLED is on (gate only; still avoid live Bildazo publish).");
  }
  return warnings;
}

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function printStagingBanner(target, extra = {}) {
  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "══════════════════════════════════════════════════════════",
      " Orderz House — Staging QA",
      ` APP_ENV:           ${target.appEnv}`,
      ` DB:                ${target.maskedTarget}`,
      ` DB classification: ${target.db.classification}`,
      ` Stripe mode:       ${String(target.stripeMode || "unknown").toUpperCase()}`,
      extra.pendingCount !== undefined ? ` Pending migrations: ${extra.pendingCount}` : null,
      "══════════════════════════════════════════════════════════",
      "",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );
}

module.exports = {
  STAGING_CRITICAL_KEYS,
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
  assertDatabaseWritable,
  assertStagingWriteProbe,
  collectStagingQaWarnings,
  printStagingBanner,
  resolveBackendRoot,
  stagingEnvPath,
  createStagingQaError,
};
