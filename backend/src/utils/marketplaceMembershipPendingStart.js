/**
 * Marketplace-M1 — purchased_pending_start helpers (pure).
 * Term clock starts on first real order assignment/acceptance — not at payment.
 */

const {
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
} = require("../constants/marketplaceMemberships");

const PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES = Object.freeze(["silver", "pro", "elite"]);

const PURCHASED_PENDING_START_MESSAGE_AR =
  "تم شراء العضوية بنجاح. لن تبدأ مدة الاشتراك إلا عند استلامك أول طلب. قبل التقديم على الطلبات، يرجى إكمال توثيق الهوية والتدريب.";

/** Stripe/self-checkout paid term start policy (admin path remains COMPANY_APPROVAL_TIME). */
const PAID_MEMBERSHIP_STRIPE_PERIOD_START = "FIRST_REAL_ORDER";

const REAL_ORDER_SOURCE_TYPES = Object.freeze([
  "admin_created",
  "super_admin_created",
  "client_created",
]);

function isPaidMarketplaceMembershipTier(tierCode) {
  return PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES.includes(String(tierCode || "").trim().toLowerCase());
}

function isPurchasedPendingStartStatus(status) {
  return String(status || "") === "purchased_pending_start";
}

/**
 * Membership statuses that may entitle a freelancer to apply (once KYC/training pass).
 * Includes purchased_pending_start so first real order can be obtained before the clock starts.
 * Does NOT unlock Priority Bid / cycle benefit consumption by itself (see isBenefitUsableStatus).
 */
function isApplicationEligibleStatus(status) {
  const s = String(status || "");
  if (BENEFIT_USABLE_MEMBERSHIP_STATUSES.includes(s)) return true;
  return s === "purchased_pending_start";
}

/**
 * @param {{ startsAt: Date|string, durationDays: number }} input
 * @returns {{ paidTermStartsAt: Date, paidTermEndsAt: Date }}
 */
function computePaidTermWindowFromDurationDays({ startsAt, durationDays }) {
  const start = startsAt instanceof Date ? new Date(startsAt.getTime()) : new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid startsAt");
  }
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("durationDays must be an integer >= 1");
  }
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { paidTermStartsAt: start, paidTermEndsAt: end };
}

/**
 * Real marketplace orders live in `orders` (fake/training use `fake_orders`).
 * Caller must load from `orders` only; this rejects training markers if present.
 *
 * @param {object|null} orderRow
 * @returns {boolean}
 */
function isRealOrderForMarketplaceMembershipStart(orderRow) {
  if (!orderRow || orderRow.id == null) return false;
  if (orderRow.is_fake_or_training === true || orderRow.is_fake === true) return false;
  if (orderRow.is_training === true || orderRow.is_simulation === true) return false;
  const source = String(orderRow.source_type || "").trim();
  if (source && !REAL_ORDER_SOURCE_TYPES.includes(source)) return false;
  return true;
}

/**
 * Pure decision for start-on-first-order (idempotent).
 * @returns {'start'|'noop_already_active'|'skip_wrong_status'|'reject_non_real'|'reject_missing_order'}
 */
function decideMarketplaceMembershipFirstOrderStart({
  membershipStatus,
  paidTermStartsAt = null,
  firstOrderStartedAt = null,
  orderRow = null,
}) {
  const status = String(membershipStatus || "");
  if (status === "active" && (paidTermStartsAt || firstOrderStartedAt)) {
    return "noop_already_active";
  }
  if (status === "expired" || status === "cancelled" || status === "superseded") {
    return "skip_wrong_status";
  }
  if (status !== "purchased_pending_start") {
    return "skip_wrong_status";
  }
  if (!orderRow) return "reject_missing_order";
  if (!isRealOrderForMarketplaceMembershipStart(orderRow)) return "reject_non_real";
  return "start";
}

module.exports = {
  PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES,
  PURCHASED_PENDING_START_MESSAGE_AR,
  PAID_MEMBERSHIP_STRIPE_PERIOD_START,
  REAL_ORDER_SOURCE_TYPES,
  isPaidMarketplaceMembershipTier,
  isPurchasedPendingStartStatus,
  isApplicationEligibleStatus,
  computePaidTermWindowFromDurationDays,
  isRealOrderForMarketplaceMembershipStart,
  decideMarketplaceMembershipFirstOrderStart,
};
