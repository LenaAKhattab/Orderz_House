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
    currency: session?.currency || "jod",
    stripePaymentIntentId: paymentIntentId(session),
    paidAt: new Date().toISOString(),
  });
}

async function reverseFromStripeCharge(charge) {
  const paymentIntent = typeof charge?.payment_intent === "string" ? charge.payment_intent : charge?.payment_intent?.id;
  if (!paymentIntent && !charge?.id) return { reversed: [] };
  return reverseReferralCommission({
    stripePaymentIntentId: paymentIntent || null,
    chargeId: charge?.id || null,
  });
}

module.exports = {
  processCheckoutSession,
  reverseFromStripeCharge,
};
