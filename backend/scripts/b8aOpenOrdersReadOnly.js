require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) throw new Error("Expected Production");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  try {
    await pool.query("BEGIN READ ONLY");
    const sourceDist = (
      await pool.query(`
        SELECT COALESCE(source_type,'(null)') AS source_type, COUNT(*)::int AS c
          FROM orders
         WHERE project_type='bidding'
           AND is_published=TRUE
           AND is_open_for_pool=TRUE
           AND order_status='open_for_bids'
           AND assigned_freelancer_id IS NULL
         GROUP BY 1 ORDER BY c DESC`)
    ).rows;
    const realOpen = (
      await pool.query(`
        SELECT COUNT(*)::int AS c
          FROM orders
         WHERE project_type='bidding'
           AND is_published=TRUE
           AND is_open_for_pool=TRUE
           AND order_status='open_for_bids'
           AND assigned_freelancer_id IS NULL
           AND COALESCE(source_type,'real') NOT IN ('fake','training')`)
    ).rows[0].c;
    const pendingOnRealOpen = (
      await pool.query(`
        SELECT COUNT(*)::int AS c
          FROM order_freelancer_bids ofb
          JOIN orders o ON o.id = ofb.order_id
         WHERE o.project_type='bidding'
           AND o.is_published=TRUE
           AND o.is_open_for_pool=TRUE
           AND o.order_status='open_for_bids'
           AND o.assigned_freelancer_id IS NULL
           AND COALESCE(o.source_type,'real') NOT IN ('fake','training')`)
    ).rows[0].c;
    await pool.query("ROLLBACK");
    console.log(JSON.stringify({ sourceDist, realOpen: Number(realOpen), pendingOnRealOpen: Number(pendingOnRealOpen) }, null, 2));
  } finally {
    await pool.end();
  }
}
main();
