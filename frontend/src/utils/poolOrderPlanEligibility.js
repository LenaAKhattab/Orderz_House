/**
 * Pool order plan eligibility — read from API (`order.poolEligibility`), do not recalculate ranges in UI.
 */
export function getPoolOrderPlanEligibility(order) {
  return order?.poolEligibility && typeof order.poolEligibility === "object" ? order.poolEligibility : {};
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

/** Tooltip/title for locked plan actions (single copy; ignores API `lockReason`). */
export function poolOrderPlanLockTooltip(_order) {
  return poolOrderPlanLockBadgeText();
}

export function poolOrderPlanLockMessage(order) {
  return poolOrderPlanLockTooltip(order);
}

export function poolOrderActionDisabledByPlan(order) {
  const pe = getPoolOrderPlanEligibility(order);
  if (pe.isLockedByPlan) return true;
  return false;
}
