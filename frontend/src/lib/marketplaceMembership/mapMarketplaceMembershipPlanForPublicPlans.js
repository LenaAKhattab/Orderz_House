/**
 * Maps public Marketplace Membership catalog rows into the shape used by
 * public `/plans` PricingSection / PlanCard (display + CTA only).
 * Does NOT merge with legacy subscription / page-package plan systems.
 */

function buildFeatures(plan, isEn) {
  const features = [];
  const duration = Number(plan?.cycleDurationDays ?? plan?.capabilities?.cycleDurationDays) || null;
  if (duration) {
    features.push(isEn ? `${duration} day${duration === 1 ? "" : "s"}` : `${duration} يوم`);
  }

  const bids = Number(plan?.monthlyBidAllowance) || 0;
  features.push(
    isEn
      ? `${bids} Bid${bids === 1 ? "" : "s"} / cycle`
      : `${bids} ${bids === 1 ? "عرض" : "عروض"} / دورة`,
  );

  const daily =
    plan?.dailyBidSpendLimit ?? plan?.capabilities?.dailyBidSpendLimit;
  if (daily != null && Number.isFinite(Number(daily))) {
    features.push(
      isEn
        ? `Daily Bid limit: ${Number(daily)}`
        : `الحد اليومي للعروض: ${Number(daily)}`,
    );
  }

  const unlimited = Boolean(plan?.access?.unlimited ?? plan?.unlimitedRealOrderValue);
  const maxValue = plan?.access?.maxRealOrderValueJod ?? plan?.maxRealOrderValueJod;
  const minValue = plan?.projectMinValueJod;
  if (unlimited) {
    features.push(
      isEn
        ? `Projects from ${minValue != null ? minValue : 1} JOD (no max)`
        : `مشاريع من ${minValue != null ? minValue : 1} د.أ بلا حد أعلى`,
    );
  } else if (maxValue != null && Number.isFinite(Number(maxValue))) {
    features.push(
      isEn
        ? `Projects ${minValue != null ? minValue : 1}–${maxValue} JOD`
        : `مشاريع ${minValue != null ? minValue : 1}–${maxValue} د.أ`,
    );
  }

  const withdrawal =
    plan?.withdrawalEnabled ?? plan?.capabilities?.withdrawalEnabled;
  if (withdrawal === false) {
    features.push(isEn ? "Withdrawal disabled" : "السحب متوقف");
  } else if (withdrawal === true) {
    features.push(isEn ? "Withdrawal enabled" : "السحب متاح");
  }

  const priorityOn = Boolean(plan?.capabilities?.priorityBid ?? plan?.priorityBidEnabled);
  const priorityUses = Number(
    plan?.capabilities?.priorityBidUsesPerCycle ?? plan?.priorityBidUsesPerCycle,
  ) || 0;
  if (priorityOn && priorityUses > 0) {
    features.push(
      isEn
        ? `${priorityUses} Priority Use${priorityUses === 1 ? "" : "s"} / cycle`
        : `${priorityUses} ${priorityUses === 1 ? "مرة أولوية" : "مرات أولوية"} / دورة`,
    );
  }

  return features;
}

/**
 * @param {object} plan — public marketplace membership plan DTO
 * @returns {object} plan card DTO for PricingSection
 */
export function mapMarketplaceMembershipPlanForPublicPlans(plan) {
  if (!plan || typeof plan !== "object") return null;

  const sale = plan.sale && typeof plan.sale === "object" ? plan.sale : null;
  const effectivePrice =
    sale?.enabled && sale.effectivePriceJod != null
      ? Number(sale.effectivePriceJod)
      : Number(plan.monthlyPriceJod);
  const priceJod = Number.isFinite(effectivePrice) ? effectivePrice : 0;

  const featuresAr = buildFeatures(plan, false);
  const featuresEn = buildFeatures(plan, true);

  return {
    id: String(plan.id),
    catalogSource: "marketplace_membership",
    marketplaceMembership: true,
    tierCode: plan.tierCode || null,
    name: plan.nameAr || plan.nameEn || "",
    nameAr: plan.nameAr || "",
    nameEn: plan.nameEn || null,
    title: plan.nameAr || plan.nameEn || "",
    titleEn: plan.nameEn || plan.nameAr || "",
    description: plan.descriptionAr || "",
    descriptionEn: plan.descriptionEn || "",
    priceJod,
    monthlyPriceJod: plan.monthlyPriceJod != null ? Number(plan.monthlyPriceJod) : priceJod,
    billingText: "شهرياً",
    billingTextEn: "Monthly",
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
    monthlyBidAllowance: Number(plan.monthlyBidAllowance) || 0,
    articleAccessLevel: plan.articleAccessLevel ?? 1,
    priorityBidEnabled: Boolean(plan?.capabilities?.priorityBid),
    priorityBidUsesPerCycle:
      Number(plan?.capabilities?.priorityBidUsesPerCycle) || 0,
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

export function mapMarketplaceMembershipPlansForPublicPlans(items) {
  if (!Array.isArray(items)) return [];
  return items.map(mapMarketplaceMembershipPlanForPublicPlans).filter(Boolean);
}
