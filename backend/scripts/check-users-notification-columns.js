require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('browser_notification_status', 'notification_prompt_answered_at')
     ORDER BY 1`,
  );
  const mig = await pool.query(
    `SELECT version FROM schema_migrations
     WHERE version IN ('058_content_ads_last_clicked', '059_notification_realtime_browser')
     ORDER BY 1`,
  );
  console.log("columns:", cols.rows.map((r) => r.column_name));
  console.log("migrations:", mig.rows.map((r) => r.version));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
