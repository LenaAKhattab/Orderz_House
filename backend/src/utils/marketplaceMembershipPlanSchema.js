/**
 * Schema capability probes for Marketplace Membership plans (Phase A1).
 * Keeps read paths safe before migration 144 is applied.
 */

const { pool } = require("../config/db");

let articleAccessLevelReady = null;

async function marketplacePlanHasArticleAccessLevel(db = pool) {
  if (articleAccessLevelReady === true) return true;
  if (articleAccessLevelReady === false) return false;
  const client = db;
  const { rows } = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_membership_plans'
        AND column_name = 'article_access_level'
      LIMIT 1`,
  );
  articleAccessLevelReady = Boolean(rows[0]);
  return articleAccessLevelReady;
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

let annualPlanColumnsReady = null;

/** Migration 206 columns (catalog_category, entitlement_duration_months, bid_allowance_scope). */
async function marketplacePlanHasAnnualPlanColumns(db = pool) {
  if (annualPlanColumnsReady === true) return true;
  const { rows } = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_membership_plans'
        AND column_name = 'bid_allowance_scope'
      LIMIT 1`,
  );
  annualPlanColumnsReady = Boolean(rows[0]);
  return annualPlanColumnsReady;
}

/** Test / gate helper — reset after applying migration 144 mid-process. */
function clearMarketplaceMembershipPlanSchemaCache() {
  articleAccessLevelReady = null;
  annualPlanColumnsReady = null;
}

/**
 * Extra plan columns for membership JOIN selects.
 * Always aliases the same names so mapPlanFields stays stable.
 */
async function marketplacePlanJoinSelectExtras(db = pool) {
  const hasArticle = await marketplacePlanHasArticleAccessLevel(db);
  const hasBidAllowance = await marketplacePlanHasMonthlyBidAllowance(db);
  const hasAnnual = await marketplacePlanHasAnnualPlanColumns(db);
  return {
    hasArticleAccessLevel: hasArticle,
    hasMonthlyBidAllowance: hasBidAllowance,
    hasAnnualPlanColumns: hasAnnual,
    sql: [
      ...(hasAnnual
        ? [
            `p.catalog_category AS plan_catalog_category`,
            `p.entitlement_duration_months AS plan_entitlement_duration_months`,
            `p.bid_allowance_scope AS plan_bid_allowance_scope`,
          ]
        : [
            `'marketplace'::text AS plan_catalog_category`,
            `NULL::integer AS plan_entitlement_duration_months`,
            `'cycle'::text AS plan_bid_allowance_scope`,
          ]),
      hasArticle
        ? `p.article_access_level AS plan_article_access_level`
        : `NULL::integer AS plan_article_access_level`,
      `p.elite_direct_orders_enabled AS plan_elite_direct_orders_enabled`,
      `p.monthly_price_jod AS plan_monthly_price_jod`,
      hasBidAllowance
        ? `p.monthly_bid_allowance AS plan_monthly_bid_allowance`
        : `0::integer AS plan_monthly_bid_allowance`,
    ].join(",\n              "),
  };
}

module.exports = {
  marketplacePlanHasArticleAccessLevel,
  marketplacePlanHasMonthlyBidAllowance,
  marketplacePlanHasAnnualPlanColumns,
  clearMarketplaceMembershipPlanSchemaCache,
  marketplacePlanJoinSelectExtras,
};
