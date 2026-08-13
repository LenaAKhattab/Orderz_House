/** Stable marketplace membership tier codes — never key logic off display names. */

const MARKETPLACE_MEMBERSHIP_TIER_CODES = Object.freeze([
  "free",
  "start",
  "active",
  "pro",
  "elite",
  // Historical / retired Marketplace catalog code — retained for referential safety.
  "pay_as_you_work",
]);

const MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES = Object.freeze([
  "free",
  "start",
  "active",
  "pro",
  "elite",
]);

const MARKETPLACE_MEMBERSHIP_TIER_CODE_SET = new Set(MARKETPLACE_MEMBERSHIP_TIER_CODES);

/** Approved Phase A1 article access levels by stable tier_code. */
const ARTICLE_ACCESS_LEVEL_BY_TIER = Object.freeze({
  free: 1,
  start: 2,
  active: 3,
  pro: 4,
  elite: 5,
  pay_as_you_work: 1,
});

const TIER_CODE_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

function isValidMarketplaceTierCode(value) {
  const code = String(value || "").trim();
  return TIER_CODE_PATTERN.test(code);
}

function defaultArticleAccessLevelForTier(tierCode) {
  const code = String(tierCode || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ARTICLE_ACCESS_LEVEL_BY_TIER, code)
    ? ARTICLE_ACCESS_LEVEL_BY_TIER[code]
    : 1;
}

module.exports = {
  MARKETPLACE_MEMBERSHIP_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_TIER_CODE_SET,
  ARTICLE_ACCESS_LEVEL_BY_TIER,
  TIER_CODE_PATTERN,
  isValidMarketplaceTierCode,
  defaultArticleAccessLevelForTier,
};
