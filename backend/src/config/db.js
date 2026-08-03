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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});

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
  GENERATION_ADVISORY_LOCK_KEY,
  INSTITUTIONAL_RELEASE_ADVISORY_LOCK_KEY,
};
