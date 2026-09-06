/**
 * Pool order plan eligibility — read from API (`order.poolEligibility`), do not recalculate ranges in UI.
 */

export const POOL_PLAN_ELIGIBILITY_REASON = Object.freeze({
  PLAN_TOO_LOW: "PLAN_TOO_LOW",
  NO_ACTIVE_PLAN: "NO_ACTIVE_PLAN",
  INTERNAL_PLAN_CONFIGURATION: "INTERNAL_PLAN_CONFIGURATION",
});

export const POOL_PLAN_ELIGIBILITY_MESSAGE_AR = Object.freeze({
  PLAN_TOO_LOW: "قيمة هذا الطلب أعلى من حد باقتك الحالية",
  NO_ACTIVE_PLAN: "فعّل باقتك لاستلام الطلبات",
  INTERNAL_PLAN_CONFIGURATION: "تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.",
});

const LEGACY_PLAN_CORRECTION_RE = /الخطة بحاجة إلى تصحيح/;

export function getPoolOrderPlanEligibility(order) {
  return order?.poolEligibility && typeof order.poolEligibility === "object"
    ? order.poolEligibility
    : {};
}

export function isPoolOrderLockedByPlan(order) {
  return getPoolOrderPlanEligibility(order).isLockedByPlan === true;
}

/** Same rule as unlocked actions / non–«غير متاح لباقتك» pool rows (API `poolEligibility`). */
export function isPoolOrderAccessibleForPlan(order) {
  return !isPoolOrderLockedByPlan(order);
}

export function filterPoolOrdersAccessibleForPlan(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isPoolOrderAccessibleForPlan);
}

/** Short label on the card badge. */
export function poolOrderPlanLockBadgeText() {
  return "غير متاح لباقتك";
}

/**
 * User-facing helper for why take/bid is disabled.
 * Prefer API reasonCode; never show legacy internal “plan needs correction” copy.
 */
export function poolOrderPlanLockUserMessage(order) {
  const pe = getPoolOrderPlanEligibility(order);
  const code = String(pe.reasonCode || "").trim();
  if (code && POOL_PLAN_ELIGIBILITY_MESSAGE_AR[code]) {
    return POOL_PLAN_ELIGIBILITY_MESSAGE_AR[code];
  }
  if (pe.planConfigurationError === true) {
    return POOL_PLAN_ELIGIBILITY_MESSAGE_AR.INTERNAL_PLAN_CONFIGURATION;
  }
  const raw = String(pe.lockReason || "").trim();
  if (raw && LEGACY_PLAN_CORRECTION_RE.test(raw)) {
    return POOL_PLAN_ELIGIBILITY_MESSAGE_AR.INTERNAL_PLAN_CONFIGURATION;
  }
  if (raw) return raw;
  if (pe.isLockedByPlan) return POOL_PLAN_ELIGIBILITY_MESSAGE_AR.PLAN_TOO_LOW;
  return poolOrderPlanLockBadgeText();
}

/** Tooltip/title for locked plan actions. */
export function poolOrderPlanLockTooltip(order) {
  return poolOrderPlanLockUserMessage(order);
}

export function poolOrderPlanLockMessage(order) {
  return poolOrderPlanLockUserMessage(order);
}

export function poolOrderActionDisabledByPlan(order) {
  const pe = getPoolOrderPlanEligibility(order);
  if (pe.isLockedByPlan) return true;
  return false;
}
