require("dotenv").config();
const { pool } = require("../src/config/db");

async function main() {
  const m = await pool.query(
    `SELECT version FROM schema_migrations WHERE version = '097_fake_orders_admin_perf_indexes'`,
  );
  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_fake_orders_eligible_pool_admin', 'idx_fake_orders_source_type')`,
  );
  console.log(
    JSON.stringify(
      {
        migration097Applied: m.rows.length > 0,
        indexes: idx.rows.map((r) => r.indexname),
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
