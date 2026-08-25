/**
 * Marketplace Membership domain constants (Phase 3 / 3.1).
 */

const MEMBERSHIP_STATUSES = Object.freeze([
  "pending",
  "payment_pending",
  "purchased_pending_start",
  "active",
  "cancel_at_period_end",
  "suspended",
  "expired",
  "cancelled",
  "superseded",
]);

/** Statuses allowed when is_current = TRUE (DB CHECK + service). */
const CURRENT_ALLOWED_MEMBERSHIP_STATUSES = Object.freeze([
  "pending",
  "payment_pending",
  "purchased_pending_start",
  "active",
  "cancel_at_period_end",
  "suspended",
]);

/**
 * Statuses that may consume Priority Bid uses / cycle benefits.
 * Suspended remains current but cannot consume.
 * purchased_pending_start is entitled but term/benefits unlock on first real order (M4).
 */
const BENEFIT_USABLE_MEMBERSHIP_STATUSES = Object.freeze(["active", "cancel_at_period_end"]);

/** Statuses whose calendar cycles are still reconciled while current. */
const RECONCILE_MEMBERSHIP_STATUSES = Object.freeze([
  "active",
  "cancel_at_period_end",
  "suspended",
]);

/** Terminal historical statuses — must never be is_current. */
const TERMINAL_MEMBERSHIP_STATUSES = Object.freeze(["expired", "cancelled", "superseded"]);

const MEMBERSHIP_SOURCES = Object.freeze(["system", "admin", "stripe", "cash", "manual"]);

const CYCLE_STATUSES = Object.freeze(["upcoming", "active", "closed"]);

const USAGE_EVENT_TYPES = Object.freeze(["consumed", "returned", "admin_adjustment"]);

const MEMBERSHIP_AUDIT_ACTIONS = Object.freeze({
  MEMBERSHIP_CREATED: "MEMBERSHIP_CREATED",
  MEMBERSHIP_ACTIVATED: "MEMBERSHIP_ACTIVATED",
  MEMBERSHIP_PURCHASED_PENDING_START: "MEMBERSHIP_PURCHASED_PENDING_START",
  MEMBERSHIP_TERM_STARTED_ON_FIRST_ORDER: "MEMBERSHIP_TERM_STARTED_ON_FIRST_ORDER",
  MEMBERSHIP_SUPERSEDED: "MEMBERSHIP_SUPERSEDED",
  MEMBERSHIP_CANCEL_AT_PERIOD_END: "MEMBERSHIP_CANCEL_AT_PERIOD_END",
  MEMBERSHIP_CANCELLED: "MEMBERSHIP_CANCELLED",
  MEMBERSHIP_SUSPENDED: "MEMBERSHIP_SUSPENDED",
  MEMBERSHIP_RESUMED: "MEMBERSHIP_RESUMED",
  MEMBERSHIP_EXPIRED: "MEMBERSHIP_EXPIRED",
  CYCLE_CREATED: "CYCLE_CREATED",
  CYCLE_ACTIVATED: "CYCLE_ACTIVATED",
  CYCLE_CLOSED: "CYCLE_CLOSED",
  PRIORITY_USE_CONSUMED: "PRIORITY_USE_CONSUMED",
  PRIORITY_USE_RETURNED: "PRIORITY_USE_RETURNED",
});

/** @deprecated use BENEFIT_USABLE_MEMBERSHIP_STATUSES */
const CURRENT_USABLE_MEMBERSHIP_STATUSES = BENEFIT_USABLE_MEMBERSHIP_STATUSES;

function isCurrentAllowedStatus(status) {
  return CURRENT_ALLOWED_MEMBERSHIP_STATUSES.includes(String(status || ""));
}

function isBenefitUsableStatus(status) {
  return BENEFIT_USABLE_MEMBERSHIP_STATUSES.includes(String(status || ""));
}

function isReconcileStatus(status) {
  return RECONCILE_MEMBERSHIP_STATUSES.includes(String(status || ""));
}

function isTerminalStatus(status) {
  return TERMINAL_MEMBERSHIP_STATUSES.includes(String(status || ""));
}

/**
 * DB/service invariant helper (pure).
 * @returns {{ ok: boolean, reason?: string }}
 */
function assertMembershipCurrentStatusConsistency({ status, isCurrent }) {
  const s = String(status || "");
  const current = Boolean(isCurrent);
  if (current && !isCurrentAllowedStatus(s)) {
    return { ok: false, reason: "current_requires_allowed_status" };
  }
  if (!current && isTerminalStatus(s)) {
    return { ok: true };
  }
  if (current && isTerminalStatus(s)) {
    return { ok: false, reason: "terminal_cannot_be_current" };
  }
  return { ok: true };
}

module.exports = {
  MEMBERSHIP_STATUSES,
  CURRENT_ALLOWED_MEMBERSHIP_STATUSES,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
  RECONCILE_MEMBERSHIP_STATUSES,
  TERMINAL_MEMBERSHIP_STATUSES,
  MEMBERSHIP_SOURCES,
  CYCLE_STATUSES,
  USAGE_EVENT_TYPES,
  MEMBERSHIP_AUDIT_ACTIONS,
  CURRENT_USABLE_MEMBERSHIP_STATUSES,
  isCurrentAllowedStatus,
  isBenefitUsableStatus,
  isReconcileStatus,
  isTerminalStatus,
  assertMembershipCurrentStatusConsistency,
};
