const path = require("path");
process.chdir("C:/Users/Batman/Desktop/Orderz_House/backend");
module.paths.unshift(path.join(process.cwd(), "node_modules"));
require("./src/config/loadBackendEnv").loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("./src/config/db");
(async () => {
  const mig = await pool.query(`SELECT version FROM schema_migrations WHERE version LIKE '139%' OR version LIKE '140%' ORDER BY 1`);
  const flags = await pool.query(`SELECT work_tokens_enabled, normal_application_token_refund_percentage FROM marketplace_economy_settings WHERE id=1`);
  const econ = await pool.query(`SELECT to_regclass('public.order_freelancer_bid_work_token_economics') AS t`);
  const chk = await pool.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'orders_currency_by_project_type_chk'
  `);
  console.log(JSON.stringify({ mig: mig.rows, flags: flags.rows[0], economicsTable: econ.rows[0].t, ordersBudgetCheck: chk.rows[0]?.def || null }, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
