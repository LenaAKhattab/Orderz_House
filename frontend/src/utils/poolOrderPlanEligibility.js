/**
 * Pool order plan eligibility — read from API (`order.poolEligibility`), do not recalculate ranges in UI.
 */
import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";

const PP = "platformUtils.poolPlan";

export const POOL_PLAN_ELIGIBILITY_REASON = Object.freeze({
  PLAN_TOO_LOW: "PLAN_TOO_LOW",
  NO_ACTIVE_PLAN: "NO_ACTIVE_PLAN",
  INTERNAL_PLAN_CONFIGURATION: "INTERNAL_PLAN_CONFIGURATION",
});

function planMessage(code, locale) {
  return pt(`${PP}.messages.${code}`, undefined, locale);
}

/** Arabic copy (matches the backend's `lockReason` text); kept as a legacy export. */
export const POOL_PLAN_ELIGIBILITY_MESSAGE_AR = Object.freeze({
  PLAN_TOO_LOW: planMessage("PLAN_TOO_LOW", "ar"),
  NO_ACTIVE_PLAN: planMessage("NO_ACTIVE_PLAN", "ar"),
  INTERNAL_PLAN_CONFIGURATION: planMessage("INTERNAL_PLAN_CONFIGURATION", "ar"),
});

/** Legacy internal server copy (matched, never displayed). */
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

/**
 * Short label on the card badge.
 * @param {string} [locale] Arabic unless given; follows German / Dutch / Romanian UIs.
 */
export function poolOrderPlanLockBadgeText(locale = localeFromEnFlag(false)) {
  return pt(`${PP}.lockBadge`, undefined, locale);
}

/**
 * User-facing helper for why take/bid is disabled.
 * Prefer API reasonCode; never show legacy internal “plan needs correction” copy.
 * @param {unknown} order
 * @param {string} [locale] Arabic unless given; follows German / Dutch / Romanian UIs.
 */
export function poolOrderPlanLockUserMessage(order, locale = localeFromEnFlag(false)) {
  const pe = getPoolOrderPlanEligibility(order);
  const code = String(pe.reasonCode || "").trim();
  if (code && POOL_PLAN_ELIGIBILITY_MESSAGE_AR[code]) {
    return planMessage(code, locale);
  }
  if (pe.planConfigurationError === true) {
    return planMessage("INTERNAL_PLAN_CONFIGURATION", locale);
  }
  const raw = String(pe.lockReason || "").trim();
  if (raw && LEGACY_PLAN_CORRECTION_RE.test(raw)) {
    return planMessage("INTERNAL_PLAN_CONFIGURATION", locale);
  }
  if (raw) {
    // The API's lockReason is the Arabic copy of a reason code: show it in the UI locale.
    const known = Object.keys(POOL_PLAN_ELIGIBILITY_MESSAGE_AR).find((k) => POOL_PLAN_ELIGIBILITY_MESSAGE_AR[k] === raw);
    return known ? planMessage(known, locale) : raw;
  }
  if (pe.isLockedByPlan) return planMessage("PLAN_TOO_LOW", locale);
  return poolOrderPlanLockBadgeText(locale);
}

/** Tooltip/title for locked plan actions. */
export function poolOrderPlanLockTooltip(order, locale) {
  return poolOrderPlanLockUserMessage(order, locale);
}

export function poolOrderPlanLockMessage(order, locale) {
  return poolOrderPlanLockUserMessage(order, locale);
}

export function poolOrderActionDisabledByPlan(order) {
  const pe = getPoolOrderPlanEligibility(order);
  if (pe.isLockedByPlan) return true;
  return false;
}
