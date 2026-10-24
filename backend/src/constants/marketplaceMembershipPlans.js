/**
 * Phase E1 — Marketplace Membership commercial catalog + Bid usage rules.
 */

const MARKETPLACE_MEMBERSHIP_TIER_CODES = Object.freeze([
  "starter",
  "silver",
  "pro",
  "elite",
  "special_offer",
  "annual_basic",
  // Legacy / historical (retained for FK + audit safety)
  "free",
  "start",
  "active",
  "pay_as_you_work",
]);

/** Regular public catalog only — special_offer(+versions) managed via باقة العرض tab. */
const MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES = Object.freeze([
  "starter",
  "silver",
  "pro",
  "elite",
]);

const MARKETPLACE_MEMBERSHIP_TIER_CODE_SET = new Set(MARKETPLACE_MEMBERSHIP_TIER_CODES);

/** Annual Plans (الباقات السنوية) — own public tab, not part of the regular catalog. */
const ANNUAL_MEMBERSHIP_TIER_CODES = Object.freeze(["annual_basic"]);

/**
 * Plans that can be the freelancer's canonical current marketplace plan
 * (resolver, plan-level restrictions, display). Special offers resolve separately.
 */
const CANONICAL_MARKETPLACE_TIER_CODES = Object.freeze([
  ...MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  ...ANNUAL_MEMBERSHIP_TIER_CODES,
]);

const MARKETPLACE_PLAN_CATALOG_CATEGORIES = Object.freeze({
  MARKETPLACE: "marketplace",
  ANNUAL: "annual",
});

/** cycle = allowance per monthly cycle; term = allowance once per entitlement (migration 206). */
const BID_ALLOWANCE_SCOPES = Object.freeze({
  CYCLE: "cycle",
  TERM: "term",
});

/** Base tier; versioned campaigns use special_offer_v2, special_offer_v3, … */
const SPECIAL_OFFER_MEMBERSHIP_TIER_CODE = "special_offer";
const SPECIAL_OFFER_TIER_CODE_PATTERN = /^special_offer(?:_v\d+)?$/;

const ARTICLE_ACCESS_LEVEL_BY_TIER = Object.freeze({
  starter: 1,
  silver: 2,
  pro: 3,
  elite: 5,
  special_offer: 2,
  free: 1,
  start: 2,
  active: 3,
  pay_as_you_work: 1,
  annual_basic: 2,
});

/**
 * Annual products that grant another tier's marketplace privileges.
 * Annual SILVER (internal code annual_basic) = SILVER for 12 months.
 * Use resolveEntitlementTierCode wherever logic branches on a tier code.
 */
const ANNUAL_PLAN_ENTITLEMENT_TIER = Object.freeze({
  annual_basic: "silver",
});

const E1_PLAN_SPECS = Object.freeze({
  starter: {
    priceJod: 0,
    durationDays: 10,
    totalBids: 20,
    dailyBidLimit: 2,
    projectMinJod: 1,
    projectMaxJod: 10,
    unlimitedProjectMax: false,
    withdrawalEnabled: false,
    starterEarningsMode: "pending",
    bidDistributionMode: "full_cycle",
    oneTimeStarter: true,
  },
  silver: {
    priceJod: 19,
    durationDays: 30,
    totalBids: 40,
    dailyBidLimit: 3,
    projectMinJod: 1,
    projectMaxJod: 20,
    unlimitedProjectMax: false,
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    oneTimeStarter: false,
  },
  pro: {
    priceJod: 39,
    durationDays: 30,
    totalBids: 100,
    dailyBidLimit: 7,
    projectMinJod: 1,
    projectMaxJod: 50,
    unlimitedProjectMax: false,
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    oneTimeStarter: false,
  },
  elite: {
    priceJod: 59,
    durationDays: 30,
    totalBids: 150,
    dailyBidLimit: 10,
    projectMinJod: 1,
    projectMaxJod: null,
    unlimitedProjectMax: true,
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    oneTimeStarter: false,
  },
  /** Fallback only — live benefits come from the special_offer plan row. */
  special_offer: {
    priceJod: 29,
    durationDays: 30,
    totalBids: 50,
    dailyBidLimit: 5,
    projectMinJod: 1,
    projectMaxJod: 25,
    unlimitedProjectMax: false,
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    oneTimeStarter: false,
  },
  /** Fallback only — live values come from the annual_basic plan row (migration 206). */
  /** Annual SILVER: SILVER privileges for 12 months; 480 applications for the whole term. */
  annual_basic: {
    priceJod: 50,
    durationMonths: 12,
    durationDays: null,
    totalBids: 480,
    dailyBidLimit: 3,
    projectMinJod: 1,
    projectMaxJod: 20,
    unlimitedProjectMax: false,
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    bidAllowanceScope: "term",
    oneTimeStarter: false,
  },
});

const MEMBERSHIP_BID_DISTRIBUTION = "FULL_CYCLE_GRANT_WITH_DAILY_SPEND_LIMIT";
const MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION = "YES";
const PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING = "YES";
/** Admin / company-approval activation path (unchanged). */
const PAID_MEMBERSHIP_PERIOD_START = "COMPANY_APPROVAL_TIME";
/** Stripe self-checkout path (Marketplace-M1+): term starts on first real order. */
const PAID_MEMBERSHIP_STRIPE_PERIOD_START = "FIRST_REAL_ORDER";
/** Exact base codes; versioned special_offer_* recognized via isSpecialOfferMembershipTier. */
const PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES = Object.freeze([
  "silver",
  "pro",
  "elite",
  "special_offer",
  "annual_basic",
]);
const STARTER_WITHDRAWAL = "BLOCKED";
const STARTER_EARNINGS_MODE = "PENDING";
const DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE = "Asia/Amman";

const ACTIVATION_REQUEST_STATUSES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

const TIER_CODE_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

function isValidMarketplaceTierCode(value) {
  const code = String(value || "").trim();
  return TIER_CODE_PATTERN.test(code);
}

function isSpecialOfferMembershipTier(tierCode) {
  const code = String(tierCode || "").trim().toLowerCase();
  return SPECIAL_OFFER_TIER_CODE_PATTERN.test(code);
}

function isAnnualMembershipTier(tierCode) {
  return ANNUAL_MEMBERSHIP_TIER_CODES.includes(String(tierCode || "").trim().toLowerCase());
}

function isCanonicalMarketplaceTier(tierCode) {
  return CANONICAL_MARKETPLACE_TIER_CODES.includes(String(tierCode || "").trim().toLowerCase());
}

/** Tier whose marketplace privileges a plan grants (annual_basic → silver; others unchanged). */
function resolveEntitlementTierCode(tierCode) {
  const code = String(tierCode || "").trim().toLowerCase();
  return ANNUAL_PLAN_ENTITLEMENT_TIER[code] || code;
}

function defaultArticleAccessLevelForTier(tierCode) {
  const code = String(tierCode || "").trim().toLowerCase();
  if (isSpecialOfferMembershipTier(code)) {
    return ARTICLE_ACCESS_LEVEL_BY_TIER.special_offer;
  }
  return Object.prototype.hasOwnProperty.call(ARTICLE_ACCESS_LEVEL_BY_TIER, code)
    ? ARTICLE_ACCESS_LEVEL_BY_TIER[code]
    : 1;
}

module.exports = {
  MARKETPLACE_MEMBERSHIP_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_TIER_CODE_SET,
  ANNUAL_MEMBERSHIP_TIER_CODES,
  CANONICAL_MARKETPLACE_TIER_CODES,
  MARKETPLACE_PLAN_CATALOG_CATEGORIES,
  BID_ALLOWANCE_SCOPES,
  SPECIAL_OFFER_MEMBERSHIP_TIER_CODE,
  SPECIAL_OFFER_TIER_CODE_PATTERN,
  ARTICLE_ACCESS_LEVEL_BY_TIER,
  E1_PLAN_SPECS,
  MEMBERSHIP_BID_DISTRIBUTION,
  MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION,
  PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING,
  PAID_MEMBERSHIP_PERIOD_START,
  PAID_MEMBERSHIP_STRIPE_PERIOD_START,
  PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES,
  STARTER_WITHDRAWAL,
  STARTER_EARNINGS_MODE,
  DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE,
  ACTIVATION_REQUEST_STATUSES,
  TIER_CODE_PATTERN,
  isValidMarketplaceTierCode,
  isSpecialOfferMembershipTier,
  isAnnualMembershipTier,
  isCanonicalMarketplaceTier,
  resolveEntitlementTierCode,
  ANNUAL_PLAN_ENTITLEMENT_TIER,
  defaultArticleAccessLevelForTier,
};
