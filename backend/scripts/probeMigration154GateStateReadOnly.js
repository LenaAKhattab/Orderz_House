const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");

async function main() {
  const a = await pool.query(
    `SELECT version FROM schema_migrations WHERE version LIKE '15%' ORDER BY version`,
  );
  console.log("15x_COUNT", a.rows.length);
  console.log(
    "15x_LAST10",
    JSON.stringify(a.rows.slice(-10).map((r) => r.version)),
  );
  const b = await pool.query(`SELECT COUNT(*)::int AS n FROM schema_migrations`);
  console.log("TOTAL", b.rows[0].n);
  const c = await pool.query(
    `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 8`,
  );
  console.log("LATEST", JSON.stringify(c.rows.map((r) => r.version)));
  const d = await pool.query(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version = '153_marketplace_membership_e1_bid_rules'`,
  );
  const e = await pool.query(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version = '154_marketplace_article_economy_e2'`,
  );
  console.log("HAS_153", d.rows[0].n, "HAS_154", e.rows[0].n);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
