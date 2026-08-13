/**
 * READ-ONLY post-apply verification for Migration 149.
 * No mutations. No engine enable. No Article/application creation.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const {
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
  ARTICLE_APPLICATION_NO_SELECTION_REFUND,
  ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
  ARTICLE_APPLICATION_REJECTION_REFUND,
  ARTICLE_APPLICATION_LOSER_REFUND,
  ARTICLE_VALUE_TO_BID_COST_MAPPING,
  ARTICLE_LEVEL_TO_BID_COST_MAPPING,
  ARTICLE_SELECTION_AUTHORITY,
  ARTICLE_AUTOMATIC_WINNER,
  ARTICLE_WORK_TOKEN_ENTRY,
  ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
  ARTICLE_APPLICATION_HISTORICAL_BACKFILL,
  ARTICLE_MEMBERSHIP_LEVEL_GATE,
  ARTICLE_PRIORITY_BOOST,
  ARTICLE_FAIR_DISTRIBUTION,
  ARTICLE_APPLICATION_BID_ECONOMICS_SCHEMA,
} = require("../src/constants/marketplaceArticleApplications");

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function main() {
  const info = classifyDatabaseUrl();
  const out = {
    classification: info.classification,
    isProduction: info.isProduction,
  };

  out.mig149Count = (
    await q(
      `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version = '149_marketplace_article_applications'`,
    )
  )[0].c;

  out.flags = (
    await q(`
      SELECT
        bid_credits_enabled,
        priority_application_boost_enabled,
        priority_bidding_enabled,
        work_tokens_enabled,
        fair_work_distribution_enabled,
        elite_engine_enabled,
        marketplace_commission_enabled,
        cash_membership_payments_enabled,
        verification_bonuses_enabled,
        article_applications_enabled
      FROM marketplace_economy_settings WHERE id = 1`)
  )[0];

  out.flagCol = (
    await q(`
      SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='marketplace_economy_settings'
         AND column_name='article_applications_enabled'`)
  )[0];

  out.appsTable = (
    await q(`SELECT to_regclass('public.marketplace_article_applications') IS NOT NULL AS ok`)
  )[0].ok;

  out.columns = await q(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='marketplace_article_applications'
     ORDER BY ordinal_position`);

  out.checks = await q(`
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.marketplace_article_applications'::regclass
       AND contype = 'c'
     ORDER BY conname`);

  out.uniques = await q(`
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.marketplace_article_applications'::regclass
       AND contype = 'u'
     ORDER BY conname`);

  out.fks = await q(`
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.marketplace_article_applications'::regclass
       AND contype = 'f'
     ORDER BY conname`);

  out.indexes = await q(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname='public' AND tablename='marketplace_article_applications'
     ORDER BY indexname`);

  out.counts = {
    articles: (await q(`SELECT COUNT(*)::int AS c FROM marketplace_articles`))[0].c,
    applications: (
      await q(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`)
    )[0].c,
    memberships: (
      await q(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)
    )[0].c,
    cycles: (await q(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`))[0].c,
    bidGrants: (await q(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`))[0].c,
    bidLedger: (
      await q(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
    )[0].c,
    normalBidEcon: (
      await q(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)
    )[0].c,
    priorityBoosts: (
      await q(`SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`)
    )[0].c,
  };

  out.articleEconTable = (
    await q(
      `SELECT to_regclass('public.marketplace_article_bid_credit_economics') IS NOT NULL AS ok`,
    )
  )[0].ok;

  out.hasBidCostCol = out.columns.some((c) => c.column_name === "bid_credit_cost");

  out.freePlan = (
    await q(`
      SELECT tier_code, article_access_level, monthly_price_jod
        FROM marketplace_membership_plans
       WHERE UPPER(tier_code) = 'FREE' OR monthly_price_jod = 0
       ORDER BY id LIMIT 1`)
  )[0];

  out.constants = {
    ARTICLE_APPLICATION_BID_COST,
    ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
    ARTICLE_APPLICATION_NO_SELECTION_REFUND,
    ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
    ARTICLE_APPLICATION_REJECTION_REFUND,
    ARTICLE_APPLICATION_LOSER_REFUND,
    ARTICLE_VALUE_TO_BID_COST_MAPPING,
    ARTICLE_LEVEL_TO_BID_COST_MAPPING,
    ARTICLE_SELECTION_AUTHORITY,
    ARTICLE_AUTOMATIC_WINNER,
    ARTICLE_WORK_TOKEN_ENTRY,
    ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
    ARTICLE_APPLICATION_HISTORICAL_BACKFILL,
    ARTICLE_MEMBERSHIP_LEVEL_GATE,
    ARTICLE_PRIORITY_BOOST,
    ARTICLE_FAIR_DISTRIBUTION,
    ARTICLE_APPLICATION_BID_ECONOMICS_SCHEMA,
  };

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
});
