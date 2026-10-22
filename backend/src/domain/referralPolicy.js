/**
 * Pure referral policy, attribution, and money rules.
 * JOD minor unit matches Stripe: 1 JOD = 1000 fils.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PERCENT_BPS = 10000;

const PAYMENT_TYPES = Object.freeze({
  TRAINING_PACKAGE: "training_package_purchase",
  MARKETPLACE_MEMBERSHIP: "marketplace_membership_purchase",
});

const DEFAULT_ELIGIBLE_PAYMENT_TYPES = Object.freeze([
  PAYMENT_TYPES.TRAINING_PACKAGE,
  PAYMENT_TYPES.MARKETPLACE_MEMBERSHIP,
]);

const ELIGIBLE_ROLES = Object.freeze(["client", "freelancer"]);

function normalizeReferralCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "");
}

function isReferralCodeShape(code) {
  return /^[A-Z2-9]{8}$/.test(String(code || ""));
}

function isEligibleReferralRole(role) {
  return ELIGIBLE_ROLES.includes(String(role || "").toLowerCase());
}

function calculateCommissionMinor({ mode, percentageBps, fixedMinor, baseMinor }) {
  const base = Math.trunc(Number(baseMinor));
  if (!Number.isInteger(base) || base <= 0) return 0;
  if (mode === "percentage") {
    const bps = Math.trunc(Number(percentageBps));
    if (!Number.isInteger(bps) || bps <= 0 || bps > MAX_PERCENT_BPS) return 0;
    return Math.floor((base * bps) / 10000);
  }
  if (mode === "fixed") {
    const fixed = Math.trunc(Number(fixedMinor));
    if (!Number.isInteger(fixed) || fixed <= 0) return 0;
    return Math.min(fixed, base);
  }
  return 0;
}

function calculateDiscountMinor({ enabled, mode, percentageBps, fixedMinor, baseMinor }) {
  if (!enabled) return 0;
  return calculateCommissionMinor({
    mode,
    percentageBps,
    fixedMinor,
    baseMinor,
  });
}

/**
 * First valid referral wins. A live cookie beats a later manual code.
 * An expired/invalid cookie does not block a manual code.
 */
function resolveAttributionSource({ cookie, manualCode, now = Date.now() }) {
  const expiresAt = cookie?.expiresAt ? new Date(cookie.expiresAt).getTime() : 0;
  const cookieCode = normalizeReferralCode(cookie?.code);
  const cookieValid = Boolean(cookieCode) && Number.isFinite(expiresAt) && expiresAt > now;
  if (cookieValid) {
    return {
      source: "link",
      code: cookieCode,
      visitId: cookie.visitId ? String(cookie.visitId) : null,
      ignoredManual: Boolean(normalizeReferralCode(manualCode)),
    };
  }
  const manual = normalizeReferralCode(manualCode);
  if (manual) {
    return { source: "manual", code: manual, visitId: null, ignoredManual: false };
  }
  return null;
}

function nextCommissionStatus(current, event) {
  if (event === "mature" && current === "pending") return "available";
  if (event === "refund" && (current === "pending" || current === "available")) return "reversed";
  if (event === "refund" && current === "paid") return "paid";
  return current;
}

function sumLedgerBuckets(entries) {
  const buckets = { pending: 0, available: 0, reserved: 0, paid: 0 };
  for (const entry of entries || []) {
    const bucket = entry.bucket;
    const amount = Math.trunc(Number(entry.amountMinor));
    if (!Object.prototype.hasOwnProperty.call(buckets, bucket)) continue;
    if (!Number.isInteger(amount)) continue;
    buckets[bucket] += amount;
  }
  return buckets;
}

function assertWithdrawalAmount(availableMinor, amountMinor, minimumMinor) {
  const available = Math.trunc(Number(availableMinor));
  const amount = Math.trunc(Number(amountMinor));
  const minimum = Math.trunc(Number(minimumMinor));
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, code: "INVALID_AMOUNT" };
  }
  if (Number.isInteger(minimum) && minimum > 0 && amount < minimum) {
    return { ok: false, code: "BELOW_MINIMUM" };
  }
  if (!Number.isInteger(available) || amount > available) {
    return { ok: false, code: "INSUFFICIENT_AVAILABLE" };
  }
  return { ok: true };
}

function uniquePaidReferralCount(referredUserIds) {
  return new Set((referredUserIds || []).filter(Boolean)).size;
}

function validatePolicyDraft(draft) {
  const errors = [];
  const mode = String(draft?.calculationMode || "");
  if (mode !== "percentage" && mode !== "fixed") errors.push("calculation_mode");
  const hold = Math.trunc(Number(draft?.commissionHoldDays));
  if (!Number.isInteger(hold) || hold < 0 || hold > 90) errors.push("commission_hold_days");
  const min = Math.trunc(Number(draft?.minimumWithdrawalMinor));
  if (!Number.isInteger(min) || min < 0) errors.push("minimum_withdrawal");
  if (mode === "percentage") {
    const bps = Math.trunc(Number(draft?.percentageBps));
    if (!Number.isInteger(bps) || bps <= 0 || bps > MAX_PERCENT_BPS) errors.push("percentage");
  }
  if (mode === "fixed") {
    const fixed = Math.trunc(Number(draft?.fixedAmountMinor));
    if (!Number.isInteger(fixed) || fixed <= 0) errors.push("fixed_amount");
  }
  const types = Array.isArray(draft?.eligiblePaymentTypes) ? draft.eligiblePaymentTypes : [];
  const allowed = new Set(Object.values(PAYMENT_TYPES));
  if (!types.length || types.some((type) => !allowed.has(type))) errors.push("eligible_payment_types");
  if (draft?.discountEnabled) {
    const dMode = String(draft.discountMode || "");
    if (dMode !== "percentage" && dMode !== "fixed") errors.push("discount_mode");
    if (dMode === "percentage") {
      const bps = Math.trunc(Number(draft.discountPercentageBps));
      if (!Number.isInteger(bps) || bps <= 0 || bps > MAX_PERCENT_BPS) errors.push("discount_percentage");
    }
    if (dMode === "fixed") {
      const fixed = Math.trunc(Number(draft.discountFixedMinor));
      if (!Number.isInteger(fixed) || fixed <= 0) errors.push("discount_fixed");
    }
  }
  return { ok: errors.length === 0, errors };
}

function policySnapshotUnchanged(previous, next) {
  if (!previous) return false;
  const sameTypes =
    JSON.stringify([...(previous.eligiblePaymentTypes || [])].sort()) ===
    JSON.stringify([...(next.eligiblePaymentTypes || [])].sort());
  return (
    Boolean(previous.enabled) === Boolean(next.enabled) &&
    previous.calculationMode === next.calculationMode &&
    Number(previous.percentageBps || 0) === Number(next.percentageBps || 0) &&
    Number(previous.fixedAmountMinor || 0) === Number(next.fixedAmountMinor || 0) &&
    Number(previous.commissionHoldDays) === Number(next.commissionHoldDays) &&
    Number(previous.minimumWithdrawalMinor) === Number(next.minimumWithdrawalMinor) &&
    sameTypes &&
    Boolean(previous.discountEnabled) === Boolean(next.discountEnabled) &&
    String(previous.discountMode || "") === String(next.discountMode || "") &&
    Number(previous.discountPercentageBps || 0) === Number(next.discountPercentageBps || 0) &&
    Number(previous.discountFixedMinor || 0) === Number(next.discountFixedMinor || 0)
  );
}

module.exports = {
  CODE_ALPHABET,
  ATTRIBUTION_WINDOW_MS,
  MAX_PERCENT_BPS,
  PAYMENT_TYPES,
  DEFAULT_ELIGIBLE_PAYMENT_TYPES,
  ELIGIBLE_ROLES,
  normalizeReferralCode,
  isReferralCodeShape,
  isEligibleReferralRole,
  calculateCommissionMinor,
  calculateDiscountMinor,
  resolveAttributionSource,
  nextCommissionStatus,
  sumLedgerBuckets,
  assertWithdrawalAmount,
  uniquePaidReferralCount,
  validatePolicyDraft,
  policySnapshotUnchanged,
};
