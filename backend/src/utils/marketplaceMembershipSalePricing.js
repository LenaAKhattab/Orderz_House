/**
 * Marketplace membership sale pricing — table-agnostic helpers for
 * marketplace_membership_plans.monthly_price_jod (not legacy plans rows).
 */

const { amountMajorToStripeMinor } = require("./stripeMoney");
const { createAppError } = require("./AppError");

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

/**
 * @param {number} major
 * @param {number} percentage
 * @param {string} [currency]
 */
function applyPercentageDiscountMajor(major, percentage, currency = "JOD") {
  const baseMinor = amountMajorToStripeMinor(major, currency);
  if (baseMinor == null || baseMinor < 1) return null;
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  const discountMinor = Math.round((baseMinor * pct) / 100);
  const effectiveMinor = baseMinor - discountMinor;
  if (effectiveMinor < 1) return null;
  const divisor = currency.toUpperCase() === "JOD" ? 1000 : 100;
  return {
    originalMinor: baseMinor,
    discountMinor,
    effectiveMinor,
    originalPriceJod: baseMinor / divisor,
    savingsJod: discountMinor / divisor,
    effectivePriceJod: effectiveMinor / divisor,
  };
}

/**
 * Resolve payable monthly membership pricing from a marketplace plan row / mapped object.
 * @param {object} planRow
 */
function resolveMarketplaceMembershipPayablePricing(planRow) {
  if (!planRow) {
    return {
      active: false,
      originalPriceJod: null,
      effectivePriceJod: null,
      savingsJod: null,
      salePercentage: null,
      saleReason: null,
      saleReasonEn: null,
      originalMinor: null,
      effectiveMinor: null,
    };
  }

  const snake = planRow.monthly_price_jod != null || planRow.sale_enabled != null;
  const monthlyPriceJod = snake
    ? toFiniteNumber(planRow.monthly_price_jod)
    : toFiniteNumber(planRow.monthlyPriceJod);
  const saleEnabled = snake
    ? isTruthyFlag(planRow.sale_enabled)
    : Boolean(planRow.saleEnabled ?? planRow.sale_enabled);
  const salePercentage = snake
    ? toFiniteNumber(planRow.sale_percentage)
    : toFiniteNumber(planRow.salePercentage ?? planRow.sale_percentage);
  const saleReason = snake
    ? planRow.sale_reason || null
    : planRow.saleReason || planRow.sale_reason || null;
  const saleReasonEn = snake
    ? planRow.sale_reason_en || null
    : planRow.saleReasonEn || planRow.sale_reason_en || null;
  const currency = String(
    (snake ? planRow.stripe_price_currency : planRow.stripePriceCurrency) || "JOD",
  ).toUpperCase();

  const originalPriceJod =
    monthlyPriceJod != null && monthlyPriceJod >= 0 ? monthlyPriceJod : null;

  if (
    !saleEnabled ||
    originalPriceJod == null ||
    originalPriceJod <= 0 ||
    salePercentage == null ||
    salePercentage <= 0 ||
    salePercentage >= 100
  ) {
    const minor =
      originalPriceJod != null && originalPriceJod > 0
        ? amountMajorToStripeMinor(originalPriceJod, currency)
        : null;
    return {
      active: false,
      originalPriceJod,
      effectivePriceJod: originalPriceJod,
      savingsJod: 0,
      salePercentage: null,
      saleReason: null,
      saleReasonEn: null,
      originalMinor: minor,
      effectiveMinor: minor,
    };
  }

  const applied = applyPercentageDiscountMajor(originalPriceJod, salePercentage, currency);
  if (!applied) {
    const minor = amountMajorToStripeMinor(originalPriceJod, currency);
    return {
      active: false,
      originalPriceJod,
      effectivePriceJod: originalPriceJod,
      savingsJod: 0,
      salePercentage: null,
      saleReason: null,
      saleReasonEn: null,
      originalMinor: minor,
      effectiveMinor: minor,
    };
  }

  return {
    active: true,
    originalPriceJod: applied.originalPriceJod,
    effectivePriceJod: applied.effectivePriceJod,
    savingsJod: applied.savingsJod,
    salePercentage,
    saleReason: saleReason ? String(saleReason).trim() || null : null,
    saleReasonEn: saleReasonEn ? String(saleReasonEn).trim() || null : null,
    originalMinor: applied.originalMinor,
    effectiveMinor: applied.effectiveMinor,
  };
}

/**
 * @param {{ saleEnabled?: boolean, salePercentage?: number|null, saleReason?: string|null, saleReasonEn?: string|null }} patch
 * @param {{ monthlyPriceJod?: number|null, saleEnabled?: boolean, salePercentage?: number|null, saleReason?: string|null, saleReasonEn?: string|null }} planAmounts
 */
function assertValidMarketplaceSalePatch(patch, planAmounts = {}) {
  if (
    patch.saleEnabled === undefined &&
    patch.salePercentage === undefined &&
    patch.saleReason === undefined &&
    patch.saleReasonEn === undefined
  ) {
    return;
  }

  const enabled =
    patch.saleEnabled !== undefined ? Boolean(patch.saleEnabled) : Boolean(planAmounts.saleEnabled);
  if (!enabled) return;

  const pct =
    patch.salePercentage !== undefined
      ? toFiniteNumber(patch.salePercentage)
      : toFiniteNumber(planAmounts.salePercentage);
  const reason =
    patch.saleReason !== undefined
      ? String(patch.saleReason || "").trim()
      : String(planAmounts.saleReason || "").trim();

  if (pct == null || pct <= 0 || pct >= 100) {
    throw createAppError("نسبة الخصم يجب أن تكون أكبر من 0 وأقل من 100.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_SALE_PERCENTAGE",
    });
  }
  if (!reason) {
    throw createAppError("يرجى إدخال سبب الخصم.", 400, {
      exposeToClient: true,
      publicCode: "SALE_REASON_REQUIRED",
    });
  }

  const base = toFiniteNumber(planAmounts.monthlyPriceJod);
  if (base == null || base <= 0) {
    throw createAppError("لا يمكن تفعيل خصم نسبة مئوية على باقة مجانية أو بلا مبلغ مستحق.", 400, {
      exposeToClient: true,
      publicCode: "SALE_NOT_ALLOWED_ON_FREE_PLAN",
    });
  }

  const applied = applyPercentageDiscountMajor(base, pct, "JOD");
  if (!applied) {
    throw createAppError("الخصم ينتج مبلغاً غير صالح للدفع.", 400, {
      exposeToClient: true,
      publicCode: "SALE_EFFECTIVE_AMOUNT_INVALID",
    });
  }
}

function attachSaleFieldsToMappedMarketplacePlan(mapped, row) {
  const pricing = resolveMarketplaceMembershipPayablePricing(row || mapped);
  return {
    ...mapped,
    sale: {
      enabled: pricing.active,
      percentage: pricing.active ? pricing.salePercentage : mapped.salePercentage ?? null,
      reason: pricing.active ? pricing.saleReason : mapped.saleReason ?? null,
      reasonEn: pricing.active ? pricing.saleReasonEn : mapped.saleReasonEn ?? null,
      originalPriceJod: pricing.originalPriceJod,
      effectivePriceJod: pricing.effectivePriceJod,
      savingsJod: pricing.savingsJod,
    },
  };
}

module.exports = {
  applyPercentageDiscountMajor,
  resolveMarketplaceMembershipPayablePricing,
  assertValidMarketplaceSalePatch,
  attachSaleFieldsToMappedMarketplacePlan,
};
