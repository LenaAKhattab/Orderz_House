/**
 * Phase E2 — milli-JOD-safe Article financial split.
 * No floating-point financial authority.
 */

const { createAppError } = require("./AppError");
const { parseJodToMillis, millisToJodString, JOD_MILLIS_PER_UNIT } = require("./marketplaceBidPoolMoney");
const { ARTICLE_E2_ERROR_CODES } = require("../constants/marketplaceArticleEconomy");

function resolveArticleGrossMillisForTier(tierCode, economy) {
  const tier = String(tierCode || "").toLowerCase();
  const map = {
    starter: economy.articleValueStarterJod,
    silver: economy.articleValueSilverJod,
    pro: economy.articleValueProJod,
    elite: economy.articleValueEliteJod,
  };
  const raw = map[tier];
  if (raw == null) {
    throw createAppError(`No Article value configured for tier ${tier}.`, 400, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_ECONOMY_INVALID_SPLIT,
    });
  }
  return parseJodToMillis(raw, { label: `articleValue.${tier}` });
}

/**
 * company = floor(gross * percent / 100) in millis (exact integer percent of milli-JOD)
 * For 30% of whole-JOD grosses that are multiples of 1.000, results match 0.300/0.600/...
 */
function calculateArticleFinancialSplit({
  grossJod,
  companySharePercent,
  reviewerFeeJod,
} = {}) {
  const grossMillis = parseJodToMillis(grossJod, { label: "grossJod", minExclusive: true });
  const reviewerMillis = parseJodToMillis(reviewerFeeJod, { label: "reviewerFeeJod" });
  const pct = Number(companySharePercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw createAppError("Company share percent must be between 0 and 100.", 400, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_ECONOMY_INVALID_SPLIT,
    });
  }
  // Exact: (grossMillis * percent) / 100 — percent may be .xx
  const pctMillis = Math.round(Number(pct) * 100); // 30 → 3000 (percent * 100)
  if (!Number.isSafeInteger(pctMillis)) {
    throw createAppError("Invalid company share percent precision.", 400, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_ECONOMY_INVALID_SPLIT,
    });
  }
  // company = floor(gross * pct / 100) using integer: (grossMillis * pctMillis) / 10000
  const companyMillis = Math.floor((grossMillis * pctMillis) / 10000);
  if (companyMillis + reviewerMillis > grossMillis) {
    throw createAppError(
      "Company share + reviewer fee cannot exceed Article gross value.",
      400,
      {
        exposeToClient: true,
        publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_ECONOMY_INVALID_SPLIT,
      },
    );
  }
  const writerMillis = grossMillis - companyMillis - reviewerMillis;
  if (writerMillis < 0) {
    throw createAppError("Writer net cannot be negative.", 400, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_ECONOMY_INVALID_SPLIT,
    });
  }
  return {
    grossJod: millisToJodString(grossMillis),
    companySharePercent: pct,
    companyShareJod: millisToJodString(companyMillis),
    reviewerFeeJod: millisToJodString(reviewerMillis),
    writerNetJod: millisToJodString(writerMillis),
    grossMillis,
    companyMillis,
    reviewerMillis,
    writerMillis,
  };
}

function assertCampaignBudgetCanFundGross({ budgetTotalJod, budgetSpentJod, grossJod }) {
  const total = parseJodToMillis(budgetTotalJod, { label: "budgetTotalJod" });
  const spent = parseJodToMillis(budgetSpentJod, { label: "budgetSpentJod" });
  const gross = parseJodToMillis(grossJod, { label: "grossJod", minExclusive: true });
  const remaining = total - spent;
  if (gross > remaining) {
    throw createAppError("Campaign remaining budget cannot fund this Article.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_CAMPAIGN_BUDGET_EXHAUSTED,
      meta: {
        remainingJod: millisToJodString(Math.max(0, remaining)),
        requiredJod: millisToJodString(gross),
      },
    });
  }
  return {
    remainingMillis: remaining,
    remainingJod: millisToJodString(Math.max(0, remaining)),
    afterSpendJod: millisToJodString(spent + gross),
  };
}

/**
 * Auto-stop helper: can campaign fund at least one more Article for any eligible tier?
 * Uses min configured gross among eligible tiers.
 */
function canFundAnotherEligibleArticle({
  budgetTotalJod,
  budgetSpentJod,
  eligibleTier,
  economy,
}) {
  const remaining =
    parseJodToMillis(budgetTotalJod, { label: "budgetTotalJod" }) -
    parseJodToMillis(budgetSpentJod, { label: "budgetSpentJod" });
  const tiers = Array.isArray(eligibleTier) && eligibleTier.length
    ? eligibleTier
    : ["starter", "silver", "pro", "elite"];
  let minGross = null;
  for (const tier of tiers) {
    try {
      const g = resolveArticleGrossMillisForTier(tier, economy);
      if (minGross == null || g < minGross) minGross = g;
    } catch {
      /* skip unknown */
    }
  }
  if (minGross == null) return false;
  return remaining >= minGross;
}

module.exports = {
  JOD_MILLIS_PER_UNIT,
  parseJodToMillis,
  millisToJodString,
  resolveArticleGrossMillisForTier,
  calculateArticleFinancialSplit,
  assertCampaignBudgetCanFundGross,
  canFundAnotherEligibleArticle,
};
