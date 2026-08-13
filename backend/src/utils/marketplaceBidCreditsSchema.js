/**
 * Schema capability probes for Marketplace Bid Credits (Phase B1).
 * Safe before migration 146 is applied.
 */

const { pool } = require("../config/db");

let bidCreditsSchemaReady = null;

async function marketplaceBidCreditsSchemaReady(db = pool) {
  if (bidCreditsSchemaReady === true) return true;
  if (bidCreditsSchemaReady === false) return false;
  const { rows } = await db.query(
    `SELECT to_regclass('public.marketplace_bid_credit_grants') AS grants,
            to_regclass('public.marketplace_bid_credit_ledger_entries') AS ledger,
            to_regclass('public.marketplace_membership_bid_distribution_months') AS dist,
            to_regclass('public.marketplace_bid_credit_packages') AS packages`,
  );
  const row = rows[0] || {};
  bidCreditsSchemaReady = Boolean(row.grants && row.ledger && row.dist && row.packages);
  return bidCreditsSchemaReady;
}

async function marketplacePlanHasMonthlyBidAllowance(db = pool) {
  const { rows } = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_membership_plans'
        AND column_name = 'monthly_bid_allowance'
      LIMIT 1`,
  );
  return Boolean(rows[0]);
}

async function marketplaceEconomyHasBidCreditsEnabled(db = pool) {
  const { rows } = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_economy_settings'
        AND column_name = 'bid_credits_enabled'
      LIMIT 1`,
  );
  return Boolean(rows[0]);
}

function clearMarketplaceBidCreditsSchemaCache() {
  bidCreditsSchemaReady = null;
}

module.exports = {
  marketplaceBidCreditsSchemaReady,
  marketplacePlanHasMonthlyBidAllowance,
  marketplaceEconomyHasBidCreditsEnabled,
  clearMarketplaceBidCreditsSchemaCache,
};
