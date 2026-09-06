const path = require("path");
const BACKEND = "C:/Users/Batman/Desktop/Orderz_House/backend";
process.chdir(BACKEND);
module.paths.unshift(path.join(BACKEND, "node_modules"));
const { loadBackendEnv } = require(path.join(BACKEND, "src/config/loadBackendEnv"));
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require(path.join(BACKEND, "src/config/db"));

(async () => {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const mig = await q(
    "SELECT version, applied_at FROM schema_migrations WHERE version LIKE '139%' ORDER BY version",
  );
  const tables = await q(`
    SELECT to_regclass('public.freelancer_work_token_wallets') AS wallets,
           to_regclass('public.work_token_reservations') AS reservations,
           to_regclass('public.work_token_ledger_entries') AS ledger`);
  const counts = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM freelancer_work_token_wallets) AS wallets,
      (SELECT COUNT(*)::int FROM work_token_reservations) AS reservations,
      (SELECT COUNT(*)::int FROM work_token_ledger_entries) AS ledger`);
  const walletUniq = await q(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'freelancer_work_token_wallets'::regclass AND contype = 'u'`);
  const resUniq = await q(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'work_token_reservations'::regclass AND contype = 'u'`);
  const ledgerIdx = await q(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'work_token_ledger_entries' AND indexname LIKE '%idempotency%'`);
  const flags = await q(`
    SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled,
           marketplace_commission_enabled, cash_membership_payments_enabled,
           elite_engine_enabled, verification_bonuses_enabled
    FROM marketplace_economy_settings WHERE id = 1`);
  const tokens = await q(`
    SELECT tier_code, included_tokens_per_cycle
    FROM marketplace_membership_plans
    ORDER BY sort_order, id`);
  const p3 = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
      (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
      (SELECT COUNT(*)::int FROM marketplace_membership_cycle_usage) AS usage,
      (SELECT COUNT(*)::int FROM marketplace_membership_audit_logs) AS audit`);
  console.log(JSON.stringify({
    mig,
    tables: tables[0],
    counts: counts[0],
    walletUniq,
    resUniq,
    ledgerIdx,
    flags: flags[0],
    tokens,
    p3: p3[0],
    schemaMigrations139Count: mig.length,
  }, null, 2));
  await pool.end();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
