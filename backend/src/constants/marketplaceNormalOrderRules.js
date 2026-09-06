/**
 * Phase E3 — Normal Order Admin-configurable marketplace rules (constants).
 * Bid Credits engine remains OFF until explicitly enabled. Defaults preserve B2 (=1 Bid).
 */

const NORMAL_ORDER_RULES_VERSION = 1;

const NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES = Object.freeze([
  "continue_with_received",
  "cancel_and_refund",
  "require_admin_review",
]);

const NORMAL_ORDER_REFUND_MODES = Object.freeze(["full", "none"]);

const NORMAL_ORDER_APPLICATIONS_CLOSE_REASONS = Object.freeze([
  "target_reached",
  "deadline_reached",
  "cancelled",
  "manual",
  "admin_review",
  "winner_selected",
]);

/** Default Admin limits — must match migration 155. */
const NORMAL_ORDER_RULES_DEFAULTS = Object.freeze({
  minValueJod: 1,
  maxValueJod: 10000,
  minTargetApplicants: 1,
  maxTargetApplicants: 200,
  defaultTargetApplicants: 10,
  minBidCost: 1,
  maxBidCost: 20,
  defaultBidCost: 1,
  minApplicationPeriodHours: 1,
  maxApplicationPeriodHours: 720,
  defaultApplicationPeriodHours: 72,
  minExecutionDurationHours: 1,
  maxExecutionDurationHours: 2160,
  defaultExecutionDurationHours: 72,
  deadlineIncompleteTargetPolicy: "continue_with_received",
  refundClientCancelBeforeSelection: "full",
  refundSystemCancel: "full",
  refundDeadlineNoSelection: "full",
  refundNoFreelancerSelected: "full",
  refundFreelancerWithdrawal: "none",
  refundRejectedApplication: "none",
  refundLosingApplicant: "none",
  refundPostAwardCancel: "none",
  businessTimezone: "Asia/Amman",
});

/** Valid bid statuses counted toward applicant target / capacity. */
const NORMAL_ORDER_VALID_APPLICATION_STATUSES = Object.freeze([
  "pending",
  "selected_pending_payment",
  "accepted",
]);

const NORMAL_ORDER_ERROR_CODES = Object.freeze({
  NORMAL_ORDER_VALUE_OUT_OF_RANGE: "NORMAL_ORDER_VALUE_OUT_OF_RANGE",
  NORMAL_ORDER_TARGET_OUT_OF_RANGE: "NORMAL_ORDER_TARGET_OUT_OF_RANGE",
  NORMAL_ORDER_BID_COST_OUT_OF_RANGE: "NORMAL_ORDER_BID_COST_OUT_OF_RANGE",
  NORMAL_ORDER_APPLICATION_PERIOD_OUT_OF_RANGE: "NORMAL_ORDER_APPLICATION_PERIOD_OUT_OF_RANGE",
  NORMAL_ORDER_EXECUTION_DURATION_OUT_OF_RANGE: "NORMAL_ORDER_EXECUTION_DURATION_OUT_OF_RANGE",
  NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN: "NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN",
  NORMAL_ORDER_APPLICATIONS_CLOSED: "NORMAL_ORDER_APPLICATIONS_CLOSED",
  NORMAL_ORDER_APPLICANT_TARGET_REACHED: "NORMAL_ORDER_APPLICANT_TARGET_REACHED",
  NORMAL_ORDER_APPLICATION_DEADLINE_PASSED: "NORMAL_ORDER_APPLICATION_DEADLINE_PASSED",
  NORMAL_ORDER_SCHEMA_NOT_READY: "NORMAL_ORDER_SCHEMA_NOT_READY",
});

const ORDER_ECONOMIC_LOCK_FIELDS = Object.freeze([
  "application_bid_cost",
  "target_applicant_count",
  "application_deadline_at",
  "budget",
  "bid_budget_min",
  "bid_budget_max",
  "deadline_incomplete_target_policy",
  "duration_value",
  "duration_unit",
]);

/** Admin API keys that must GET → PATCH → GET with identical persisted values. */
const NORMAL_ORDER_ADMIN_API_KEYS = Object.freeze([
  "normalOrderMinValueJod",
  "normalOrderMaxValueJod",
  "normalOrderMinTargetApplicants",
  "normalOrderMaxTargetApplicants",
  "normalOrderDefaultTargetApplicants",
  "normalOrderMinBidCost",
  "normalOrderMaxBidCost",
  "normalOrderDefaultBidCost",
  "normalOrderMinApplicationPeriodHours",
  "normalOrderMaxApplicationPeriodHours",
  "normalOrderDefaultApplicationPeriodHours",
  "normalOrderMinExecutionDurationHours",
  "normalOrderMaxExecutionDurationHours",
  "normalOrderDefaultExecutionDurationHours",
  "normalOrderDeadlineIncompleteTargetPolicy",
  "normalOrderRefundClientCancelBeforeSelection",
  "normalOrderRefundSystemCancel",
  "normalOrderRefundDeadlineNoSelection",
  "normalOrderRefundNoFreelancerSelected",
  "normalOrderRefundFreelancerWithdrawal",
  "normalOrderRefundRejectedApplication",
  "normalOrderRefundLosingApplicant",
  "normalOrderRefundPostAwardCancel",
  "normalOrderBusinessTimezone",
]);

module.exports = {
  NORMAL_ORDER_RULES_VERSION,
  NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES,
  NORMAL_ORDER_REFUND_MODES,
  NORMAL_ORDER_APPLICATIONS_CLOSE_REASONS,
  NORMAL_ORDER_RULES_DEFAULTS,
  NORMAL_ORDER_VALID_APPLICATION_STATUSES,
  NORMAL_ORDER_ERROR_CODES,
  ORDER_ECONOMIC_LOCK_FIELDS,
  NORMAL_ORDER_ADMIN_API_KEYS,
};
