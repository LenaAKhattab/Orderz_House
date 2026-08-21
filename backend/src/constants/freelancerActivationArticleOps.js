/**
 * Phase A9.1 — Mini Article operating fund, plan-tier allocations, inventory.
 */

const FREELANCER_ACTIVATION_ARTICLE_FUND_ENTRY_TYPES = Object.freeze([
  "fund_deposit",
  "fund_withdrawal",
  "daily_allocation",
  "daily_allocation_released",
  "manual_adjustment",
]);

const FREELANCER_ACTIVATION_PLAN_TIER_CODES = Object.freeze([
  "starter",
  "trial",
  "silver",
  "pro",
  "elite",
]);

const FREELANCER_ACTIVATION_INVENTORY_STATUSES = Object.freeze([
  "draft",
  "ready",
  "released",
  "exhausted",
  "archived",
]);

const FREELANCER_ACTIVATION_RELEASE_MODES = Object.freeze(["manual", "daily_auto"]);

/** Internal single article-ops setup name (not shown as "campaign" in Super Admin UI). */
const DEFAULT_ARTICLE_OPERATIONS_SETUP_NAME = "إعداد المقالات الرئيسي";

const FREELANCER_ACTIVATION_INVENTORY_RELEASE_STRATEGIES = Object.freeze([
  "one_time",
  "reusable",
]);

/** Default 50% / 30% / 20% splits (editable by Super Admin). */
const FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS = Object.freeze({
  starter: Object.freeze({
    totalArticleValueJod: "1.000",
    freelancerShareJod: "0.500",
    companyShareJod: "0.300",
    reviewerShareJod: "0.200",
    articleLevel: 1,
  }),
  trial: Object.freeze({
    totalArticleValueJod: "1.000",
    freelancerShareJod: "0.500",
    companyShareJod: "0.300",
    reviewerShareJod: "0.200",
    articleLevel: 1,
  }),
  silver: Object.freeze({
    totalArticleValueJod: "2.000",
    freelancerShareJod: "1.000",
    companyShareJod: "0.600",
    reviewerShareJod: "0.400",
    articleLevel: 2,
  }),
  pro: Object.freeze({
    totalArticleValueJod: "3.000",
    freelancerShareJod: "1.500",
    companyShareJod: "0.900",
    reviewerShareJod: "0.600",
    articleLevel: 3,
  }),
  elite: Object.freeze({
    totalArticleValueJod: "4.000",
    freelancerShareJod: "2.000",
    companyShareJod: "1.200",
    reviewerShareJod: "0.800",
    articleLevel: 5,
  }),
});

const FREELANCER_ACTIVATION_A91_ERROR_CODES = Object.freeze({
  INVALID_FUND_AMOUNT: "ACTIVATION_ARTICLE_FUND_INVALID_AMOUNT",
  INSUFFICIENT_FUND: "ACTIVATION_ARTICLE_FUND_INSUFFICIENT",
  INVALID_SHARE_SPLIT: "ACTIVATION_PLAN_ALLOCATION_INVALID_SHARE_SPLIT",
  INVALID_PLAN_TIER: "ACTIVATION_PLAN_ALLOCATION_INVALID_TIER",
  ALLOCATION_NOT_FOUND: "ACTIVATION_PLAN_ALLOCATION_NOT_FOUND",
  INVENTORY_NOT_FOUND: "ACTIVATION_ARTICLE_INVENTORY_NOT_FOUND",
  INVENTORY_NOT_READY: "ACTIVATION_ARTICLE_INVENTORY_NOT_READY",
  INVENTORY_EXHAUSTED: "ACTIVATION_ARTICLE_INVENTORY_EXHAUSTED",
  RELEASE_BLOCKED: "ACTIVATION_ARTICLE_RELEASE_BLOCKED",
  SCHEMA_MISSING: "FREELANCER_ACTIVATION_SCHEMA_MISSING",
});

const FREELANCER_ACTIVATION_RELEASE_RUN_TYPES = Object.freeze([
  "manual",
  "daily_auto",
  "dry_run",
]);

const FREELANCER_ACTIVATION_RELEASE_RUN_STATUSES = Object.freeze([
  "preview",
  "completed",
  "failed",
  "skipped",
]);

const FREELANCER_ACTIVATION_RELEASE_ITEM_STATUSES = Object.freeze([
  "preview",
  "released",
  "skipped",
  "failed",
]);

const FREELANCER_ACTIVATION_A92_ERROR_CODES = Object.freeze({
  SCHEMA_MISSING: "FREELANCER_ACTIVATION_RELEASE_SCHEMA_MISSING",
  INVALID_DATE: "ACTIVATION_ARTICLE_RELEASE_INVALID_DATE",
  IDEMPOTENT_RUN_EXISTS: "ACTIVATION_ARTICLE_RELEASE_ALREADY_COMPLETED",
  NO_ALLOCATIONS: "ACTIVATION_ARTICLE_RELEASE_NO_ALLOCATIONS",
  RELEASE_BLOCKED: "ACTIVATION_ARTICLE_RELEASE_BLOCKED",
  INSUFFICIENT_FUND: "ACTIVATION_ARTICLE_FUND_INSUFFICIENT",
  INVENTORY_EMPTY: "ACTIVATION_ARTICLE_RELEASE_INVENTORY_EMPTY",
});

function normalizePlanTierCode(raw) {
  const code = String(raw || "").trim().toLowerCase();
  if (code === "free") return "starter";
  return code;
}

function resolveArticleLevelForTier(tierCode) {
  const key = normalizePlanTierCode(tierCode);
  return FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[key]?.articleLevel || 1;
}

module.exports = {
  FREELANCER_ACTIVATION_ARTICLE_FUND_ENTRY_TYPES,
  FREELANCER_ACTIVATION_PLAN_TIER_CODES,
  FREELANCER_ACTIVATION_INVENTORY_STATUSES,
  FREELANCER_ACTIVATION_RELEASE_MODES,
  FREELANCER_ACTIVATION_INVENTORY_RELEASE_STRATEGIES,
  FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS,
  FREELANCER_ACTIVATION_A91_ERROR_CODES,
  FREELANCER_ACTIVATION_RELEASE_RUN_TYPES,
  FREELANCER_ACTIVATION_RELEASE_RUN_STATUSES,
  FREELANCER_ACTIVATION_RELEASE_ITEM_STATUSES,
  FREELANCER_ACTIVATION_A92_ERROR_CODES,
  normalizePlanTierCode,
  resolveArticleLevelForTier,
  DEFAULT_ARTICLE_OPERATIONS_SETUP_NAME,
};
