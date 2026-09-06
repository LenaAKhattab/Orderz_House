/**
 * Minimum required Bid Credits / مناقصات collection (Phase 1: Mini Bid Article).
 * Pantry and fair auto-assign are out of scope.
 */

const OPPORTUNITY_TYPES = Object.freeze({
  MINI_BID_ARTICLE: "mini_bid_article",
  PANTRY_REQUEST: "pantry_request",
});

const BID_COLLECTION_STATUSES = Object.freeze([
  "collecting",
  "threshold_reached",
  "eligible_for_assignment",
  "assigned",
  "minimum_not_met",
  "cancelled",
  "locked",
]);

const INTAKE_LOCKED_STATUSES = Object.freeze([
  "threshold_reached",
  "eligible_for_assignment",
  "assigned",
  "minimum_not_met",
  "cancelled",
  "locked",
]);

const VALID_APPLICATION_STATUSES_FOR_COUNT = Object.freeze([
  "pending",
  "selected",
  "assigned",
  "writing",
  "submitted",
  "under_review",
  "revision_requested",
  "approved",
]);

const ARTICLE_MIN_REQUIRED_BIDS_DEFAULT = 10;
const ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT = Object.freeze([10, 15, 20, 30]);
const ARTICLE_DEFAULT_REQUIRED_BID_COUNT = 10;
const ARTICLE_REFUND_POLICY_FULL_ON_MINIMUM_NOT_MET = "full_on_minimum_not_met";

const ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR =
  "العدد الذي تحدده يمثل الحد الأدنى المطلوب لإتمام المناقصة. إذا انتهت مدة الطلب دون الوصول إلى هذا العدد، فلن يتم إسناد الطلب لأي Freelancer، وسيتم إرجاع المناقصات المستخدمة للمتقدمين، ثم إعادة الطلب لك وإعادة طرحه مرة أخرى.";

const ARTICLE_MIN_REQUIRED_BIDS_ACK_AR =
  "أقر بأن العدد الذي أحدده يمثل الحد الأدنى المطلوب لإتمام المناقصة. إذا انتهت مدة الطلب دون الوصول إلى هذا العدد، فلن يتم إسناد الطلب لأي Freelancer، وسيتم إرجاع المناقصات المستخدمة للمتقدمين، ثم إعادة طرح الطلب أو إعادته للمراجعة.";

const ARTICLE_THRESHOLD_REACHED_MESSAGE_AR =
  "اكتمل العدد المطلوب لهذه المناقصة ولم يعد التقديم متاحًا.";
const ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR = "اكتمل العدد المطلوب — بانتظار الإسناد";
const ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR = "اكتمل العدد المطلوب ولم يعد التقديم متاحًا";
const ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR = "لم يكتمل الحد الأدنى للمناقصات";
const ARTICLE_DEADLINE_PASSED_MESSAGE_AR = "انتهت مدة جمع المناقصات لهذا المقال.";
const ARTICLE_SELECTION_TOO_EARLY_MESSAGE_AR =
  "لا يمكن اختيار متقدم قبل اكتمال العدد المطلوب من المناقصات.";
const ARTICLE_FAIR_OVERRIDE_REASON_REQUIRED_AR =
  "يرجى توضيح سبب اختيار متقدم غير المرشح الأول حسب التوزيع العادل.";

const THRESHOLD_STATUSES = Object.freeze([
  "threshold_reached",
  "eligible_for_assignment",
  "assigned",
  "locked",
]);

const BID_COLLECTION_ERROR_CODES = Object.freeze({
  ARTICLE_REQUIRED_BID_COUNT_INVALID: "ARTICLE_REQUIRED_BID_COUNT_INVALID",
  ARTICLE_MIN_REQUIRED_BIDS_ACK_REQUIRED: "ARTICLE_MIN_REQUIRED_BIDS_ACK_REQUIRED",
  ARTICLE_BID_COLLECTION_THRESHOLD_REACHED: "ARTICLE_BID_COLLECTION_THRESHOLD_REACHED",
  ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET: "ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET",
  ARTICLE_BID_COLLECTION_DEADLINE_PASSED: "ARTICLE_BID_COLLECTION_DEADLINE_PASSED",
  ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY: "ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY",
  ARTICLE_BID_COLLECTION_SCHEMA_NOT_READY: "ARTICLE_BID_COLLECTION_SCHEMA_NOT_READY",
  ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED: "ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED",
  PANTRY_REQUIRED_BID_COUNT_INVALID: "PANTRY_REQUIRED_BID_COUNT_INVALID",
  PANTRY_MIN_REQUIRED_BIDS_ACK_REQUIRED: "PANTRY_MIN_REQUIRED_BIDS_ACK_REQUIRED",
  PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED: "PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED",
  ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED: "ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED",
  PANTRY_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED: "PANTRY_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED",
});

function parseAllowedRequiredBidCounts(raw) {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1);
      }
    } catch {
      return [...ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT];
    }
  }
  return [...ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT];
}

function resolveArticleBidCollectionSettings(settings = {}) {
  const minRequired = Number(settings.articleMinRequiredBids);
  const allowed = parseAllowedRequiredBidCounts(settings.articleAllowedRequiredBidCounts);
  const defaultCount = Number(settings.articleDefaultRequiredBidCount);
  return {
    minRequiredBids: Number.isInteger(minRequired) && minRequired >= 1 ? minRequired : ARTICLE_MIN_REQUIRED_BIDS_DEFAULT,
    allowedRequiredBidCounts:
      allowed.length > 0 ? allowed : [...ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT],
    defaultRequiredBidCount:
      Number.isInteger(defaultCount) && defaultCount >= 1
        ? defaultCount
        : ARTICLE_DEFAULT_REQUIRED_BID_COUNT,
    autoCloseWhenThresholdReached: settings.articleAutoCloseWhenThresholdReached !== false,
    autoAssignWhenThresholdReached: settings.articleAutoAssignWhenThresholdReached === true,
    refundPolicy:
      settings.articleRefundPolicy || ARTICLE_REFUND_POLICY_FULL_ON_MINIMUM_NOT_MET,
  };
}

function resolvePantryBidCollectionSettings(settings = {}) {
  const minRequired = Number(settings.pantryMinRequiredBids);
  const allowed = parseAllowedRequiredBidCounts(settings.pantryAllowedRequiredBidCounts);
  const defaultCount = Number(settings.pantryDefaultRequiredBidCount);
  return {
    minRequiredBids: Number.isInteger(minRequired) && minRequired >= 1 ? minRequired : ARTICLE_MIN_REQUIRED_BIDS_DEFAULT,
    allowedRequiredBidCounts:
      allowed.length > 0 ? allowed : [...ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT],
    defaultRequiredBidCount:
      Number.isInteger(defaultCount) && defaultCount >= 1
        ? defaultCount
        : ARTICLE_DEFAULT_REQUIRED_BID_COUNT,
    autoCloseWhenThresholdReached: settings.pantryAutoCloseWhenThresholdReached !== false,
    autoAssignWhenThresholdReached: settings.pantryAutoAssignWhenThresholdReached === true,
    refundPolicy:
      settings.pantryRefundPolicy || ARTICLE_REFUND_POLICY_FULL_ON_MINIMUM_NOT_MET,
  };
}

function assertRequiredBidCount(value, settings = {}) {
  const cfg = resolveArticleBidCollectionSettings(settings);
  const n = Number(value);
  if (!Number.isInteger(n)) {
    const err = new Error("requiredBidCount must be an integer.");
    err.statusCode = 400;
    err.publicCode = BID_COLLECTION_ERROR_CODES.ARTICLE_REQUIRED_BID_COUNT_INVALID;
    err.exposeToClient = true;
    throw err;
  }
  if (n < cfg.minRequiredBids) {
    const err = new Error(
      `requiredBidCount must be at least ${cfg.minRequiredBids}.`,
    );
    err.statusCode = 400;
    err.publicCode = BID_COLLECTION_ERROR_CODES.ARTICLE_REQUIRED_BID_COUNT_INVALID;
    err.exposeToClient = true;
    throw err;
  }
  if (!cfg.allowedRequiredBidCounts.includes(n)) {
    const err = new Error(
      `requiredBidCount must be one of: ${cfg.allowedRequiredBidCounts.join(", ")}.`,
    );
    err.statusCode = 400;
    err.publicCode = BID_COLLECTION_ERROR_CODES.ARTICLE_REQUIRED_BID_COUNT_INVALID;
    err.exposeToClient = true;
    throw err;
  }
  return n;
}

function isTruthyAck(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function formatArticleBidProgressLabel({ current = 0, required = 0 } = {}, { isEn = false } = {}) {
  if (!required) return null;
  if (isEn) return `${current} of ${required} required applicants`;
  return `${current} من ${required} متقدمين مطلوبين`;
}

function isIntakeLockedStatus(status) {
  return INTAKE_LOCKED_STATUSES.includes(String(status || ""));
}

function isThresholdStatus(status) {
  return THRESHOLD_STATUSES.includes(String(status || ""));
}

function resolveArticleBidCollectionLabel(
  { current = 0, required = 0, status = null, outcome = null, articleStatus = null } = {},
  { isEn = false } = {},
) {
  if (!required) return null;
  if (status === "minimum_not_met" || outcome === "minimum_not_met") {
    return isEn ? "Minimum required bids were not met" : ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR;
  }
  if (isThresholdStatus(status) || outcome === "threshold_reached") {
    if (articleStatus === "closed" || articleStatus === "cancelled") {
      return isEn
        ? "Required count reached; applications are closed."
        : ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR;
    }
    return isEn
      ? "Required count reached — awaiting assignment"
      : ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR;
  }
  return formatArticleBidProgressLabel({ current, required }, { isEn });
}

function buildArticleBidCollectionPublicView(raw = {}, { now = new Date() } = {}) {
  const required = Number(raw.required) || 0;
  const current = Number(raw.current) || 0;
  const status = raw.status || null;
  const outcome = raw.outcome || null;
  const deadline = raw.deadline || null;
  const deadlinePassed = Boolean(deadline && new Date(deadline) <= new Date(now));
  const thresholdReached = isThresholdStatus(status) || outcome === "threshold_reached";
  const canApply =
    required > 0
      ? status === "collecting" && !deadlinePassed && !isIntakeLockedStatus(status)
      : status == null || status === "collecting";
  const label = resolveArticleBidCollectionLabel({
    current,
    required,
    status,
    outcome,
    articleStatus: raw.articleStatus || null,
  });
  const minNotMet = status === "minimum_not_met" || outcome === "minimum_not_met";
  const relistCount = Number(raw.relistCount) || 0;
  const currentRoundNumber =
    raw.currentRoundNumber != null && raw.currentRoundNumber !== ""
      ? Number(raw.currentRoundNumber)
      : null;
  return {
    requiredBidCount: required || null,
    currentBidCount: current,
    bidCollectionStatus: status,
    bidCollectionOutcome: outcome,
    canApply,
    canRelistBidCollection: minNotMet,
    relistCount,
    currentRoundNumber: Number.isInteger(currentRoundNumber) ? currentRoundNumber : null,
    deadline,
    thresholdReached,
    label,
    required,
    current,
    status,
    outcome,
    schemaReady: raw.schemaReady !== false,
  };
}

module.exports = {
  OPPORTUNITY_TYPES,
  BID_COLLECTION_STATUSES,
  INTAKE_LOCKED_STATUSES,
  THRESHOLD_STATUSES,
  VALID_APPLICATION_STATUSES_FOR_COUNT,
  ARTICLE_MIN_REQUIRED_BIDS_DEFAULT,
  ARTICLE_ALLOWED_REQUIRED_BID_COUNTS_DEFAULT,
  ARTICLE_DEFAULT_REQUIRED_BID_COUNT,
  ARTICLE_REFUND_POLICY_FULL_ON_MINIMUM_NOT_MET,
  ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR,
  ARTICLE_MIN_REQUIRED_BIDS_ACK_AR,
  ARTICLE_THRESHOLD_REACHED_MESSAGE_AR,
  ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR,
  ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR,
  ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
  ARTICLE_DEADLINE_PASSED_MESSAGE_AR,
  ARTICLE_SELECTION_TOO_EARLY_MESSAGE_AR,
  ARTICLE_FAIR_OVERRIDE_REASON_REQUIRED_AR,
  BID_COLLECTION_ERROR_CODES,
  parseAllowedRequiredBidCounts,
  resolveArticleBidCollectionSettings,
  resolvePantryBidCollectionSettings,
  assertRequiredBidCount,
  isTruthyAck,
  formatArticleBidProgressLabel,
  resolveArticleBidCollectionLabel,
  buildArticleBidCollectionPublicView,
  isIntakeLockedStatus,
  isThresholdStatus,
};
