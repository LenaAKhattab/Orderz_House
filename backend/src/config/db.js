const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Please configure backend/.env.");
}

/**
 * Session advisory lock key constants (kept for callers / docs).
 * Generation work uses transaction-scoped locks in fakeOrdersService.
 * Institutional release uses explicit acquire/release on the same client.
 * Do NOT unlock from pool "release" asynchronously — the client may already
 * be checked out by another request (pg concurrent-query race under load).
 */
const GENERATION_ADVISORY_LOCK_KEY = 882947361;
const INSTITUTIONAL_RELEASE_ADVISORY_LOCK_KEY = 913847201;

function resolvePoolSsl(databaseUrl = process.env.DATABASE_URL) {
  const url = String(databaseUrl || "");
  // Local / embedded Postgres typically has no TLS — forcing ssl breaks gate tests.
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url) || /host=(localhost|127\.0\.0\.1)/i.test(url)) {
    return false;
  }
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

function positiveIntEnv(name, fallback) {
  const raw = Number(process.env[name]);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return fallback;
}

/**
 * Fail acquisition and recycle idle clients so a saturated/stale Neon pool cannot
 * hang every HTTP request indefinitely (nginx then surfaces upstream timeouts).
 */
function resolvePoolOptions(databaseUrl = process.env.DATABASE_URL) {
  return {
    connectionString: databaseUrl,
    ssl: resolvePoolSsl(databaseUrl),
    max: positiveIntEnv("PG_POOL_MAX", 10),
    connectionTimeoutMillis: positiveIntEnv("PG_CONNECTION_TIMEOUT_MS", 10000),
    idleTimeoutMillis: positiveIntEnv("PG_IDLE_TIMEOUT_MS", 30000),
    maxUses: positiveIntEnv("PG_POOL_MAX_USES", 7500),
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Cap long-running queries so one stuck DB round-trip cannot pin a pool slot forever.
    options: `-c statement_timeout=${positiveIntEnv("PG_STATEMENT_TIMEOUT_MS", 30000)}`,
  };
}

const pool = new Pool(resolvePoolOptions());

pool.on("error", (err) => {
  // Idle client errors must not crash the process silently; log and keep serving.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      component: "db_pool",
      event: "idle_client_error",
      message: err?.message || String(err),
    }),
  );
});

const connectDB = async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log(`Database connected successfully at ${result.rows[0].now.toISOString()}`);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = {
  pool,
  connectDB,
  resolvePoolSsl,
  resolvePoolOptions,
  GENERATION_ADVISORY_LOCK_KEY,
  INSTITUTIONAL_RELEASE_ADVISORY_LOCK_KEY,
};
