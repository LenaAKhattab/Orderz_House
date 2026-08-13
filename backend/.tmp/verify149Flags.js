const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");

(async () => {
  const f = await pool.query(`
    SELECT bid_credits_enabled, priority_application_boost_enabled, priority_bidding_enabled,
           work_tokens_enabled, fair_work_distribution_enabled, elite_engine_enabled,
           marketplace_commission_enabled, cash_membership_payments_enabled,
           verification_bonuses_enabled, article_applications_enabled
      FROM marketplace_economy_settings WHERE id = 1`);
  const c = await pool.query(`
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='marketplace_economy_settings'
       AND column_name='article_applications_enabled'`);
  const m = await pool.query(`
    SELECT COUNT(*)::int AS c FROM schema_migrations
     WHERE version='149_marketplace_article_applications'`);
  console.log(JSON.stringify({ flags: f.rows[0], flagCol: c.rows[0], mig149: m.rows[0].c }, null, 2));
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
