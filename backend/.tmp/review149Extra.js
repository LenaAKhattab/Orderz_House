const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");
const fs = require("fs");
const path = require("path");

(async () => {
  const ledger = await pool.query(
    `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`,
  );
  const free = await pool.query(
    `SELECT tier_code, article_access_level, monthly_price_jod
       FROM marketplace_membership_plans
      WHERE UPPER(tier_code) LIKE '%FREE%' OR monthly_price_jod = 0
      ORDER BY id LIMIT 5`,
  );
  const migDir = path.join(__dirname, "..", "sql", "migrations");
  const after149 = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .filter((f) => f > "149_marketplace_article_applications.sql");
  console.log(
    JSON.stringify(
      {
        bidLedgerEntries: ledger.rows[0].c,
        freePlans: free.rows,
        migrationsAfter149: after149,
      },
      null,
      2,
    ),
  );
  await pool.end();
})().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
});
