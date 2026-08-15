/** Pure helpers for Marketplace Membership admin UI (no React). */

export function formatMarketplaceAccessLabel(plan, isEn = false) {
  if (!plan) return "—";
  if (plan.unlimitedRealOrderValue) {
    return isEn ? "Unlimited real orders" : "غير محدود (طلبات حقيقية)";
  }
  const max = plan.maxRealOrderValueJod;
  if (max == null) return "—";
  return isEn ? `Up to ${max} JOD (real)` : `حتى ${max} د.أ (حقيقية)`;
}

export function formatMarketplacePriceLabel(plan, isEn = false) {
  if (!plan) return "—";
  const sale = plan.sale;
  const currency = isEn ? "JOD" : "د.أ";
  if (sale?.enabled && sale.effectivePriceJod != null) {
    return `${sale.effectivePriceJod} ${currency}`;
  }
  const price = plan.monthlyPriceJod;
  if (price == null) return "—";
  return `${price} ${currency}`;
}

export function getInitialMarketplacePlanFormState(overrides = {}) {
  return {
    tierCode: "",
    nameAr: "",
    nameEn: "",
    slug: "",
    descriptionAr: "",
    descriptionEn: "",
    isActive: true,
    sortOrder: 0,
    monthlyPriceJod: "",
    maxRealOrderValueJod: "",
    unlimitedRealOrderValue: false,
    monthlyBidAllowance: 0,
    articleAccessLevel: 1,
    cycleDurationDays: "",
    dailyBidSpendLimit: "",
    projectMinValueJod: "1",
    withdrawalEnabled: true,
    starterEarningsMode: "standard",
    bidDistributionMode: "full_cycle",
    isOneTimeStarter: false,
    cashAllowed: false,
    minimumCashMonths: 1,
    maximumPrepaidMonths: 1,
    eliteDirectOrdersEnabled: false,
    priorityBidEnabled: false,
    priorityBidUsesPerCycle: 0,
    saleEnabled: false,
    salePercentage: "",
    saleReason: "",
    saleReasonEn: "",
    ...overrides,
  };
}

export function planToMarketplaceFormState(plan) {
  if (!plan) return getInitialMarketplacePlanFormState();
  return getInitialMarketplacePlanFormState({
    tierCode: plan.tierCode || "",
    nameAr: plan.nameAr || "",
    nameEn: plan.nameEn || "",
    slug: plan.slug || "",
    descriptionAr: plan.descriptionAr || "",
    descriptionEn: plan.descriptionEn || "",
    isActive: plan.isActive !== false,
    sortOrder: plan.sortOrder ?? 0,
    monthlyPriceJod: plan.monthlyPriceJod ?? "",
    maxRealOrderValueJod: plan.unlimitedRealOrderValue ? "" : plan.maxRealOrderValueJod ?? "",
    unlimitedRealOrderValue: Boolean(plan.unlimitedRealOrderValue),
    monthlyBidAllowance: plan.monthlyBidAllowance ?? 0,
    articleAccessLevel: plan.articleAccessLevel ?? 1,
    cycleDurationDays: plan.cycleDurationDays ?? "",
    dailyBidSpendLimit: plan.dailyBidSpendLimit ?? "",
    projectMinValueJod: plan.projectMinValueJod ?? "1",
    withdrawalEnabled: plan.withdrawalEnabled !== false,
    starterEarningsMode: plan.starterEarningsMode || "standard",
    bidDistributionMode: plan.bidDistributionMode || "full_cycle",
    isOneTimeStarter: Boolean(plan.isOneTimeStarter),
    cashAllowed: Boolean(plan.cashAllowed),
    minimumCashMonths: plan.minimumCashMonths ?? 1,
    maximumPrepaidMonths: plan.maximumPrepaidMonths ?? 1,
    eliteDirectOrdersEnabled: Boolean(plan.eliteDirectOrdersEnabled),
    priorityBidEnabled: Boolean(plan.priorityBidEnabled),
    priorityBidUsesPerCycle: plan.priorityBidUsesPerCycle ?? 0,
    saleEnabled: Boolean(plan.saleEnabled),
    salePercentage: plan.salePercentage ?? "",
    saleReason: plan.saleReason || "",
    saleReasonEn: plan.saleReasonEn || "",
  });
}

export function validateMarketplacePlanForm(form, { isCreate = false } = {}) {
  const errors = {};
  if (isCreate) {
    const code = String(form.tierCode || "").trim();
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(code)) {
      errors.tierCode = "رمز الباقة يجب أن يكون snake_case صغير.";
    }
  }
  if (!String(form.nameAr || "").trim()) {
    errors.nameAr = "الاسم بالعربية مطلوب.";
  }
  const price = Number(form.monthlyPriceJod);
  if (!Number.isFinite(price) || price < 0) {
    errors.monthlyPriceJod = "السعر الشهري غير صالح.";
  }
  if (form.unlimitedRealOrderValue) {
    if (form.maxRealOrderValueJod !== "" && form.maxRealOrderValueJod != null) {
      const max = Number(form.maxRealOrderValueJod);
      if (Number.isFinite(max) && max > 0) {
        errors.maxRealOrderValueJod = "اترك الحد فارغاً عند الوصول غير المحدود.";
      }
    }
  } else {
    const max = Number(form.maxRealOrderValueJod);
    if (!Number.isFinite(max) || max <= 0) {
      errors.maxRealOrderValueJod = "حد قيمة الطلب الحقيقي مطلوب.";
    }
  }
  const bids = Number(form.monthlyBidAllowance);
  if (!Number.isInteger(bids) || bids < 0) {
    errors.monthlyBidAllowance = "عدد العروض الشهرية يجب أن يكون ≥ 0.";
  }
  const articleLevel = Number(form.articleAccessLevel);
  if (!Number.isInteger(articleLevel) || articleLevel < 1 || articleLevel > 5) {
    errors.articleAccessLevel = "مستوى الوصول للمقالات يجب أن يكون بين 1 و 5.";
  }
  const pbUses = Number(form.priorityBidUsesPerCycle);
  if (!Number.isInteger(pbUses) || pbUses < 0 || pbUses > 1000) {
    errors.priorityBidUsesPerCycle = "استخدامات Priority Bid يجب أن تكون بين 0 و 1000.";
  }
  const minM = Number(form.minimumCashMonths);
  const maxM = Number(form.maximumPrepaidMonths);
  if (!Number.isInteger(minM) || minM < 1) {
    errors.minimumCashMonths = "الحد الأدنى للأشهر ≥ 1.";
  }
  if (!Number.isInteger(maxM) || maxM < 1) {
    errors.maximumPrepaidMonths = "الحد الأقصى للأشهر ≥ 1.";
  } else if (Number.isInteger(minM) && maxM < minM) {
    errors.maximumPrepaidMonths = "الأقصى يجب أن يكون ≥ الأدنى.";
  }
  if (form.saleEnabled) {
    const pct = Number(form.salePercentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      errors.salePercentage = "نسبة الخصم بين 0 و 100.";
    }
    if (!String(form.saleReason || "").trim()) {
      errors.saleReason = "سبب الخصم مطلوب.";
    }
  }
  return errors;
}

export function normalizeMarketplacePlanPayload(form, { isCreate = false } = {}) {
  const unlimited = Boolean(form.unlimitedRealOrderValue);
  const payload = {
    nameAr: String(form.nameAr || "").trim(),
    nameEn: String(form.nameEn || "").trim() || null,
    slug: String(form.slug || "").trim().toLowerCase() || null,
    descriptionAr: String(form.descriptionAr || "").trim() || null,
    descriptionEn: String(form.descriptionEn || "").trim() || null,
    isActive: form.isActive !== false,
    sortOrder: Number(form.sortOrder) || 0,
    monthlyPriceJod: Number(form.monthlyPriceJod),
    unlimitedRealOrderValue: unlimited,
    maxRealOrderValueJod: unlimited ? null : Number(form.maxRealOrderValueJod),
    monthlyBidAllowance: Number(form.monthlyBidAllowance) || 0,
    articleAccessLevel: Number(form.articleAccessLevel) || 1,
    cycleDurationDays:
      form.cycleDurationDays === "" || form.cycleDurationDays == null
        ? null
        : Number(form.cycleDurationDays),
    dailyBidSpendLimit:
      form.dailyBidSpendLimit === "" || form.dailyBidSpendLimit == null
        ? null
        : Number(form.dailyBidSpendLimit),
    projectMinValueJod:
      form.projectMinValueJod === "" || form.projectMinValueJod == null
        ? null
        : Number(form.projectMinValueJod),
    withdrawalEnabled: form.withdrawalEnabled !== false,
    starterEarningsMode: String(form.starterEarningsMode || "standard").trim() || null,
    bidDistributionMode: String(form.bidDistributionMode || "full_cycle").trim(),
    isOneTimeStarter: Boolean(form.isOneTimeStarter),
    cashAllowed: Boolean(form.cashAllowed),
    minimumCashMonths: Number(form.minimumCashMonths) || 1,
    maximumPrepaidMonths: Number(form.maximumPrepaidMonths) || 1,
    eliteDirectOrdersEnabled: Boolean(form.eliteDirectOrdersEnabled),
    priorityBidEnabled: Boolean(form.priorityBidEnabled),
    priorityBidUsesPerCycle: Number(form.priorityBidUsesPerCycle) || 0,
    saleEnabled: Boolean(form.saleEnabled),
    salePercentage: form.saleEnabled ? Number(form.salePercentage) : null,
    saleReason: form.saleEnabled ? String(form.saleReason || "").trim() : null,
    saleReasonEn: form.saleEnabled ? String(form.saleReasonEn || "").trim() || null : null,
  };
  if (isCreate) {
    payload.tierCode = String(form.tierCode || "").trim().toLowerCase();
  }
  return payload;
}

/** Same field as the Super Admin إظهار / إخفاء control (`plan.isActive`). */
export function isMarketplacePlanShownToUsers(plan) {
  return Boolean(plan?.isActive);
}

/**
 * Admin-only card order: visible (shown) plans first, hidden last.
 * Preserves stored `sortOrder` (then id) inside each visibility group.
 * Do not use this for public /plans or freelancer plan catalogs.
 */
export function sortMarketplacePlansForAdmin(plans) {
  return [...(plans || [])].sort((a, b) => {
    const visDiff = Number(isMarketplacePlanShownToUsers(b)) - Number(isMarketplacePlanShownToUsers(a));
    if (visDiff !== 0) return visDiff;
    const orderDiff = Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return Number(a?.id) - Number(b?.id);
  });
}

export function getMarketplaceAdminMoveMeta(plans, planId) {
  const displayed = sortMarketplacePlansForAdmin(plans);
  const idx = displayed.findIndex((p) => String(p.id) === String(planId));
  if (idx < 0) {
    return { index: -1, canMoveUp: false, canMoveDown: false, total: displayed.length };
  }
  const currentVisible = isMarketplacePlanShownToUsers(displayed[idx]);
  const prev = displayed[idx - 1];
  const next = displayed[idx + 1];
  return {
    index: idx,
    canMoveUp: Boolean(prev) && isMarketplacePlanShownToUsers(prev) === currentVisible,
    canMoveDown: Boolean(next) && isMarketplacePlanShownToUsers(next) === currentVisible,
    total: displayed.length,
  };
}

/**
 * Swap a plan with its admin-neighbor of the same visibility.
 * Returns stored-order ids (not the admin grouped view) so public sort_order is not overwritten.
 */
export function buildMarketplaceReorderIds(plans, planId, direction) {
  const stored = [...(plans || [])];
  const displayed = sortMarketplacePlansForAdmin(stored);
  const idx = displayed.findIndex((p) => String(p.id) === String(planId));
  if (idx < 0) return null;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= displayed.length) return null;
  const current = displayed[idx];
  const neighbor = displayed[swapWith];
  if (isMarketplacePlanShownToUsers(current) !== isMarketplacePlanShownToUsers(neighbor)) {
    return null;
  }
  const storedIdx = stored.findIndex((p) => String(p.id) === String(current.id));
  const storedNeighborIdx = stored.findIndex((p) => String(p.id) === String(neighbor.id));
  if (storedIdx < 0 || storedNeighborIdx < 0) return null;
  const tmp = stored[storedIdx];
  stored[storedIdx] = stored[storedNeighborIdx];
  stored[storedNeighborIdx] = tmp;
  return stored.map((p) => p.id);
}
