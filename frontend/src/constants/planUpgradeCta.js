/**
 * Phase A10 — Plan upgrade CTA helpers (frontend).
 * Only for plan/tier/value locks — not verification, Bids, Bildazo, training, or campaign pauses.
 */

export const PLAN_UPGRADE_DEFAULT_ROUTE = "/dashboard/freelancer/plans";

const PLAN_LOCK_REASONS = new Set([
  "ARTICLE_ACCESS_LEVEL_INSUFFICIENT",
  "ARTICLE_NO_USABLE_MEMBERSHIP",
  "plan_locked",
  "PLAN_LOCKED",
  "isLockedByPlan",
]);

/** Reasons that must NOT show upgrade CTA. */
const NON_PLAN_BLOCK_REASONS = new Set([
  "INSUFFICIENT_BID_CREDITS",
  "ARTICLE_BID_ECONOMY_DISABLED",
  "ARTICLE_APPLICATIONS_ENGINE_OFF",
  "ARTICLE_BID_COLLECTION_THRESHOLD_REACHED",
  "ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET",
  "ARTICLE_BID_COLLECTION_DEADLINE_PASSED",
  "BILDAZO_AUTHOR_LINK_REQUIRED",
  "EMAIL_NOT_VERIFIED",
  "COMPANY_APPROVAL_REQUIRED",
  "TRAINING_REQUIRED",
  "CAMPAIGN_PAUSED",
  "ACTIVATION_CAMPAIGN_PAUSED",
  "ACTIVATION_ENGINE_GATED",
]);

export function isPlanUpgradeReason(reason) {
  if (reason == null || reason === "") return false;
  const code = String(reason);
  if (NON_PLAN_BLOCK_REASONS.has(code)) return false;
  if (PLAN_LOCK_REASONS.has(code)) return true;
  return false;
}

/**
 * Map Mini Article level → minimum marketplace tier label.
 * article_level 1 = starter, 2 = silver, 3 = pro, 4+ = elite.
 */
export function requiredTierCodeForArticleLevel(articleLevel) {
  const level = Number(articleLevel);
  if (!Number.isFinite(level) || level <= 1) return "silver";
  if (level === 2) return "silver";
  if (level === 3) return "pro";
  return "elite";
}

export function normalizeRequiredTierCode(raw) {
  if (raw == null || raw === "") return null;
  const code = String(raw).trim().toLowerCase();
  if (!code || code === "free" || code === "starter") return null;
  if (code === "silver" || code === "pro" || code === "elite") return code;
  if (code.includes("silver") || code.includes("50")) return "silver";
  if (code.includes("pro") || code.includes("platinum") || code.includes("elite")) {
    return code.includes("elite") ? "elite" : "pro";
  }
  return code;
}

export function formatRequiredTierLabel(tierCode, { isEn = false } = {}) {
  const code = normalizeRequiredTierCode(tierCode);
  if (!code) return null;
  if (code === "silver") return isEn ? "Silver" : "Silver";
  if (code === "pro") return isEn ? "Pro" : "Pro";
  if (code === "elite") return isEn ? "Elite" : "Elite";
  return code;
}

export function buildPlanUpgradeCopy({
  requiredTierCode = null,
  reason = null,
  isEn = false,
} = {}) {
  const tier = normalizeRequiredTierCode(requiredTierCode);
  const tierLabel = formatRequiredTierLabel(tier, { isEn });

  if (isEn) {
    const headline = tierLabel
      ? `This opportunity requires a ${tierLabel} plan.`
      : "This opportunity needs a higher plan.";
    const action = "Upgrade your plan to unlock this order.";
    const button = "View plans";
    return { headline, action, button, requiredTierCode: tier };
  }

  const headline = tierLabel
    ? `هذا الطلب يحتاج خطة ${tierLabel}.`
    : "هذا الطلب يحتاج خطة أعلى.";
  const action = "رقِّ خطتك للحصول على هذا الطلب.";
  const button = "عرض الخطط";
  return { headline, action, button, requiredTierCode: tier };
}

/**
 * Should the upgrade CTA render for this article eligibility payload?
 */
export function shouldShowArticlePlanUpgradeCta(eligibility) {
  if (!eligibility || eligibility.eligible === true) return false;
  return isPlanUpgradeReason(eligibility.reason);
}

/**
 * Resolve CTA props from pool order + API poolEligibility.
 */
export function planUpgradePropsFromPoolOrder(order) {
  const pe = order?.poolEligibility && typeof order.poolEligibility === "object"
    ? order.poolEligibility
    : {};
  if (pe.isLockedByPlan !== true && order?.isLockedByPlan !== true) return null;
  if (pe.planConfigurationError === true) return null;
  return {
    requiredTierCode:
      pe.requiredTierCode
      || order?.requiredTierCode
      || null,
    reason: "plan_locked",
    suggestedUpgradePlanTitle:
      pe.suggestedUpgradePlanTitle
      || order?.suggestedUpgradePlanTitle
      || null,
  };
}
