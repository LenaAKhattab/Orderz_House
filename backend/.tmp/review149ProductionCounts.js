/**
 * READ-ONLY Production counts for Migration 149 final review.
 * Does NOT apply migrations or mutate Production.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { pool } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function one(sql) {
  const { rows } = await pool.query(sql);
  return rows[0];
}

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  console.log("classification", info.classification || info);
  const out = {};
  out.articles = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`)).c;
  out.appsTable = (
    await one(`SELECT to_regclass('public.marketplace_article_applications') IS NOT NULL AS ok`)
  ).ok;
  out.flagCol = (
    await one(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name='marketplace_economy_settings'
           AND column_name='article_applications_enabled'
      ) AS ok`)
  ).ok;
  out.memberships = (
    await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)
  ).c;
  out.cycles = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c;
  try {
    out.bidGrants = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c;
  } catch {
    out.bidGrants = "N/A";
  }
  try {
    out.bidLedger = (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger`)).c;
  } catch {
    out.bidLedger = "N/A";
  }
  try {
    out.normalBidEcon = (
      await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)
    ).c;
  } catch {
    out.normalBidEcon = "N/A";
  }
  try {
    out.priorityBoosts = (
      await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`)
    ).c;
  } catch {
    out.priorityBoosts = "N/A";
  }
  out.mig149 = (
    await one(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='149_marketplace_article_applications') AS ok`,
    )
  ).ok;
  out.mig148 = (
    await one(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='148_priority_application_boost') AS ok`,
    )
  ).ok;
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
