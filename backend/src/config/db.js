const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Please configure backend/.env.");
}

/** Must match fakeOrdersService AUTOMATION_GENERATION_LOCK_KEY — cleared on pool client release. */
const GENERATION_ADVISORY_LOCK_KEY = 882947361;
/** Must match institutionalStorageService ADVISORY_LOCK_KEY — cleared on pool client release. */
const INSTITUTIONAL_RELEASE_ADVISORY_LOCK_KEY = 913847201;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});

/** Clear leaked session advisory locks when a pooled connection is returned. */
pool.on("release", (_err, client) => {
  if (!client || typeof client.query !== "function") return;
  // Defer unlock so we never race with an in-flight query on the same client (pg@9).
  setImmediate(() => {
    if (typeof client.query !== "function") return;
    client.query(`SELECT pg_advisory_unlock($1::bigint)`, [GENERATION_ADVISORY_LOCK_KEY]).catch(() => {});
    client
      .query(`SELECT pg_advisory_unlock($1::bigint)`, [INSTITUTIONAL_RELEASE_ADVISORY_LOCK_KEY])
      .catch(() => {});
  });
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
};
