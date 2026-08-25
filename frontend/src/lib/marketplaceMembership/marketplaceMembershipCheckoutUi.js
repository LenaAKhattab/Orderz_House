/** Marketplace-M5 — pure helpers for paid vs STARTER checkout UI. */

const PAID_TIER_CODES = Object.freeze(["SILVER", "PRO", "ELITE"]);

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
  return PAID_TIER_CODES.includes(normalizeMarketplaceTierCode(tierCode));
}

export function isStarterMarketplaceMembershipTierCode(tierCode) {
  return normalizeMarketplaceTierCode(tierCode) === "STARTER";
}
