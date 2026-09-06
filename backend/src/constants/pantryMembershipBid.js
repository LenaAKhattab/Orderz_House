/**
 * بيت المونة × Marketplace Membership + Bid Credit integration constants.
 * Does not replace team-owned pantry workflow. Work Tokens are not used.
 */

const STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL = 1;

const PANTRY_BID_REFUND_RESTORES_DAILY_CAP = false;

const PANTRY_DEFAULT_APPLICATION_BID_COST = 1;

/** Explicit feature flag default. Schema apply never activates runtime. */
const PANTRY_MEMBERSHIP_BID_INTEGRATION_DEFAULT = false;

const PANTRY_INTEGRATION_MODES = Object.freeze({
  LEGACY: "legacy",
  INTEGRATED: "integrated",
  PAUSED: "paused",
});

const PANTRY_PAUSED_PUBLIC_MESSAGE =
  "التقديم على طلبات بيت المونة متوقف مؤقتًا. يرجى المحاولة لاحقًا.";

const PANTRY_VALID_APPLICATION_STATUSES = Object.freeze(["pending", "accepted"]);

const PANTRY_CLOSE_REASONS = Object.freeze([
  "target_reached",
  "deadline_reached",
  "manual",
  "assigned",
]);

/** Team-owned Pantry outcomes mapped onto unified Bid refund (full = 100%, never 70%). */
const PANTRY_REFUND_POLICY = Object.freeze({
  system_cancel: "full",
  cancelled_before_assignment: "full",
  no_freelancer_selected: "full",
  deadline_system_failure: "full",
  minimum_not_met: "full",
  freelancer_withdrawal: "none",
  rejected_application: "none",
  losing_applicant: "none",
  post_assignment_cancellation: "none",
});

const PANTRY_MEMBERSHIP_BID_ERROR_CODES = Object.freeze({
  PANTRY_MEMBERSHIP_REQUIRED: "PANTRY_MEMBERSHIP_REQUIRED",
  PANTRY_VERIFICATION_REQUIRED: "PANTRY_VERIFICATION_REQUIRED",
  PANTRY_PLAN_NOT_ELIGIBLE: "PANTRY_PLAN_NOT_ELIGIBLE",
  PANTRY_PROJECT_VALUE_BLOCKED: "PANTRY_PROJECT_VALUE_BLOCKED",
  PANTRY_APPLICATIONS_CLOSED: "PANTRY_APPLICATIONS_CLOSED",
  PANTRY_APPLICATION_DEADLINE_PASSED: "PANTRY_APPLICATION_DEADLINE_PASSED",
  PANTRY_APPLICANT_TARGET_REACHED: "PANTRY_APPLICANT_TARGET_REACHED",
  PANTRY_INSUFFICIENT_BIDS: "PANTRY_INSUFFICIENT_BIDS",
  PANTRY_DAILY_BID_LIMIT: "PANTRY_DAILY_BID_LIMIT",
  PANTRY_STARTER_OPPORTUNITY_USED: "PANTRY_STARTER_OPPORTUNITY_USED",
  PANTRY_STARTER_UNVERIFIED: "PANTRY_STARTER_UNVERIFIED",
  PANTRY_SCHEMA_NOT_READY: "PANTRY_SCHEMA_NOT_READY",
  PANTRY_INTEGRATION_RUNTIME_NOT_READY: "PANTRY_INTEGRATION_RUNTIME_NOT_READY",
  PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE: "PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE",
});

const PANTRY_APPLY_BLOCK_MESSAGES = Object.freeze({
  PANTRY_PLAN_NOT_ELIGIBLE: "هذه الفرصة غير متاحة لباقتك الحالية.",
  PANTRY_PROJECT_VALUE_BLOCKED: "هذه الفرصة غير متاحة لباقتك الحالية.",
  PANTRY_MEMBERSHIP_REQUIRED: "يلزم تفعيل باقة السوق للتقديم على بيت المونة.",
  PANTRY_VERIFICATION_REQUIRED: "يلزم إكمال توثيق الحساب قبل التقديم على بيت المونة.",
  PANTRY_STARTER_UNVERIFIED: "يلزم إكمال توثيق الحساب قبل استخدام فرصة بيت المونة الخاصة بباقة STARTER.",
  PANTRY_STARTER_OPPORTUNITY_USED: "لقد استخدمت فرصة بيت المونة الخاصة بباقة STARTER.",
  PANTRY_INSUFFICIENT_BIDS: "تحتاج إلى {n} عرض متاح للتقديم.",
  PANTRY_DAILY_BID_LIMIT: "لقد وصلت إلى الحد اليومي للعروض.",
  PANTRY_APPLICATIONS_CLOSED: "باب التقديم مغلق على هذا الطلب.",
  PANTRY_APPLICATION_DEADLINE_PASSED: "انتهى موعد التقديم على هذا الطلب.",
  PANTRY_APPLICANT_TARGET_REACHED: "اكتمل عدد المتقدمين على هذا الطلب.",
  PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE: PANTRY_PAUSED_PUBLIC_MESSAGE,
  PANTRY_INTEGRATION_RUNTIME_NOT_READY: PANTRY_PAUSED_PUBLIC_MESSAGE,
});

function pantryApplyBlockMessage(code, meta = {}) {
  const template = PANTRY_APPLY_BLOCK_MESSAGES[code] || "لا يمكنك التقديم على هذا الطلب حالياً.";
  if (code === "PANTRY_INSUFFICIENT_BIDS") {
    const n = Number(meta.required) > 0 ? Number(meta.required) : 1;
    return template.replace("{n}", String(n));
  }
  return template;
}

function resolvePantryRefundMode(outcomeKey) {
  const mode = PANTRY_REFUND_POLICY[outcomeKey];
  return mode === "full" ? "full" : "none";
}

function resolvePantryApplicationBidCost(requestRow) {
  const n = Number(requestRow?.application_bid_cost ?? requestRow?.applicationBidCost);
  if (Number.isInteger(n) && n >= 1) return n;
  return PANTRY_DEFAULT_APPLICATION_BID_COST;
}

function resolvePantryProjectValue(requestRow) {
  if (!requestRow) return null;
  if (requestRow.fixed_budget != null || requestRow.fixedBudget != null) {
    const n = Number(requestRow.fixed_budget ?? requestRow.fixedBudget);
    return Number.isFinite(n) ? n : null;
  }
  const min = Number(requestRow.budget_min ?? requestRow.budgetMin);
  const max = Number(requestRow.budget_max ?? requestRow.budgetMax);
  if (Number.isFinite(max) && max > 0) return max;
  if (Number.isFinite(min) && min > 0) return min;
  return null;
}

/**
 * Canonical Pantry Membership+Bid runtime (pure).
 * Schema/table/column presence is NOT an input and must never activate runtime.
 *
 * LEGACY:     flag OFF (Bid engine may be on or off)
 * INTEGRATED: flag ON AND Bid engine ON AND runtimeReady
 * PAUSED:     flag ON but Bid engine OFF, or required deps unhealthy.
 *             Never falls back to legacy apply.
 */
function resolvePantryMembershipBidIntegrationState({
  pantryMembershipBidIntegrationEnabled = false,
  bidCreditsEnabled = false,
  runtimeReady = true,
  settingsReadable = true,
} = {}) {
  const flagEnabled = Boolean(pantryMembershipBidIntegrationEnabled);
  const bidEngineEnabled = Boolean(bidCreditsEnabled);
  const depsHealthy = runtimeReady !== false;

  if (settingsReadable === false) {
    return {
      active: false,
      paused: true,
      mode: PANTRY_INTEGRATION_MODES.PAUSED,
      flagEnabled,
      bidEngineEnabled,
      runtimeReady: false,
      settingsReadable: false,
    };
  }

  if (!flagEnabled) {
    return {
      active: false,
      paused: false,
      mode: PANTRY_INTEGRATION_MODES.LEGACY,
      flagEnabled: false,
      bidEngineEnabled,
      runtimeReady: depsHealthy,
      settingsReadable: true,
    };
  }

  if (bidEngineEnabled && depsHealthy) {
    return {
      active: true,
      paused: false,
      mode: PANTRY_INTEGRATION_MODES.INTEGRATED,
      flagEnabled: true,
      bidEngineEnabled: true,
      runtimeReady: true,
      settingsReadable: true,
    };
  }

  return {
    active: false,
    paused: true,
    mode: PANTRY_INTEGRATION_MODES.PAUSED,
    flagEnabled: true,
    bidEngineEnabled,
    runtimeReady: depsHealthy,
    settingsReadable: true,
  };
}

function isPantryMembershipBidIntegrationActive(input) {
  return resolvePantryMembershipBidIntegrationState(input).active;
}

function pantryIntegrationApiFields(state) {
  const mode = state?.mode || PANTRY_INTEGRATION_MODES.LEGACY;
  return {
    pantryMembershipBidIntegrationActive: mode === PANTRY_INTEGRATION_MODES.INTEGRATED,
    pantryMembershipBidIntegrationMode: mode,
  };
}

module.exports = {
  STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL,
  PANTRY_BID_REFUND_RESTORES_DAILY_CAP,
  PANTRY_DEFAULT_APPLICATION_BID_COST,
  PANTRY_MEMBERSHIP_BID_INTEGRATION_DEFAULT,
  PANTRY_INTEGRATION_MODES,
  PANTRY_PAUSED_PUBLIC_MESSAGE,
  PANTRY_VALID_APPLICATION_STATUSES,
  PANTRY_CLOSE_REASONS,
  PANTRY_REFUND_POLICY,
  PANTRY_MEMBERSHIP_BID_ERROR_CODES,
  PANTRY_APPLY_BLOCK_MESSAGES,
  pantryApplyBlockMessage,
  resolvePantryRefundMode,
  resolvePantryApplicationBidCost,
  resolvePantryProjectValue,
  resolvePantryMembershipBidIntegrationState,
  isPantryMembershipBidIntegrationActive,
  pantryIntegrationApiFields,
};
