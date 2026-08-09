/** Stable marketplace membership tier codes — never key logic off display names. */

const MARKETPLACE_MEMBERSHIP_TIER_CODES = Object.freeze([
  "pay_as_you_work",
  "active",
  "pro",
  "elite",
]);

const MARKETPLACE_MEMBERSHIP_TIER_CODE_SET = new Set(MARKETPLACE_MEMBERSHIP_TIER_CODES);

const TIER_CODE_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

function isValidMarketplaceTierCode(value) {
  const code = String(value || "").trim();
  return TIER_CODE_PATTERN.test(code);
}

module.exports = {
  MARKETPLACE_MEMBERSHIP_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_TIER_CODE_SET,
  TIER_CODE_PATTERN,
  isValidMarketplaceTierCode,
};
