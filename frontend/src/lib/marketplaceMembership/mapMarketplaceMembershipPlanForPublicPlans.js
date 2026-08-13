/**
 * Maps public Marketplace Membership catalog rows into the shape used by
 * public `/plans` PricingSection / PlanCard (display + CTA only).
 * Does NOT merge with legacy subscription / page-package plan systems.
 * Does NOT fall back to legacy GET /api/plans catalog data.
 */

/** Public catalog progression (ignore DB id / accidental price sorts). */
export const PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER = Object.freeze([
  "starter",
  "silver",
  "pro",
  "elite",
]);

/** Display-only labels (not commercial values). Values still come from DTO fields. */
export const PUBLIC_MEMBERSHIP_TIER_DISPLAY = Object.freeze({
  starter: {
    code: "STARTER",
    taglineAr: "للبداية",
    taglineEn: "To get started",
  },
  silver: {
    code: "SILVER",
    taglineAr: "للانطلاق",
    taglineEn: "To grow",
  },
  pro: {
    code: "PRO",
    taglineAr: "للمحترفين",
    taglineEn: "For professionals",
  },
  elite: {
    code: "ELITE",
    taglineAr: "لأعلى مستوى",
    taglineEn: "Maximum access",
  },
});

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
function buildSecondaryFeatures(plan, isEn) {
  const features = [];

  const withdrawal =
    plan?.withdrawalEnabled ?? plan?.capabilities?.withdrawalEnabled;
  if (withdrawal === false) {
    features.push(
      isEn
        ? "No direct payout of financial amounts"
        : "لا يوجد استلام مباشر للقيم المالية",
    );
  } else if (withdrawal === true) {
    features.push(isEn ? "Withdrawal available" : "السحب متاح");
  }

  return features;
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

/**
 * @param {object} plan — public marketplace membership plan DTO
 * @returns {object} plan card DTO for PricingSection
 */
export function mapMarketplaceMembershipPlanForPublicPlans(plan) {
  if (!plan || typeof plan !== "object") return null;

  const tierCode = normalizeTierCode(plan.tierCode);
  if (!isPublicMarketplaceTier(tierCode)) return null;

  const display = PUBLIC_MEMBERSHIP_TIER_DISPLAY[tierCode];
  const sale = plan.sale && typeof plan.sale === "object" ? plan.sale : null;
  const effectivePrice =
    sale?.enabled && sale.effectivePriceJod != null
      ? Number(sale.effectivePriceJod)
      : Number(plan.monthlyPriceJod);
  const priceJod = Number.isFinite(effectivePrice) ? effectivePrice : 0;

  const durationDaysRaw = Number(
    plan.cycleDurationDays ?? plan?.capabilities?.cycleDurationDays,
  );
  const durationDays =
    Number.isFinite(durationDaysRaw) && durationDaysRaw > 0 ? durationDaysRaw : null;

  const primaryMetrics = buildPrimaryMetrics(plan);
  const featuresAr = buildSecondaryFeatures(plan, false);
  const featuresEn = buildSecondaryFeatures(plan, true);
  const tierTitle = display.code;

  return {
    id: String(plan.id),
    catalogSource: "marketplace_membership",
    marketplaceMembership: true,
    tierCode: plan.tierCode || tierCode,
    name: tierTitle,
    nameAr: tierTitle,
    nameEn: tierTitle,
    title: tierTitle,
    titleEn: tierTitle,
    taglineAr: display.taglineAr,
    taglineEn: display.taglineEn,
    description: "",
    descriptionEn: "",
    priceJod,
    monthlyPriceJod: plan.monthlyPriceJod != null ? Number(plan.monthlyPriceJod) : priceJod,
    billingText: null,
    billingTextEn: null,
    durationDays,
    primaryMetrics,
    features: featuresAr,
    featuresEn,
    planFeatures: featuresAr.map((text, i) => ({
      featureText: text,
      featureTextEn: featuresEn[i] || text,
      isIncluded: true,
    })),
    selfCheckoutEligible: false,
    buttonText: "عرض العضوية",
    buttonTextEn: "View membership",
    isPopular: tierCode === "pro",
    isFeatured: tierCode === "pro",
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
