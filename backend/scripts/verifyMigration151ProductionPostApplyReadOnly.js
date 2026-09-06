/**
 * READ-ONLY post-apply verification for Migration 151 on Production.
 * Does not mutate / enable engines / create economic rows.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const constants = require("../src/constants/marketplaceBidCreditPurchases");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) throw new Error("Expected Production DATABASE_URL");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
  try {
    const out = {
      mig151Count: Number(
        (
          await one(
            `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version='151_bid_credit_package_purchases'`,
          )
        ).c,
      ),
      purchasesFlagCol: await one(`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='marketplace_economy_settings'
           AND column_name='bid_credit_purchases_enabled'`),
      flags: await one(`
        SELECT bid_credits_enabled, bid_credit_purchases_enabled,
               article_applications_enabled, work_tokens_enabled,
               priority_application_boost_enabled, priority_bidding_enabled,
               fair_work_distribution_enabled, elite_engine_enabled
          FROM marketplace_economy_settings WHERE id=1`),
      validityDaysCol: await one(`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='marketplace_bid_credit_packages'
           AND column_name='validity_days'`),
      validityChk: (
        await one(`
          SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='marketplace_bid_credit_packages'
             AND c.conname='marketplace_bid_credit_packages_validity_days_chk'`)
      )?.def,
      purchasesTable: (await one(`SELECT to_regclass('public.marketplace_bid_credit_purchases') AS t`)).t,
      purchaseCols: (
        await pool.query(`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name='marketplace_bid_credit_purchases'
           ORDER BY ordinal_position`)
      ).rows.map((r) => r.column_name),
      sourceChk: (
        await one(`
          SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='marketplace_bid_credit_grants'
             AND c.conname='marketplace_bid_credit_grants_source_type_check'`)
      )?.def,
      statusChk: (
        await one(`
          SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='marketplace_bid_credit_grants'
             AND c.conname='marketplace_bid_credit_grants_status_check'`)
      )?.def,
      amountsChk: (
        await one(`
          SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='marketplace_bid_credit_grants'
             AND c.conname='marketplace_bid_credit_grants_amounts_chk'`)
      )?.def,
      amountRevokedCol: await one(`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='marketplace_bid_credit_grants'
           AND column_name='amount_revoked'`),
      ledgerChk: (
        await one(`
          SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='marketplace_bid_credit_ledger_entries'
             AND c.conname='marketplace_bid_credit_ledger_entries_event_type_check'`)
      )?.def,
      packages: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_packages`)).c),
      purchases: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_purchases`)).c),
      grants: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c),
      ledger: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)).c),
      memberships: Number(
        (await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)).c,
      ),
      cycles: Number((await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c),
      policy: {
        BID_PACKAGE_FULL_REFUND: constants.BID_PACKAGE_FULL_REFUND,
        BID_PACKAGE_ALREADY_CONSUMED_REFUND: constants.BID_PACKAGE_ALREADY_CONSUMED_REFUND,
        BID_PACKAGE_CROSS_SOURCE_CLAWBACK: constants.BID_PACKAGE_CROSS_SOURCE_CLAWBACK,
        BID_PACKAGE_ACTIVE_DISPUTE: constants.BID_PACKAGE_ACTIVE_DISPUTE,
        BID_PACKAGE_DISPUTE_WON: constants.BID_PACKAGE_DISPUTE_WON,
        BID_PACKAGE_DISPUTE_LOST: constants.BID_PACKAGE_DISPUTE_LOST,
        PARTIAL_BID_PACKAGE_REFUND_POLICY: constants.PARTIAL_BID_PACKAGE_REFUND_POLICY,
        ACTIVE_DISPUTE_ACCOUNT_SUSPENSION: constants.ACTIVE_DISPUTE_ACCOUNT_SUSPENSION,
        DISPUTE_FREEZE_EXTENDS_BID_EXPIRY: constants.DISPUTE_FREEZE_EXTENDS_BID_EXPIRY,
        BID_PACKAGE_PAYMENT_AMOUNT_SOURCE: constants.BID_PACKAGE_PAYMENT_AMOUNT_SOURCE,
        CLIENT_CONTROLLED_BID_PURCHASE_ECONOMICS: constants.CLIENT_CONTROLLED_BID_PURCHASE_ECONOMICS,
        PURCHASED_BIDS_MEMBERSHIP_INDEPENDENT: constants.PURCHASED_BIDS_MEMBERSHIP_INDEPENDENT,
        PURCHASED_BIDS_FEFO: constants.PURCHASED_BIDS_FEFO,
        BID_PACKAGE_WORK_TOKEN_RUNTIME: constants.BID_PACKAGE_WORK_TOKEN_RUNTIME,
        BID_PACKAGE_PURCHASE_HISTORICAL_BACKFILL: constants.BID_PACKAGE_PURCHASE_HISTORICAL_BACKFILL,
        BID_PACKAGE_PURCHASE_REVERSAL_HISTORICAL_BACKFILL:
          constants.BID_PACKAGE_PURCHASE_REVERSAL_HISTORICAL_BACKFILL,
        BID_CREDIT_PURCHASES_ENGINE: constants.BID_CREDIT_PURCHASES_ENGINE,
      },
    };
    try {
      out.normalEcon = Number(
        (await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)).c,
      );
    } catch {
      out.normalEcon = "missing";
    }
    try {
      out.articleEcon = Number(
        (
          await one(
            `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
          )
        ).c,
      );
    } catch {
      out.articleEcon = "missing";
    }
    try {
      out.priorityBoosts = Number(
        (await one(`SELECT COUNT(*)::int AS c FROM marketplace_priority_application_boost_uses`)).c,
      );
    } catch {
      try {
        out.priorityBoosts = Number(
          (await one(`SELECT COUNT(*)::int AS c FROM marketplace_priority_application_boosts`)).c,
        );
      } catch {
        out.priorityBoosts = "missing";
      }
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
