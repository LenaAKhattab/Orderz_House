/**
 * Marketplace-M2 — paid membership Stripe Checkout constants.
 * One-time payment. Membership grant is M3 webhook only.
 */

const MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE = "marketplace_membership_checkout";
const MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY = "JOD";
const MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW = "marketplace_membership";
const MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE = "payment";

/** Success URL must never grant membership (webhook / M3 only). */
const MEMBERSHIP_CHECKOUT_SUCCESS_PAGE_CAN_GRANT = "NO";

const MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES = Object.freeze({
  INVALID_PLAN_CODE: "MARKETPLACE_MEMBERSHIP_CHECKOUT_INVALID_PLAN",
  STARTER_NOT_STRIPE: "MARKETPLACE_MEMBERSHIP_CHECKOUT_STARTER_NOT_STRIPE",
  PLAN_NOT_FOUND: "MARKETPLACE_MEMBERSHIP_CHECKOUT_PLAN_NOT_FOUND",
  PLAN_INACTIVE: "MARKETPLACE_MEMBERSHIP_CHECKOUT_PLAN_INACTIVE",
  PLAN_NOT_PAID: "MARKETPLACE_MEMBERSHIP_CHECKOUT_PLAN_NOT_PAID",
  INVALID_PRICE: "MARKETPLACE_MEMBERSHIP_CHECKOUT_INVALID_PRICE",
  INVALID_DURATION: "MARKETPLACE_MEMBERSHIP_CHECKOUT_INVALID_DURATION",
  FREELANCER_INVALID: "MARKETPLACE_MEMBERSHIP_CHECKOUT_FREELANCER_INVALID",
  STRIPE_NOT_CONFIGURED: "STRIPE_NOT_CONFIGURED",
});

function normalizeMarketplaceCheckoutPlanCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * Stripe idempotency key for one canonical checkout attempt (marketplace_membership_checkout_attempts.id):
 * a retried request for the same attempt reuses the key; a new attempt (after expiry) gets a new one.
 * No user data in the key.
 */
function buildMarketplaceMembershipCheckoutIdempotencyKey(checkoutAttemptId) {
  return `marketplace_membership_checkout:attempt:${Number(checkoutAttemptId)}`;
}

module.exports = {
  MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE,
  MEMBERSHIP_CHECKOUT_SUCCESS_PAGE_CAN_GRANT,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES,
  normalizeMarketplaceCheckoutPlanCode,
  buildMarketplaceMembershipCheckoutIdempotencyKey,
};
