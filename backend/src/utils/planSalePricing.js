/**
 * Single source of truth for plan sale / percentage discount pricing.
 * Base payable amount is never overwritten in the DB when a sale is active.
 *
 * One-time checkout base: effectiveCheckoutPriceJod (stripe_checkout_amount_jod if > 0 else price_jod).
 * Recurring checkout base: price_jod (existing Stripe recurring path).
 * Activation fee is never discounted here.
 */

const { amountMajorToStripeMinor } = require("./stripeMoney");
const { effectiveCheckoutPriceJod } = require("./planFields");

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

/**
 * Convert major JOD ↔ minor using project Stripe rules, then back for 3-decimal safety.
 * @param {number} major
 * @param {number} percentage 0 < pct < 100
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
 * Resolve payable pricing for a plan row.
 * @param {object} planRow DB row or mapPlan-like object (snake or camel)
 * @param {{ mode?: 'one_time' | 'recurring', saleRow?: object | null }} [options]
 */
function resolvePlanPayablePricing(planRow, options = {}) {
  const mode = options.mode === "recurring" ? "recurring" : "one_time";
  const saleSource = options.saleRow || planRow;
  if (!planRow) {
    return {
      active: false,
      mode,
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

  const snake = planRow.price_jod != null || planRow.sale_enabled != null;
  const priceJod = snake
    ? toFiniteNumber(planRow.price_jod)
    : toFiniteNumber(planRow.priceJod);
  const stripeCheckout = snake
    ? toFiniteNumber(planRow.stripe_checkout_amount_jod)
    : toFiniteNumber(planRow.stripeCheckoutAmountJod);

  let originalPriceJod = null;
  if (mode === "recurring") {
    originalPriceJod = priceJod != null && priceJod > 0 ? priceJod : null;
  } else {
    const rowForBase = snake
      ? planRow
      : {
          price_jod: priceJod,
          stripe_checkout_amount_jod: stripeCheckout,
        };
    originalPriceJod = effectiveCheckoutPriceJod(rowForBase);
  }

  const saleEnabled = snake
    ? isTruthyFlag(saleSource.sale_enabled)
    : Boolean(saleSource.saleEnabled ?? saleSource.sale_enabled);
  const salePercentage = snake
    ? toFiniteNumber(saleSource.sale_percentage)
    : toFiniteNumber(saleSource.salePercentage ?? saleSource.sale_percentage);
  const saleReason = snake
    ? saleSource.sale_reason || null
    : saleSource.saleReason || saleSource.sale_reason || null;
  const saleReasonEn = snake
    ? saleSource.sale_reason_en || null
    : saleSource.saleReasonEn || saleSource.sale_reason_en || null;

  const currency = String(
    (snake ? planRow.currency : planRow.currency) || "JOD",
  ).toUpperCase();

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
      mode,
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
      mode,
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
    mode,
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
 * Validate sale patch for admin create/update. Throws Error with statusCode.
 * @param {{ saleEnabled?: boolean, salePercentage?: number|null, saleReason?: string|null, saleReasonEn?: string|null }} patch
 * @param {{ priceJod?: number|null, stripeCheckoutAmountJod?: number|null, isRecurring?: boolean }} planAmounts
 */
function assertValidSalePatch(patch, planAmounts = {}) {
  if (patch.saleEnabled === undefined && patch.salePercentage === undefined && patch.saleReason === undefined && patch.saleReasonEn === undefined) {
    return;
  }

  const enabled = patch.saleEnabled !== undefined ? Boolean(patch.saleEnabled) : Boolean(planAmounts.saleEnabled);
  if (!enabled) return;

  const pct =
    patch.salePercentage !== undefined
      ? toFiniteNumber(patch.salePercentage)
      : toFiniteNumber(planAmounts.salePercentage);
  const reason =
    patch.saleReason !== undefined
      ? String(patch.saleReason || "").trim()
      : String(planAmounts.saleReason || "").trim();
  const reasonEn =
    patch.saleReasonEn !== undefined
      ? String(patch.saleReasonEn || "").trim()
      : String(planAmounts.saleReasonEn || "").trim();

  if (pct == null || pct <= 0 || pct >= 100) {
    const err = new Error("نسبة الخصم يجب أن تكون أكبر من 0 وأقل من 100.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "INVALID_SALE_PERCENTAGE";
    throw err;
  }
  if (!reason) {
    const err = new Error("يرجى إدخال سبب الخصم.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "SALE_REASON_REQUIRED";
    throw err;
  }

  const isRecurring = Boolean(planAmounts.isRecurring);
  const base = isRecurring
    ? toFiniteNumber(planAmounts.priceJod)
    : effectiveCheckoutPriceJod({
        price_jod: planAmounts.priceJod,
        stripe_checkout_amount_jod: planAmounts.stripeCheckoutAmountJod,
      });

  if (base == null || base <= 0) {
    const err = new Error("لا يمكن تفعيل خصم نسبة مئوية على باقة مجانية أو بلا مبلغ مستحق.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "SALE_NOT_ALLOWED_ON_FREE_PLAN";
    throw err;
  }

  const applied = applyPercentageDiscountMajor(base, pct, "JOD");
  if (!applied || applied.effectivePriceJod <= 0) {
    const err = new Error("الخصم ينتج مبلغاً غير صالح للدفع.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "SALE_EFFECTIVE_AMOUNT_INVALID";
    throw err;
  }

  // reasonEn optional but if provided keep length sensible (validated elsewhere)
  void reasonEn;
}

function attachSaleFieldsToMappedPlan(mapped, row) {
  if (!mapped || !row) return mapped;
  const recurring = Boolean(row.is_recurring);
  const pricing = resolvePlanPayablePricing(row, { mode: recurring ? "recurring" : "one_time" });
  mapped.saleEnabled = Boolean(row.sale_enabled);
  mapped.salePercentage =
    row.sale_percentage != null && mapped.saleEnabled ? Number(row.sale_percentage) : null;
  mapped.saleReason = row.sale_reason || null;
  mapped.saleReasonEn = row.sale_reason_en || null;
  mapped.originalPriceJod = pricing.originalPriceJod;
  mapped.effectivePriceJod = pricing.effectivePriceJod;
  mapped.savingsJod = pricing.active ? pricing.savingsJod : 0;
  mapped.saleActive = pricing.active;
  if (pricing.active) {
    mapped.salePercentage = pricing.salePercentage;
    mapped.saleReason = pricing.saleReason;
    mapped.saleReasonEn = pricing.saleReasonEn;
  } else {
    // Public consumers should not treat stored-but-inactive sale as active
    mapped.saleActive = false;
  }
  return mapped;
}

module.exports = {
  resolvePlanPayablePricing,
  applyPercentageDiscountMajor,
  assertValidSalePatch,
  attachSaleFieldsToMappedPlan,
  toFiniteNumber,
};
