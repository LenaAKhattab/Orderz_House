/**
 * FAZAAT platform source tracking for Stripe Checkout / PaymentIntent metadata.
 * All values must be strings; omit null/undefined/empty/object/array fields.
 */

const FAZAAT_PLATFORM = "FAZAAT";
const FAZAAT_PROJECT = "Orderz House";
const FAZAAT_WEBSITE = "orderzhouse.com";

const PAYMENT_CONTEXT = {
  CLIENT_FIXED_ORDER: "client_fixed_order",
  CLIENT_SELECTED_BID: "client_selected_bid",
  FREELANCER_SUBSCRIPTION: "freelancer_subscription",
  ACTIVATION_FEE_ONLY: "activation_fee_only",
  ACTIVATION_FEE_BUNDLED: "activation_fee_bundled",
  BID_CREDIT_PACKAGE: "bid_credit_package",
  MARKETPLACE_MEMBERSHIP: "marketplace_membership",
};

const PAYMENT_INTENT_DESCRIPTION = {
  [PAYMENT_CONTEXT.CLIENT_FIXED_ORDER]: "FAZAAT - Orderz House - Client Order Payment",
  [PAYMENT_CONTEXT.CLIENT_SELECTED_BID]: "FAZAAT - Orderz House - Client Bid Payment",
  [PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION]: "FAZAAT - Orderz House - Freelancer Subscription",
  [PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY]: "FAZAAT - Orderz House - Activation Fee",
  [PAYMENT_CONTEXT.BID_CREDIT_PACKAGE]: "FAZAAT - Orderz House - Bid Credit Package",
  [PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP]: "FAZAAT - Orderz House - Marketplace Membership",
};

const LINE_ITEM_PRODUCT_NAME = {
  [PAYMENT_CONTEXT.CLIENT_FIXED_ORDER]: "FAZAAT - Orderz House - Client Order Payment",
  [PAYMENT_CONTEXT.CLIENT_SELECTED_BID]: "FAZAAT - Orderz House - Client Bid Payment",
  [PAYMENT_CONTEXT.FREELANCER_SUBSCRIPTION]: "FAZAAT - Orderz House - Freelancer Subscription",
  [PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY]: "FAZAAT - Orderz House - Activation Fee",
  [PAYMENT_CONTEXT.BID_CREDIT_PACKAGE]: "FAZAAT - Orderz House - Bid Credit Package",
  [PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP]: "FAZAAT - Orderz House - Marketplace Membership",
};

function stringifyMetaValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * @param {object} params
 * @returns {Record<string, string>}
 */
function buildFazaatStripeMetadata({
  paymentContext,
  purpose,
  userId,
  userEmail,
  orderId,
  bidId,
  planId,
  displayPlanId,
  internalPaymentId,
  expectedAmountMinor,
  planAmountMinor,
  activationFeeMinor,
  purchaseId,
  packageId,
  marketplacePlanId,
  planCode,
  durationDays,
  flow,
  currency = "JOD",
}) {
  const raw = {
    platform: FAZAAT_PLATFORM,
    project: FAZAAT_PROJECT,
    website: FAZAAT_WEBSITE,
    payment_context: paymentContext,
    purpose,
    user_id: userId,
    user_email: userEmail,
    order_id: orderId,
    bid_id: bidId,
    plan_id: planId,
    display_plan_id: displayPlanId,
    internal_payment_id: internalPaymentId,
    expected_amount_minor: expectedAmountMinor,
    plan_amount_minor: planAmountMinor,
    activation_fee_minor: activationFeeMinor,
    purchase_id: purchaseId,
    package_id: packageId,
    marketplace_plan_id: marketplacePlanId,
    plan_code: planCode,
    duration_days: durationDays,
    flow,
    currency: currency != null ? String(currency).toUpperCase() : "JOD",
  };

  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, stringifyMetaValue(value)])
      .filter(([, value]) => value != null),
  );
}

/**
 * Merge FAZAAT tracking metadata with legacy camelCase keys required by webhooks.
 * @param {Record<string, string>} fazaatMetadata
 * @param {Record<string, unknown>} legacyMetadata
 * @returns {Record<string, string>}
 */
function mergeStripeCheckoutMetadata(fazaatMetadata, legacyMetadata = {}) {
  const merged = { ...legacyMetadata, ...fazaatMetadata };
  return Object.fromEntries(
    Object.entries(merged)
      .map(([key, value]) => [key, stringifyMetaValue(value)])
      .filter(([, value]) => value != null),
  );
}

function paymentIntentDescriptionForContext(paymentContext) {
  return PAYMENT_INTENT_DESCRIPTION[paymentContext] || null;
}

function lineItemProductNameForContext(paymentContext) {
  return LINE_ITEM_PRODUCT_NAME[paymentContext] || null;
}

function pickFazaatTrackingLogFields(metadata = {}) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const pick = (snakeKey, camelKey) => stringifyMetaValue(meta[snakeKey] ?? meta[camelKey]);
  return Object.fromEntries(
    Object.entries({
      platform: pick("platform"),
      project: pick("project"),
      payment_context: pick("payment_context"),
      purpose: pick("purpose"),
      order_id: pick("order_id", "orderId"),
      plan_id: pick("plan_id", "planId"),
    }).filter(([, value]) => value != null),
  );
}

module.exports = {
  FAZAAT_PLATFORM,
  FAZAAT_PROJECT,
  FAZAAT_WEBSITE,
  PAYMENT_CONTEXT,
  PAYMENT_INTENT_DESCRIPTION,
  LINE_ITEM_PRODUCT_NAME,
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  paymentIntentDescriptionForContext,
  lineItemProductNameForContext,
  pickFazaatTrackingLogFields,
  stringifyMetaValue,
};
