/** Marketplace-M5 — pure helpers for paid vs STARTER checkout UI. */

const PAID_TIER_CODES = Object.freeze(["SILVER", "PRO", "ELITE", "SPECIAL_OFFER"]);

function isSpecialOfferTierCodeNormalized(code) {
  const c = String(code || "").trim().toUpperCase();
  return c === "SPECIAL_OFFER" || /^SPECIAL_OFFER_V\d+$/.test(c);
}

export function normalizeMarketplaceTierCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function resolveMarketplaceCheckoutPlanCode(plan) {
  if (!plan || typeof plan !== "object") return "";
  const fromTier = normalizeMarketplaceTierCode(plan.tierCode || plan.tier_code || plan.planCode);
  if (fromTier) return fromTier;
  const fromTitle = normalizeMarketplaceTierCode(plan.title || plan.name || plan.nameEn);
  if (PAID_TIER_CODES.includes(fromTitle) || fromTitle === "STARTER") return fromTitle;
  return "";
}

export function isPaidMarketplaceMembershipTierCode(tierCode) {
  const normalized = normalizeMarketplaceTierCode(tierCode);
  if (PAID_TIER_CODES.includes(normalized)) return true;
  return isSpecialOfferTierCodeNormalized(normalized);
}

export function isStarterMarketplaceMembershipTierCode(tierCode) {
  return normalizeMarketplaceTierCode(tierCode) === "STARTER";
}
