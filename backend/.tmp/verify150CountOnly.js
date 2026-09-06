const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");
(async () => {
  const a = await pool.query(
    `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version='150_article_application_bid_credit_economics'`,
  );
  const b = await pool.query(`SELECT COUNT(*)::int AS c FROM schema_migrations`);
  console.log(JSON.stringify({ mig150Count: a.rows[0].c, applied: b.rows[0].c }));
  await pool.end();
})();
