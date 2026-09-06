export const PLANS_LAYOUT_VARIANT = {
  MAIN_FIVE_CARD: "mainFiveCard",
  LEGACY_THREE_CARD: "legacyThreeCard",
};

/** Canonical stored slug for the legacy 3-plan direct page (DB is lowercase). */
export const LEGACY_DIRECT_PLANS_SLUG = "flf";

/** Preferred public URL segment (uppercase); backend lookup is case-insensitive. */
export const LEGACY_DIRECT_PLANS_URL_SEGMENT = "FLF";

export function normalizePlansPageSlug(slug) {
  return String(slug || "").trim().toLowerCase();
}

export function isLegacyOfferSlug(slug) {
  return normalizePlansPageSlug(slug) === LEGACY_DIRECT_PLANS_SLUG;
}

/**
 * Resolve public plans page layout from route slug and plan-page metadata.
 * Default `/plans` uses a count-driven catalog grid (API plans.length).
 * Special direct-offer pages use the legacy 3-card layout.
 */
export function resolvePlansLayoutVariant({ slug, page }) {
  if (page?.pageType === "special") {
    return PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;
  }
  if (isLegacyOfferSlug(slug)) {
    return PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;
  }
  return PLANS_LAYOUT_VARIANT.MAIN_FIVE_CARD;
}

/**
 * Desktop grid class from visible API plan count (not plan ids/names).
 * 1–4 → that many columns; 5+ → max 3 columns per row.
 * @param {number} planCount
 * @returns {string}
 */
export function resolvePublicPlansGridClassName(planCount) {
  const n = Number(planCount);
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const base = "pricing__grid--public-dynamic";
  if (count <= 0) {
    // Loading / empty: Marketplace Membership is four active plans.
    return `${base} pricing__grid--plans-4`;
  }
  if (count <= 4) {
    return `${base} pricing__grid--plans-${count}`;
  }
  return `${base} pricing__grid--plans-three-columns`;
}

export function getPlansLayoutConfig(layoutVariant) {
  const isLegacy = layoutVariant === PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;
  return {
    layoutVariant,
    // Main public /plans is Marketplace Membership: STARTER|SILVER|PRO|ELITE.
    skeletonCount: isLegacy ? 3 : 4,
    /** Legacy keeps a fixed class; main public grid is count-driven at render time. */
    gridClassName: isLegacy
      ? "pricing__grid--legacy-three"
      : "pricing__grid--public-dynamic pricing__grid--plans-4",
    showActivationFeeNote: false,
    pageModifierClass: isLegacy ? "plans-page--legacy-offer" : "plans-page--main-membership",
    useMainPlansHero: isLegacy,
  };
}
