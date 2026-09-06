/**
 * Phase E2 — Article economy configuration (DB-backed).
 */

const { pool } = require("../config/db");
const {
  ARTICLE_VALUE_STARTER_JOD,
  ARTICLE_VALUE_SILVER_JOD,
  ARTICLE_VALUE_PRO_JOD,
  ARTICLE_VALUE_ELITE_JOD,
  ARTICLE_COMPANY_SHARE_PERCENT,
  ARTICLE_REVIEWER_FEE_JOD,
  ARTICLE_DEFAULT_BID_COST,
} = require("../constants/marketplaceArticleEconomy");
const { millisToJodString, resolveArticleGrossMillisForTier } = require("../utils/marketplaceArticleMoney");
const { calculateArticleFinancialSplit } = require("../utils/marketplaceArticleMoney");

async function getArticleEconomyConfig(client = null) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT article_company_share_percent,
              article_reviewer_fee_jod,
              article_default_bid_cost,
              article_value_starter_jod,
              article_value_silver_jod,
              article_value_pro_jod,
              article_value_elite_jod
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    const r = rows[0];
    if (!r) {
      return defaultEconomyConfig();
    }
    return {
      companySharePercent: Number(r.article_company_share_percent),
      reviewerFeeJod: String(r.article_reviewer_fee_jod),
      defaultBidCost: Number(r.article_default_bid_cost),
      articleValueStarterJod: String(r.article_value_starter_jod),
      articleValueSilverJod: String(r.article_value_silver_jod),
      articleValueProJod: String(r.article_value_pro_jod),
      articleValueEliteJod: String(r.article_value_elite_jod),
    };
  } catch (err) {
    if (err && err.code === "42703") {
      return defaultEconomyConfig();
    }
    throw err;
  }
}

function defaultEconomyConfig() {
  return {
    companySharePercent: ARTICLE_COMPANY_SHARE_PERCENT,
    reviewerFeeJod: ARTICLE_REVIEWER_FEE_JOD,
    defaultBidCost: ARTICLE_DEFAULT_BID_COST,
    articleValueStarterJod: ARTICLE_VALUE_STARTER_JOD,
    articleValueSilverJod: ARTICLE_VALUE_SILVER_JOD,
    articleValueProJod: ARTICLE_VALUE_PRO_JOD,
    articleValueEliteJod: ARTICLE_VALUE_ELITE_JOD,
  };
}

function resolveBidCostForCampaign(article, economy) {
  if (article?.bid_cost != null && Number.isInteger(Number(article.bid_cost))) {
    return Number(article.bid_cost);
  }
  if (article?.bidCost != null && Number.isInteger(Number(article.bidCost))) {
    return Number(article.bidCost);
  }
  return Number(economy.defaultBidCost) || ARTICLE_DEFAULT_BID_COST;
}

function buildEconomicSnapshot({
  tierCode,
  membershipId,
  planId,
  economy,
  bidCost,
  now = new Date(),
}) {
  const grossMillis = resolveArticleGrossMillisForTier(tierCode, economy);
  const grossJod = millisToJodString(grossMillis);
  const split = calculateArticleFinancialSplit({
    grossJod,
    companySharePercent: economy.companySharePercent,
    reviewerFeeJod: economy.reviewerFeeJod,
  });
  const tier = String(tierCode).toLowerCase();
  return {
    snapshotPoint: "ASSIGNMENT_SELECTION",
    snapshotAt: new Date(now).toISOString(),
    membershipTierCode: tier,
    membershipId: membershipId != null ? Number(membershipId) : null,
    marketplacePlanId: planId != null ? Number(planId) : null,
    bidCost: Number(bidCost),
    grossJod: split.grossJod,
    companySharePercent: split.companySharePercent,
    companyShareJod: split.companyShareJod,
    reviewerFeeJod: split.reviewerFeeJod,
    writerNetJod: split.writerNetJod,
    writerEarningsMode: tier === "starter" ? "pending" : "available",
  };
}

module.exports = {
  getArticleEconomyConfig,
  defaultEconomyConfig,
  resolveBidCostForCampaign,
  buildEconomicSnapshot,
  calculateArticleFinancialSplit,
};
