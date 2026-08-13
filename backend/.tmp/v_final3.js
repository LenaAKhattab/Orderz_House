const path = require("path");
const BACKEND = "C:/Users/Batman/Desktop/Orderz_House/backend";
process.chdir(BACKEND);
module.paths.unshift(path.join(BACKEND, "node_modules"));
const { loadBackendEnv } = require(path.join(BACKEND, "src/config/loadBackendEnv"));
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require(path.join(BACKEND, "src/config/db"));
(async () => {
  const counts = (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
    (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
    (SELECT COUNT(*)::int FROM marketplace_membership_cycle_usage) AS usage,
    (SELECT COUNT(*)::int FROM marketplace_membership_audit_logs) AS audit,
    (SELECT COUNT(*)::int FROM freelancer_work_token_wallets) AS wallets,
    (SELECT COUNT(*)::int FROM work_token_reservations) AS reservations,
    (SELECT COUNT(*)::int FROM work_token_ledger_entries) AS ledger`)).rows[0];
  const flags = (await pool.query(`SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled,
    marketplace_commission_enabled, cash_membership_payments_enabled, elite_engine_enabled, verification_bonuses_enabled
    FROM marketplace_economy_settings WHERE id=1`)).rows[0];
  const plans = (await pool.query(`SELECT tier_code, included_tokens_per_cycle, priority_bid_uses_per_cycle, monthly_price_jod
    FROM marketplace_membership_plans ORDER BY sort_order, id`)).rows;
  const mig139 = (await pool.query(`SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version='139_marketplace_work_token_wallet_ledger'`)).rows[0];
  // hardening constraints present in DB
  const cons = (await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid IN ('work_token_reservations'::regclass, 'work_token_ledger_entries'::regclass)
      AND contype='u'
    ORDER BY 1`)).rows;
  const idxs = (await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('work_token_reservations','work_token_ledger_entries')
      AND (indexdef ILIKE '%idempotency%' OR indexdef ILIKE '%reference%' OR indexname ILIKE '%uidx%')
    ORDER BY 1`)).rows;
  console.log(JSON.stringify({ counts, flags, plans, mig139, cons, idxs }, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
