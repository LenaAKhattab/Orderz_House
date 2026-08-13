/**
 * Schema probe for Super Admin Bid Distribution Pool (Phase D1).
 * Safe before migration 152 is applied.
 */

const { pool } = require("../config/db");

let bidPoolSchemaReady = null;

async function marketplaceBidDistributionPoolsSchemaReady(db = pool) {
  if (bidPoolSchemaReady === true) return true;
  if (bidPoolSchemaReady === false) return false;
  const { rows } = await db.query(
    `SELECT to_regclass('public.marketplace_bid_distribution_pools') AS pools,
            to_regclass('public.marketplace_bid_distribution_batches') AS batches,
            to_regclass('public.marketplace_bid_distribution_allocations') AS allocations,
            to_regclass('public.marketplace_bid_distribution_pool_events') AS events`,
  );
  const row = rows[0] || {};
  bidPoolSchemaReady = Boolean(row.pools && row.batches && row.allocations && row.events);
  return bidPoolSchemaReady;
}

function clearMarketplaceBidDistributionPoolsSchemaCache() {
  bidPoolSchemaReady = null;
}

module.exports = {
  marketplaceBidDistributionPoolsSchemaReady,
  clearMarketplaceBidDistributionPoolsSchemaCache,
};
