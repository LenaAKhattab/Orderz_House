/**
 * READ-ONLY post-apply verification for Migration 150.
 * Does NOT mutate Production / enable flags / create economic rows.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function one(sql, params = []) {
  return (await q(sql, params))[0];
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (!info.isProduction) {
    console.error("Expected Production for post-apply verify");
    process.exitCode = 1;
    return;
  }

  const out = { classification: info.classification, maskedTarget: info.maskedTarget };

  out.mig150Count = (
    await one(
      `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version='150_article_application_bid_credit_economics'`,
    )
  ).c;
  out.mig149 = (
    await one(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='149_marketplace_article_applications') AS ok`,
    )
  ).ok;
  out.appliedCount = (await one(`SELECT COUNT(*)::int AS c FROM schema_migrations`)).c;

  out.econTable = (
    await one(
      `SELECT to_regclass('public.marketplace_article_application_bid_credit_economics') IS NOT NULL AS ok`,
    )
  ).ok;
  out.orderEconPreserved = (
    await one(
      `SELECT to_regclass('public.order_freelancer_bid_credit_economics') IS NOT NULL AS ok`,
    )
  ).ok;

  out.columns = (
    await q(`
      SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='marketplace_article_application_bid_credit_economics'
       ORDER BY ordinal_position`)
  ).map((r) => ({
    name: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable,
    default: r.column_default,
  }));

  out.checks = await q(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'marketplace_article_application_bid_credit_economics'
       AND c.contype = 'c'
     ORDER BY c.conname`);

  out.uniques = await q(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'marketplace_article_application_bid_credit_economics'
       AND c.contype IN ('u','p')
     ORDER BY c.conname`);

  out.fks = await q(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'marketplace_article_application_bid_credit_economics'
       AND c.contype = 'f'
     ORDER BY c.conname`);

  out.indexes = await q(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname='public' AND tablename='marketplace_article_application_bid_credit_economics'
     ORDER BY indexname`);

  out.ledgerEventCheck = (
    await one(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_ledger_entries'
         AND c.conname='marketplace_bid_credit_ledger_entries_event_type_check'`)
  )?.def;

  out.grantSourceCheck = (
    await one(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_grants'
         AND c.conname='marketplace_bid_credit_grants_source_type_check'`)
  )?.def;

  out.flags = await one(`
    SELECT article_applications_enabled, bid_credits_enabled,
           priority_application_boost_enabled, priority_bidding_enabled,
           work_tokens_enabled, fair_work_distribution_enabled, elite_engine_enabled,
           marketplace_commission_enabled, cash_membership_payments_enabled,
           verification_bonuses_enabled
      FROM marketplace_economy_settings WHERE id = 1`);

  out.counts = {
    articles: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`)).c,
    articleApplications: (
      await one(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`)
    ).c,
    articleBidEconomics: (
      await one(
        `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
      )
    ).c,
    bidPackages: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_packages`)).c,
    bidGrants: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c,
    bidLedger: (
      await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
    ).c,
    distributions: (
      await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_bid_distribution_months`)
    ).c,
    normalBidEconomics: (
      await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)
    ).c,
    memberships: (
      await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)
    ).c,
    cycles: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c,
  };
  try {
    out.counts.priorityBoosts = (
      await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`)
    ).c;
  } catch {
    out.counts.priorityBoosts = "N/A";
  }

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
