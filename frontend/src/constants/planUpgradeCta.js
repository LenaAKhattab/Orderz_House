/**
 * Phase A10 — Plan upgrade CTA helpers (frontend).
 * Only for plan/tier/value locks — not verification, Bids, Bildazo, training, or campaign pauses.
 */

export const PLAN_UPGRADE_DEFAULT_ROUTE = "/dashboard/freelancer/plans";

const PLAN_LOCK_REASONS = new Set([
  "ARTICLE_ACCESS_LEVEL_INSUFFICIENT",
  "ARTICLE_NO_USABLE_MEMBERSHIP",
  "COURSE_PLAN_UPGRADE_REQUIRED",
  "plan_locked",
  "PLAN_LOCKED",
  "isLockedByPlan",
  "PLAN_TOO_LOW",
  "NO_ACTIVE_PLAN",
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
  "INTERNAL_PLAN_CONFIGURATION",
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

export function formatCourseRequiredTierHelper(tierCode, { isEn = false } = {}) {
  const code = normalizeRequiredTierCode(tierCode);
  if (!code) return null;
  if (code === "silver") {
    return isEn ? "Available from Silver plan and above" : "متاحة من باقة فضة فما فوق";
  }
  if (code === "pro") {
    return isEn ? "Available from Pro plan and above" : "متاحة من باقة برو فما فوق";
  }
  if (code === "elite") {
    return isEn ? "Available on Elite plan" : "متاحة من باقة إيليت";
  }
  return null;
}

function normalizeReasonCode(reason) {
  return String(reason || "").trim().toUpperCase();
}

/**
 * Compact + standard microcopy for plan locks.
 * @returns {{ headline: string, action: string|null, button: string|null, requiredTierCode: string|null, mode: "upgrade"|"support" }}
 */
export function buildPlanUpgradeCopy({
  requiredTierCode = null,
  reason = null,
  isEn = false,
} = {}) {
  const code = normalizeReasonCode(reason);
  const tier = normalizeRequiredTierCode(requiredTierCode);

  if (code === "INTERNAL_PLAN_CONFIGURATION") {
    return {
      headline: isEn
        ? "We couldn't verify your plan eligibility right now. Please contact support."
        : "تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.",
      action: null,
      button: null,
      requiredTierCode: null,
      mode: "support",
    };
  }

  if (code === "NO_ACTIVE_PLAN") {
    return {
      headline: isEn
        ? "Activate your plan to receive orders"
        : "فعّل باقتك لاستلام الطلبات",
      action: null,
      button: isEn ? "View plans" : "عرض الباقات",
      requiredTierCode: null,
      mode: "upgrade",
    };
  }

  if (code === "COURSE_PLAN_UPGRADE_REQUIRED") {
    const tierHelper = formatCourseRequiredTierHelper(requiredTierCode, { isEn });
    return {
      headline: isEn
        ? "This course is available on higher plans"
        : "هذه الدورة متاحة لباقات أعلى",
      subline: tierHelper,
      action: null,
      button: isEn ? "Upgrade plan" : "ترقية الباقة",
      requiredTierCode: tier,
      mode: "upgrade",
    };
  }

  // PLAN_TOO_LOW and generic plan locks
  return {
    headline: isEn
      ? "This order's value exceeds your current plan limit"
      : "قيمة هذا الطلب أعلى من حد باقتك الحالية",
    action: null,
    button: isEn ? "Upgrade plan" : "ترقية الباقة",
    requiredTierCode: tier,
    mode: "upgrade",
  };
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
 * - PLAN_TOO_LOW / generic: upgrade CTA
 * - NO_ACTIVE_PLAN: activate/view plans CTA
 * - INTERNAL_PLAN_CONFIGURATION: support message only (no upgrade button)
 */
export function planUpgradePropsFromPoolOrder(order) {
  const pe = order?.poolEligibility && typeof order.poolEligibility === "object"
    ? order.poolEligibility
    : {};
  if (pe.isLockedByPlan !== true && order?.isLockedByPlan !== true) return null;

  if (pe.planConfigurationError === true || pe.reasonCode === "INTERNAL_PLAN_CONFIGURATION") {
    return {
      reason: "INTERNAL_PLAN_CONFIGURATION",
      mode: "support",
    };
  }

  if (pe.reasonCode === "NO_ACTIVE_PLAN") {
    return {
      reason: "NO_ACTIVE_PLAN",
      mode: "upgrade",
    };
  }

  return {
    requiredTierCode:
      pe.requiredTierCode
      || order?.requiredTierCode
      || null,
    reason: pe.reasonCode || "PLAN_TOO_LOW",
    mode: "upgrade",
    suggestedUpgradePlanTitle:
      pe.suggestedUpgradePlanTitle
      || order?.suggestedUpgradePlanTitle
      || null,
  };
}
