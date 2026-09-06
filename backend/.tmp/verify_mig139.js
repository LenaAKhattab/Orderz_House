const path = require("path");
const BACKEND = "C:/Users/Batman/Desktop/Orderz_House/backend";
process.chdir(BACKEND);
module.paths.unshift(path.join(BACKEND, "node_modules"));
const { loadBackendEnv } = require(path.join(BACKEND, "src/config/loadBackendEnv"));
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require(path.join(BACKEND, "src/config/db"));
(async () => {
  const mig139 = await pool.query("SELECT version, applied_at FROM schema_migrations WHERE version LIKE '139%' ORDER BY version");
  const migCount = await pool.query("SELECT COUNT(*)::int AS c FROM schema_migrations");
  const pendingHint = await pool.query("SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version LIKE '14%'");
  let activation = null;
  try {
    const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='platform_settings' AND column_name ILIKE '%activation%'`);
    activation = { columns: r.rows };
  } catch (e) { activation = { error: e.message }; }
  // try common activation fee tables/settings
  const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%activation%' OR table_name ILIKE '%platform_setting%') ORDER BY 1`);
  console.log(JSON.stringify({ mig139: mig139.rows, appliedTotal: migCount.rows[0].c, tables: tables.rows }, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
