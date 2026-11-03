/**
 * Maps public Marketplace Membership catalog rows into the shape used by
 * public `/plans` PricingSection / PlanCard (display + CTA only).
 * Does NOT merge with legacy subscription / page-package plan systems.
 * Does NOT fall back to legacy GET /api/plans catalog data.
 */

import { pt } from "../../i18n/activeLocale.js";
import { isNewLocale, localizeSystemText } from "../../i18n/systemContent.js";

/**
 * Static card copy lives in the `platformCore.membership` catalog. The DTO keeps its Arabic / English columns
 * (filled from the ar / en catalogs, so they are unchanged) plus the catalog key, so German / Dutch / Romanian
 * can render the same copy from their own catalog (see `localizeMembershipCardText`).
 */
const tierTaglineKey = (tier) => `platformCore.membership.tiers.${tier}.tagline`;
const MEMBERSHIP_VIEW_KEY = "platformCore.membership.viewMembership";
const WITHDRAWAL_ON_KEY = "platformCore.membership.withdrawalOn";
const WITHDRAWAL_OFF_KEY = "platformCore.membership.withdrawalOff";

/** Public catalog progression (ignore DB id / accidental price sorts). */
export const PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER = Object.freeze([
  "starter",
  "silver",
  "pro",
  "elite",
]);

/** Display-only labels (not commercial values). Values still come from DTO fields. */
function tierDisplay(tier, code) {
  const taglineKey = tierTaglineKey(tier);
  return Object.freeze({
    code,
    taglineKey,
    taglineAr: pt(taglineKey, undefined, "ar"),
    taglineEn: pt(taglineKey, undefined, "en"),
  });
}

export const PUBLIC_MEMBERSHIP_TIER_DISPLAY = Object.freeze({
  starter: tierDisplay("starter", "STARTER"),
  silver: tierDisplay("silver", "SILVER"),
  pro: tierDisplay("pro", "PRO"),
  elite: tierDisplay("elite", "ELITE"),
});

/**
 * Display text of a mapped membership card field for any UI locale.
 * Arabic / English read the DTO columns exactly as before (`<field>Ar` / `<field>En`, each falling back to the
 * other); German / Dutch / Romanian use the catalog key carried by the DTO (`<field>Key`), else the
 * system-content translation of the columns.
 *
 * @param {Record<string, unknown> | null | undefined} plan mapped card DTO
 * @param {"tagline" | "buttonText"} field
 * @param {string} locale
 * @returns {string}
 */
export function localizeMembershipCardText(plan, field, locale) {
  if (!plan) return "";
  const ar = String((field === "buttonText" ? plan.buttonText : plan[`${field}Ar`]) ?? "");
  const en = String(plan[`${field}En`] ?? "");
  if (isNewLocale(locale)) {
    const key = plan[`${field}Key`];
    if (key) {
      const value = pt(String(key), undefined, locale);
      if (value && value !== key) return value;
    }
    return localizeSystemText(locale, { ar, en });
  }
  if (locale === "en") return en || ar || "";
  return ar || en || "";
}

const PUBLIC_TIER_RANK = new Map(
  PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER.map((code, index) => [code, index]),
);

function normalizeTierCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isPublicMarketplaceTier(tierCode) {
  return PUBLIC_TIER_RANK.has(normalizeTierCode(tierCode));
}

/**
 * Secondary status lines (withdrawal only).
 * Duration is shown under the price; Bids/daily/project cap live in primary metrics UI.
 */
function buildSecondaryFeatureKeys(plan) {
  const keys = [];

  const withdrawal =
    plan?.withdrawalEnabled ?? plan?.capabilities?.withdrawalEnabled;
  if (withdrawal === false) {
    keys.push(WITHDRAWAL_OFF_KEY);
  } else if (withdrawal === true) {
    keys.push(WITHDRAWAL_ON_KEY);
  }

  return keys;
}

function buildPrimaryMetrics(plan) {
  const bidsRaw = Number(plan?.monthlyBidAllowance);
  const dailyRaw = Number(
    plan?.dailyBidSpendLimit ?? plan?.capabilities?.dailyBidSpendLimit,
  );
  const unlimited = Boolean(plan?.access?.unlimited ?? plan?.unlimitedRealOrderValue);
  const maxValue = plan?.access?.maxRealOrderValueJod ?? plan?.maxRealOrderValueJod;
  const maxNum = maxValue != null && Number.isFinite(Number(maxValue)) ? Number(maxValue) : null;

  return {
    bids: Number.isFinite(bidsRaw) ? bidsRaw : null,
    dailyLimit: Number.isFinite(dailyRaw) ? dailyRaw : null,
    projectMaxJod: unlimited ? null : maxNum,
    unlimitedProjects: unlimited,
  };
}

function isAnnualCatalogPlan(plan) {
  return normalizeTierCode(plan?.catalogCategory) === "annual";
}

function mapIncludedBenefits(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && (b.labelAr || b.labelEn))
    .map((b) => ({
      code: b.code || null,
      labelAr: b.labelAr || b.labelEn,
      labelEn: b.labelEn || b.labelAr,
    }));
}

/**
 * @param {object} plan — public marketplace membership plan DTO
 * @returns {object} plan card DTO for PricingSection
 */
export function mapMarketplaceMembershipPlanForPublicPlans(plan) {
  if (!plan || typeof plan !== "object") return null;

  const tierCode = normalizeTierCode(plan.tierCode);
  if (!isPublicMarketplaceTier(tierCode)) return null;
  if (isAnnualCatalogPlan(plan)) return null;

  const display = PUBLIC_MEMBERSHIP_TIER_DISPLAY[tierCode];
  return buildMembershipPlanCard(plan, tierCode, {
    titleAr: display.code,
    titleEn: display.code,
    taglineAr: display.taglineAr,
    taglineEn: display.taglineEn,
    taglineKey: display.taglineKey,
    isPopular: tierCode === "pro",
  });
}

/**
 * Annual Plans tab — same card DTO as the marketplace catalog, named from the plan row.
 * @param {object} plan — public marketplace membership plan DTO (catalogCategory = annual)
 */
export function mapAnnualMembershipPlanForPublicPlans(plan) {
  if (!plan || typeof plan !== "object" || !isAnnualCatalogPlan(plan)) return null;
  const tierCode = normalizeTierCode(plan.tierCode);
  if (!tierCode) return null;
  // Annual SILVER is titled by the tier it grants ("SILVER"); the tab + duration convey "annual".
  const entitlementTier = normalizeTierCode(plan.entitlementTierCode);
  const entitlementDisplay = PUBLIC_MEMBERSHIP_TIER_DISPLAY[entitlementTier];
  const titleAr = entitlementDisplay?.code || plan.nameAr || plan.nameEn || tierCode.toUpperCase();
  const titleEn = entitlementDisplay?.code || plan.nameEn || plan.nameAr || tierCode.toUpperCase();
  return {
    ...buildMembershipPlanCard(plan, tierCode, {
      titleAr,
      titleEn,
      taglineAr: entitlementDisplay ? "" : plan.descriptionAr || "",
      taglineEn: entitlementDisplay ? "" : plan.descriptionEn || plan.descriptionAr || "",
      isPopular: false,
    }),
    // Reuse the granted tier's card styling (e.g. the SILVER accent).
    visualTierCode: entitlementDisplay ? entitlementTier : tierCode,
  };
}

/** Annual Plans, ordered by catalog sort order. */
export function mapAnnualMembershipPlansForPublicPlans(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(mapAnnualMembershipPlanForPublicPlans)
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function buildMembershipPlanCard(plan, tierCode, display) {
  const sale = plan.sale && typeof plan.sale === "object" ? plan.sale : null;
  const effectivePrice =
    sale?.enabled && sale.effectivePriceJod != null
      ? Number(sale.effectivePriceJod)
      : Number(plan.monthlyPriceJod);
  const priceJod = Number.isFinite(effectivePrice) ? effectivePrice : 0;

  const durationDaysRaw = Number(
    plan.cycleDurationDays ?? plan?.capabilities?.cycleDurationDays,
  );
  const durationMonthsRaw = Number(
    plan.entitlementDurationMonths ?? plan?.capabilities?.entitlementDurationMonths,
  );
  const durationMonths =
    Number.isInteger(durationMonthsRaw) && durationMonthsRaw > 0 ? durationMonthsRaw : null;
  // Calendar-month terms win over day counts (mirrors the server term resolver).
  const durationDays =
    !durationMonths && Number.isFinite(durationDaysRaw) && durationDaysRaw > 0 ? durationDaysRaw : null;

  const primaryMetrics = buildPrimaryMetrics(plan);
  // Data columns: always the Arabic and the English catalog text (independent of the UI locale).
  const featureKeys = buildSecondaryFeatureKeys(plan);
  const featuresAr = featureKeys.map((key) => pt(key, undefined, "ar"));
  const featuresEn = featureKeys.map((key) => pt(key, undefined, "en"));

  return {
    id: String(plan.id),
    catalogSource: "marketplace_membership",
    marketplaceMembership: true,
    catalogCategory: isAnnualCatalogPlan(plan) ? "annual" : "marketplace",
    tierCode: plan.tierCode || tierCode,
    sortOrder: Number(plan.sortOrder) || 0,
    name: display.titleAr,
    nameAr: display.titleAr,
    nameEn: display.titleEn,
    title: display.titleAr,
    titleEn: display.titleEn,
    taglineAr: display.taglineAr,
    taglineEn: display.taglineEn,
    taglineKey: display.taglineKey || null,
    description: "",
    descriptionEn: "",
    priceJod,
    monthlyPriceJod: plan.monthlyPriceJod != null ? Number(plan.monthlyPriceJod) : priceJod,
    billingText: null,
    billingTextEn: null,
    durationDays,
    durationMonths,
    bidAllowanceScope: plan.bidAllowanceScope === "term" ? "term" : "cycle",
    includedBenefits: mapIncludedBenefits(plan.includedBenefits),
    primaryMetrics,
    features: featuresAr,
    featuresEn,
    planFeatures: featuresAr.map((text, i) => ({
      featureText: text,
      featureTextEn: featuresEn[i] || text,
      featureKey: featureKeys[i],
      isIncluded: true,
    })),
    selfCheckoutEligible: false,
    buttonText: pt(MEMBERSHIP_VIEW_KEY, undefined, "ar"),
    buttonTextEn: pt(MEMBERSHIP_VIEW_KEY, undefined, "en"),
    buttonTextKey: MEMBERSHIP_VIEW_KEY,
    isPopular: display.isPopular,
    isFeatured: display.isPopular,
    monthlyBidAllowance: Number(plan.monthlyBidAllowance) || 0,
    articleAccessLevel: plan.articleAccessLevel ?? 1,
    priorityBidEnabled: Boolean(plan?.capabilities?.priorityBid),
    priorityBidUsesPerCycle:
      Number(plan?.capabilities?.priorityBidUsesPerCycle) || 0,
    dailyBidSpendLimit:
      plan.dailyBidSpendLimit != null
        ? Number(plan.dailyBidSpendLimit)
        : plan?.capabilities?.dailyBidSpendLimit != null
          ? Number(plan.capabilities.dailyBidSpendLimit)
          : null,
    withdrawalEnabled:
      plan.withdrawalEnabled ?? plan?.capabilities?.withdrawalEnabled ?? null,
    maxRealOrderValueJod: plan?.access?.maxRealOrderValueJod ?? plan?.maxRealOrderValueJod ?? null,
    unlimitedRealOrderValue: Boolean(plan?.access?.unlimited ?? plan?.unlimitedRealOrderValue),
    sale:
      sale?.enabled
        ? {
            enabled: true,
            percentage: sale.percentage ?? sale.salePercentage ?? null,
            originalPriceJod: sale.originalPriceJod ?? plan.monthlyPriceJod,
            effectivePriceJod: sale.effectivePriceJod ?? priceJod,
          }
        : { enabled: false },
  };
}

/**
 * Map + keep only STARTER/SILVER/PRO/ELITE, ordered in that progression.
 * Never merges legacy subscription plans. Empty input → empty list (caller shows error/empty).
 */
export function mapMarketplaceMembershipPlansForPublicPlans(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(mapMarketplaceMembershipPlanForPublicPlans)
    .filter(Boolean)
    .sort((a, b) => {
      const ra = PUBLIC_TIER_RANK.get(normalizeTierCode(a.tierCode)) ?? 999;
      const rb = PUBLIC_TIER_RANK.get(normalizeTierCode(b.tierCode)) ?? 999;
      return ra - rb;
    });
}
