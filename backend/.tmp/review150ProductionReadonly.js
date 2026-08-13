/**
 * READ-ONLY Production verification for Migration 150 final review.
 * Does NOT apply migrations or mutate Production.
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
    console.error("Expected Production URL for this review script");
    process.exitCode = 1;
    return;
  }

  const out = {
    classification: info.classification || "PRODUCTION",
    maskedTarget: info.maskedTarget,
  };

  out.mig149 = (
    await one(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='149_marketplace_article_applications') AS ok`,
    )
  ).ok;
  out.mig150 = (
    await one(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='150_article_application_bid_credit_economics') AS ok`,
    )
  ).ok;
  out.articleEconTable = (
    await one(
      `SELECT to_regclass('public.marketplace_article_application_bid_credit_economics') IS NOT NULL AS ok`,
    )
  ).ok;

  const ledgerCheck = await one(`
    SELECT pg_get_constraintdef(c.oid) AS def, c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'marketplace_bid_credit_ledger_entries'
       AND c.conname = 'marketplace_bid_credit_ledger_entries_event_type_check'
  `);
  out.ledgerEventCheckName = ledgerCheck?.conname || null;
  out.ledgerEventCheckDef = ledgerCheck?.def || null;

  const sourceCheck = await one(`
    SELECT pg_get_constraintdef(c.oid) AS def, c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'marketplace_bid_credit_grants'
       AND c.conname = 'marketplace_bid_credit_grants_source_type_check'
  `);
  out.grantSourceCheckName = sourceCheck?.conname || null;
  out.grantSourceCheckDef = sourceCheck?.def || null;

  const flags = await one(`
    SELECT article_applications_enabled,
           bid_credits_enabled,
           priority_application_boost_enabled,
           priority_bidding_enabled,
           work_tokens_enabled,
           fair_work_distribution_enabled,
           elite_engine_enabled
      FROM marketplace_economy_settings WHERE id = 1
  `);
  out.flags = flags;

  out.articles = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`)).c;
  out.articleApplications = (
    await one(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`)
  ).c;
  out.memberships = (
    await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)
  ).c;
  out.cycles = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c;
  out.bidGrants = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c;
  out.bidLedger = (
    await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
  ).c;
  out.bidDistributions = (
    await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_bid_distribution_months`)
  ).c;
  out.normalBidEcon = (
    await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)
  ).c;
  try {
    out.priorityBoosts = (
      await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`)
    ).c;
  } catch {
    out.priorityBoosts = "N/A";
  }

  out.distinctLedgerEvents = (
    await q(`SELECT DISTINCT event_type FROM marketplace_bid_credit_ledger_entries ORDER BY 1`)
  ).map((r) => r.event_type);
  out.distinctGrantSources = (
    await q(`SELECT DISTINCT source_type FROM marketplace_bid_credit_grants ORDER BY 1`)
  ).map((r) => r.source_type);

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
