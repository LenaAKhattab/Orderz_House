/**
 * Special Offer Package — independent promotional marketplace plan.
 * Config lives in system_settings; each campaign version uses a dedicated
 * marketplace_membership_plans row (special_offer, special_offer_v2, …).
 * No schema migration.
 */

const SPECIAL_OFFER_PACKAGE_SETTING_KEY = "special_offer_package_v1";

const SPECIAL_OFFER_PURCHASE_MODE = Object.freeze({
  CHECKOUT: "checkout",
  WHATSAPP: "whatsapp",
});

/** Base independent paid tier — versioned as special_offer_vN after first campaign lock. */
const SPECIAL_OFFER_PLAN_TIER_CODE = "special_offer";

const SPECIAL_OFFER_LOCKED_BENEFIT_FIELDS = Object.freeze([
  "priceJod",
  "totalOffers",
  "dailyLimit",
  "durationDays",
  "maxProjectValueJod",
  "articleAccessLevel",
  "accessLevelKey",
  "purchaseMode",
]);

/** Article / project access levels shown in admin (maps to article_access_level 1–5). */
const SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS = Object.freeze({
  starter: 1,
  silver: 2,
  pro: 3,
  elite: 5,
});

const DEFAULT_SPECIAL_OFFER_PACKAGE = Object.freeze({
  isVisible: false,
  title: "باقة العرض",
  subtitle: "عرض ترويجي لفترة محدودة — عروض أكثر بسعر خاص.",
  badgeText: "عرض خاص",
  ribbonText: "لفترة محدودة",
  priceJod: 29,
  originalPriceJod: 39,
  totalOffers: 50,
  dailyLimit: 5,
  durationDays: 30,
  maxProjectValueJod: 25,
  /** article_access_level 1–5 */
  articleAccessLevel: 2,
  /** UI label for access: starter|silver|pro|elite */
  accessLevelKey: "silver",
  ctaLabel: "احصل على العرض الآن",
  microcopy: "بدون التزام، يمكنك الترقية أو الإلغاء في أي وقت",
  whatsappMessageAr:
    "مرحبًا، أرغب بالاستفادة من باقة العرض الخاصة في Orderz House ومعرفة تفاصيل التسجيل.",
  purchaseMode: SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT,
  /** @deprecated Phase-02 compatibility only — independent checkout ignores this. */
  linkedPlanCode: null,
  linkedMarketplacePlanId: null,
  /** Campaign version (1 = special_offer, 2+ = special_offer_vN). */
  offerVersion: 1,
  planTierCode: SPECIAL_OFFER_PLAN_TIER_CODE,
});

function accessLevelKeyFromArticleLevel(level) {
  const n = Number(level);
  if (n >= 5) return "elite";
  if (n >= 3) return "pro";
  if (n >= 2) return "silver";
  return "starter";
}

function articleAccessLevelFromKey(key) {
  const k = String(key || "")
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS, k)) {
    return SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS[k];
  }
  return SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS.silver;
}

/**
 * @param {number} version
 * @returns {string} special_offer | special_offer_v2 | …
 */
function specialOfferTierCodeForVersion(version) {
  const v = Math.max(1, Math.floor(Number(version) || 1));
  if (v <= 1) return SPECIAL_OFFER_PLAN_TIER_CODE;
  return `special_offer_v${v}`;
}

/**
 * @param {string} tierCode
 * @returns {number}
 */
function specialOfferVersionFromTierCode(tierCode) {
  const code = String(tierCode || "")
    .trim()
    .toLowerCase();
  if (code === SPECIAL_OFFER_PLAN_TIER_CODE) return 1;
  const m = /^special_offer_v(\d+)$/.exec(code);
  if (m) return Math.max(1, Number(m[1]) || 1);
  return 1;
}

function specialOfferSlugForVersion(version) {
  const v = Math.max(1, Math.floor(Number(version) || 1));
  return v <= 1 ? "special-offer" : `special-offer-v${v}`;
}

module.exports = {
  SPECIAL_OFFER_PACKAGE_SETTING_KEY,
  SPECIAL_OFFER_PURCHASE_MODE,
  SPECIAL_OFFER_PLAN_TIER_CODE,
  SPECIAL_OFFER_LOCKED_BENEFIT_FIELDS,
  SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS,
  DEFAULT_SPECIAL_OFFER_PACKAGE,
  accessLevelKeyFromArticleLevel,
  articleAccessLevelFromKey,
  specialOfferTierCodeForVersion,
  specialOfferVersionFromTierCode,
  specialOfferSlugForVersion,
};
