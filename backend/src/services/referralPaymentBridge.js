const { processReferralCommissionForPayment, reverseReferralCommission } = require("./referralCommissionService");
const { PAYMENT_TYPES } = require("../domain/referralPolicy");

function paymentIntentId(session) {
  const pi = session?.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id || null;
}

async function processCheckoutSession(session, paymentType, result) {
  if (!result || !["applied", "already_applied"].includes(result.status)) return { created: false, reason: "not_applied" };
  const meta = session?.metadata || {};
  const payerUserId = Number(meta.user_id || meta.userId || meta.freelancerUserId || meta.freelancer_user_id);
  const sourceId =
    paymentType === PAYMENT_TYPES.TRAINING_PACKAGE
      ? String(result.purchaseId || meta.purchase_id || meta.purchaseId || "")
      : String(session?.id || "");
  return processReferralCommissionForPayment({
    payerUserId,
    paymentType,
    paymentSourceId: sourceId,
    paidAmountMinor: Number(session?.amount_total),
    discountMinor: Number(meta.referralDiscountMinor || 0),
    listAmountMinor: Number(meta.referralListAmountMinor || 0) || null,
    currency: session?.currency || "jod",
    stripePaymentIntentId: paymentIntentId(session),
    paidAt: new Date().toISOString(),
  });
}

/**
 * charge.refunded → cumulative amount_refunded drives a partial/full commission adjustment.
 * charge.dispute.closed (lost) → full reversal.
 */
async function reverseFromStripeCharge(object, { dispute = false } = {}) {
  const paymentIntent = typeof object?.payment_intent === "string" ? object.payment_intent : object?.payment_intent?.id;
  if (!paymentIntent) return { reversed: [] };
  const refunded = Number(object?.amount_refunded);
  const fullRefund = dispute || object?.refunded === true || !Number.isInteger(refunded);
  return reverseReferralCommission({
    stripePaymentIntentId: paymentIntent,
    refundedAmountMinor: fullRefund ? null : refunded,
    reason: dispute ? "dispute_lost" : "refund",
  });
}

module.exports = {
  processCheckoutSession,
  reverseFromStripeCharge,
};
