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

 * Default `/plans` uses the new 5-card layout; special direct-offer pages use legacy 3-card.

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



export function getPlansLayoutConfig(layoutVariant) {

  const isLegacy = layoutVariant === PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;

  return {

    layoutVariant,

    skeletonCount: isLegacy ? 3 : 5,

    gridClassName: isLegacy ? "pricing__grid--legacy-three" : "pricing__grid--public-five",

    showActivationFeeNote: !isLegacy,

    pageModifierClass: isLegacy ? "plans-page--legacy-offer" : "plans-page--main-five",

    useMainPlansHero: isLegacy,

  };

}


