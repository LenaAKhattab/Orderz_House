const path = require("path");
const BACKEND = "C:/Users/Batman/Desktop/Orderz_House/backend";
process.chdir(BACKEND);
module.paths.unshift(path.join(BACKEND, "node_modules"));
const { loadBackendEnv } = require(path.join(BACKEND, "src/config/loadBackendEnv"));
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require(path.join(BACKEND, "src/config/db"));
(async () => {
  const q = async (sql) => (await pool.query(sql)).rows;
  const mig = await q("SELECT version FROM schema_migrations WHERE version LIKE '139%'");
  const counts = await q(`SELECT
    (SELECT COUNT(*)::int FROM freelancer_work_token_wallets) AS wallets,
    (SELECT COUNT(*)::int FROM work_token_reservations) AS reservations,
    (SELECT COUNT(*)::int FROM work_token_ledger_entries) AS ledger,
    (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
    (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
    (SELECT COUNT(*)::int FROM marketplace_membership_cycle_usage) AS usage,
    (SELECT COUNT(*)::int FROM marketplace_membership_audit_logs) AS audit`);
  const flags = await q(`SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled,
    marketplace_commission_enabled, cash_membership_payments_enabled, elite_engine_enabled, verification_bonuses_enabled
    FROM marketplace_economy_settings WHERE id=1`);
  const plans = await q(`SELECT tier_code, included_tokens_per_cycle, priority_bid_uses_per_cycle
    FROM marketplace_membership_plans ORDER BY sort_order, id`);
  console.log(JSON.stringify({ mig, counts: counts[0], flags: flags[0], plans }, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
