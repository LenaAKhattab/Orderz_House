const notificationService = require("./notificationService");

/**
 * Dedupe across webhook + confirm + payment_intent.succeeded.
 * Prefer internal subscription id (one row per self-checkout) so session-based and PI-based events share one key.
 */
function paymentSuccessDedupeKey(stripeSessionId, subscriptionId) {
  const subId = subscriptionId != null ? Number(subscriptionId) : null;
  if (Number.isInteger(subId) && subId > 0) return `fsub_payment_success_sub_${subId}`;
  const sid = stripeSessionId != null ? String(stripeSessionId).trim() : "";
  if (sid) return `fsub_payment_success_${sid}`;
  return null;
}

/**
 * In-app notification for successful freelancer subscription self-checkout (Stripe-confirmed).
 * Idempotent via dedupe_key (session id when available).
 */
async function notifyFreelancerSubscriptionPaymentSuccess(
  { freelancerUserId, planId, subscriptionId, stripeSessionId, source },
  client,
) {
  const subId = Number(subscriptionId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(subId) || subId < 1) {
    return null;
  }
  const dedupeKey = paymentSuccessDedupeKey(stripeSessionId, subId);
  if (!dedupeKey) return null;
  const planKey = planId != null && Number.isInteger(Number(planId)) ? String(planId) : "";
  return notificationService.createIfNotExists(
    {
      recipientUserId: freelancerUserId,
      recipientRole: "freelancer",
      actorUserId: null,
      type: "payment_success",
      title: "Subscription activated",
      message: "Your freelancer subscription has been successfully activated.",
      entityType: "subscription",
      entityId: subId,
      link: "/plans",
      priority: "high",
      metadata: {
        planId: planKey,
        subscriptionId: String(subId),
        stripeSessionId: stripeSessionId ? String(stripeSessionId) : null,
        redirectTo: "/plans",
        source: String(source || "backend"),
      },
    },
    dedupeKey,
    client,
  );
}

function paymentFailedDedupeKey(subscriptionId, stripePaymentIntentId, stripeSessionId) {
  const sid = stripeSessionId != null ? String(stripeSessionId).trim() : "";
  if (sid) return `fsub_payment_failed_${sid}`;
  const pi = stripePaymentIntentId != null ? String(stripePaymentIntentId).trim() : "";
  if (pi) return `fsub_payment_failed_pi_${pi}`;
  const subId = subscriptionId != null ? Number(subscriptionId) : null;
  if (Number.isInteger(subId) && subId > 0) return `fsub_payment_failed_sub_${subId}`;
  return null;
}

async function notifyFreelancerSubscriptionPaymentFailed(
  { freelancerUserId, planId, subscriptionId, stripeSessionId, stripePaymentIntentId, source },
  client,
) {
  const subId = Number(subscriptionId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1 || !Number.isInteger(subId) || subId < 1) {
    return null;
  }
  const dedupeKey = paymentFailedDedupeKey(subId, stripePaymentIntentId, stripeSessionId);
  if (!dedupeKey) return null;
  const planKey = planId != null && Number.isInteger(Number(planId)) ? String(planId) : "";
  return notificationService.createIfNotExists(
    {
      recipientUserId: freelancerUserId,
      recipientRole: "freelancer",
      actorUserId: null,
      type: "payment_failed",
      title: "Payment failed",
      message: "Your payment could not be completed. Please try again.",
      entityType: "subscription",
      entityId: subId,
      link: "/plans",
      priority: "high",
      metadata: {
        planId: planKey,
        subscriptionId: String(subId),
        stripeSessionId: stripeSessionId ? String(stripeSessionId) : null,
        stripePaymentIntentId: stripePaymentIntentId ? String(stripePaymentIntentId) : null,
        redirectTo: "/plans",
        source: String(source || "backend"),
      },
    },
    dedupeKey,
    client,
  );
}

async function notifyFreelancerSubscriptionPaymentCancelled(
  { freelancerUserId, planId, subscriptionId, stripeSessionId, source },
  client,
) {
  const sid = stripeSessionId != null ? String(stripeSessionId).trim() : "";
  if (!sid) return null;
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) return null;
  const dedupeKey = `fsub_payment_cancelled_${sid}`;
  const subId = subscriptionId != null ? Number(subscriptionId) : null;
  const entityId = Number.isInteger(subId) && subId > 0 ? subId : null;
  const planKey = planId != null && Number.isInteger(Number(planId)) ? String(planId) : "";
  return notificationService.createIfNotExists(
    {
      recipientUserId: freelancerUserId,
      recipientRole: "freelancer",
      actorUserId: null,
      type: "payment_cancelled",
      title: "Payment cancelled",
      message: "You cancelled the payment process.",
      entityType: "subscription",
      entityId,
      link: "/plans",
      priority: "medium",
      metadata: {
        planId: planKey,
        subscriptionId: entityId != null ? String(entityId) : null,
        stripeSessionId: sid,
        redirectTo: "/plans",
        source: String(source || "backend"),
      },
    },
    dedupeKey,
    client,
  );
}

module.exports = {
  notifyFreelancerSubscriptionPaymentSuccess,
  notifyFreelancerSubscriptionPaymentFailed,
  notifyFreelancerSubscriptionPaymentCancelled,
  paymentSuccessDedupeKey,
};
