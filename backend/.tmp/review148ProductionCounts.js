/**
 * Production READ-ONLY counts for Migration 148 final review.
 * Does not mutate anything.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { pool } = require("../src/config/db");

async function one(sql) {
  const { rows } = await pool.query(sql);
  return rows[0];
}

(async () => {
  const out = {};
  out.m147 = await one(`SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version LIKE '147%'`);
  out.m148 = await one(`SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version LIKE '148%'`);
  out.memberships = await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`);
  out.cycles = await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`);
  out.packages = await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_packages`);
  out.grants = await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`);
  out.ledger = await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`);
  out.distMonths = await one(
    `SELECT COUNT(*)::int AS c FROM marketplace_membership_bid_distribution_months`,
  );
  out.bidEcon = await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`);
  out.pbAuctions = await one(`SELECT COUNT(*)::int AS c FROM priority_bid_auctions`);
  out.pbBids = await one(`SELECT COUNT(*)::int AS c FROM priority_auction_bids`);
  out.wtRes = await one(`SELECT COUNT(*)::int AS c FROM work_token_reservations`);
  out.articles = await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`);
  out.flags = await one(`
    SELECT bid_credits_enabled, priority_bidding_enabled, work_tokens_enabled,
           fair_work_distribution_enabled, elite_engine_enabled,
           marketplace_commission_enabled, cash_membership_payments_enabled,
           verification_bonuses_enabled
      FROM marketplace_economy_settings WHERE id = 1`);
  out.boostFlagCol = await one(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='marketplace_economy_settings'
         AND column_name='priority_application_boost_enabled'
    ) AS exists`);
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
