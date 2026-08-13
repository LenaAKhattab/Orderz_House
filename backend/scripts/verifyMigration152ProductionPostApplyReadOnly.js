/**
 * READ ONLY post-apply verification for Migration 152.
 * Never mutates Production.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const {
  BID_POOL_TOTAL_SOURCE,
  ADMIN_BID_POOL_GRANT_SOURCE,
  POOL_EXPIRED_UNUSED_BIDS_RETURN,
  POOL_CONSUMED_BIDS_RETURN,
  BID_POOL_WORK_TOKEN_RUNTIME,
} = require("../src/constants/marketplaceBidDistributionPools");
const fs = require("fs");
const path = require("path");

async function q(sql, label) {
  const { rows } = await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log(label, JSON.stringify(rows.length === 1 ? rows[0] : rows));
  return rows;
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  // eslint-disable-next-line no-console
  console.log("TARGET", info.maskedTarget, "isProduction=", info.isProduction);

  await q(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version='152_admin_bid_distribution_pools'`,
    "SCHEMA_MIG_152_COUNT",
  );
  await q(
    `SELECT
       to_regclass('public.marketplace_bid_distribution_pools') AS pools,
       to_regclass('public.marketplace_bid_distribution_batches') AS batches,
       to_regclass('public.marketplace_bid_distribution_allocations') AS allocs,
       to_regclass('public.marketplace_bid_distribution_pool_events') AS events`,
    "D1_TABLES",
  );
  await q(
    `SELECT
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_batches) AS batches,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_allocations) AS allocs,
       (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pool_events) AS events`,
    "D1_COUNTS",
  );
  await q(
    `SELECT column_name, data_type, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='marketplace_bid_distribution_pools'
      ORDER BY ordinal_position`,
    "POOL_COLUMNS",
  );
  await q(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid='public.marketplace_bid_distribution_pools'::regclass
      ORDER BY conname`,
    "POOL_CONSTRAINTS",
  );
  await q(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid='public.marketplace_bid_distribution_batches'::regclass
      ORDER BY conname`,
    "BATCH_CONSTRAINTS",
  );
  await q(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid='public.marketplace_bid_distribution_allocations'::regclass
      ORDER BY conname`,
    "ALLOC_CONSTRAINTS",
  );
  await q(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid='public.marketplace_bid_distribution_pool_events'::regclass
      ORDER BY conname`,
    "EVENTS_CONSTRAINTS",
  );
  await q(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conname='marketplace_bid_credit_grants_source_type_check'`,
    "SOURCE_CHECK",
  );
  await q(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conname='marketplace_bid_credit_ledger_entries_event_type_check'`,
    "LEDGER_CHECK",
  );
  await q(
    `SELECT
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_packages) AS packages,
       (SELECT COUNT(*)::int FROM marketplace_bid_credit_purchases) AS purchases,
       (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
       (SELECT COUNT(*)::int FROM marketplace_membership_cycles) AS cycles,
       (SELECT COUNT(*)::int FROM order_freelancer_bid_credit_economics) AS normal_econ,
       (SELECT COUNT(*)::int FROM marketplace_article_application_bid_credit_economics) AS article_econ`,
    "ECONOMY_COUNTS",
  );
  await q(
    `SELECT bid_credits_enabled, COALESCE(bid_credit_purchases_enabled,false) AS bid_credit_purchases_enabled
       FROM marketplace_economy_settings WHERE id=1`,
    "FLAGS",
  );

  const svc = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "marketplaceBidDistributionPoolService.js"),
    "utf8",
  );
  // eslint-disable-next-line no-console
  console.log(
    "STATIC",
    JSON.stringify({
      BID_POOL_TOTAL_SOURCE,
      ADMIN_BID_POOL_GRANT_SOURCE,
      POOL_EXPIRED_UNUSED_BIDS_RETURN,
      POOL_CONSUMED_BIDS_RETURN,
      BID_POOL_WORK_TOKEN_RUNTIME,
      hasAtomicLock: /FOR UPDATE/.test(svc) && /available_bids >= \$2/.test(svc),
      hasReturnIdempotency: /pool_return_unused:allocation:/.test(svc),
      hasNotifyAfterCommit: /Commit economic returns BEFORE Admin notifications/.test(svc),
      hasFefoExisting: /createBidCreditGrant/.test(svc),
      noWorkToken: !/work_token/i.test(svc),
    }),
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
