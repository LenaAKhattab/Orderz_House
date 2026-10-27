/**
 * Provider-side payment funnel events — one structured log line per terminal Checkout outcome and per failed
 * payment attempt, so acceptance can be monitored without analytics tooling.
 *
 * Fields: flow, currency, amount bucket, outcome category, decline code, Radar blocked, risk level, network
 * status, 3DS result, payment-method type / wallet, card-country group, card funding.
 * Never logged: people ids, emails, names, card numbers / fingerprints, Checkout URLs, client secrets, keys.
 *
 * Stripe Checkout lets the customer retry inside the same Session, so a failed attempt is NOT terminal:
 * the order / membership / package state is only changed by checkout.session.completed / .expired.
 */

const ORDERZHOUSE_PURPOSES = new Set([
  "client_fixed_order",
  "client_selected_bid",
  "marketplace_membership_checkout",
  "training_package_purchase",
  "bid_credit_package_purchase",
  "freelancer_subscription_purchase",
  "freelancer_activation_fee_only",
  "freelancer_recurring_subscription",
]);

function isOrderzHousePurpose(meta) {
  return ORDERZHOUSE_PURPOSES.has(String(meta?.purpose || ""));
}

/** Purchase intent, e.g. client_fixed, client_selected_bid, membership_silver, annual_silver, special_offer, training. */
function paymentFlowOf(meta) {
  const m = meta || {};
  const purpose = String(m.purpose || "");
  if (purpose === "client_fixed_order") return "client_fixed";
  if (purpose === "client_selected_bid") return "client_selected_bid";
  if (purpose === "training_package_purchase") return "training";
  if (purpose === "bid_credit_package_purchase") return "bid_credit_package";
  if (purpose === "marketplace_membership_checkout") {
    if (m.specialOfferPackage || m.specialOfferPlanId) return "special_offer";
    const tier = String(m.tierCode || m.planCode || "").toLowerCase();
    if (tier === "annual_basic") return "annual_silver";
    return tier ? `membership_${tier}` : "membership";
  }
  if (purpose.startsWith("freelancer_")) return `legacy_${purpose.replace("freelancer_", "")}`;
  return "other";
}

/** Coarse JOD price band (never the exact amount). */
function amountBucket(amountMinor, currency) {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return "unknown";
  const c = String(currency || "").toLowerCase();
  const major = c === "jod" ? n / 1000 : n / 100;
  if (major <= 5) return "<=5";
  if (major <= 10) return "5-10";
  if (major <= 20) return "10-20";
  if (major <= 35) return "20-35";
  if (major <= 50) return "35-50";
  return ">50";
}

function cardCountryGroup(country) {
  const c = String(country || "").toUpperCase();
  if (!c) return "unknown";
  if (c === "JO" || c === "AE") return c;
  return "other";
}

/**
 * Mutually exclusive outcome category for one charge (one payment attempt).
 * @param {object} charge Stripe Charge
 */
function chargeOutcomeCategory(charge) {
  if (!charge) return "no_charge";
  if (charge.status === "succeeded" || charge.paid === true) return "succeeded";
  const type = String(charge.outcome?.type || "");
  const reason = String(charge.outcome?.reason || "");
  if (String(charge.failure_code || "") === "payment_intent_authentication_failure") return "authentication_failed";
  if (type === "blocked") return reason === "rule" ? "radar_blocked_rule" : "radar_blocked_risk";
  if (type === "issuer_declined") return reason ? `issuer_${reason}` : "issuer_declined";
  if (type === "invalid") return "invalid_payment_details";
  if (charge.status === "pending") return "processing";
  return "other";
}

function chargeFields(charge) {
  if (!charge) return {};
  const card = charge.payment_method_details?.card || null;
  const rule = charge.outcome?.rule;
  return {
    outcome: chargeOutcomeCategory(charge),
    declineCode: charge.outcome?.reason || charge.failure_code || null,
    radarBlocked: charge.outcome?.type === "blocked",
    radarRule: rule ? (typeof rule === "object" ? rule.id : String(rule)) : null,
    riskLevel: charge.outcome?.risk_level || null,
    networkStatus: charge.outcome?.network_status || null,
    paymentMethodType: charge.payment_method_details?.type || null,
    wallet: card?.wallet?.type || null,
    cardBrand: card?.brand || null,
    cardFunding: card?.funding || null,
    cardCountryGroup: cardCountryGroup(card?.country),
    threeDs: card?.three_d_secure ? String(card.three_d_secure.result || "attempted") : "none",
  };
}

function logPaymentFunnelEvent(fields) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ component: "stripe_payment_funnel", ...fields }));
}

async function retrieveCharge(stripe, chargeOrId) {
  if (!chargeOrId) return null;
  if (typeof chargeOrId === "object") return chargeOrId;
  try {
    return await stripe.charges.retrieve(String(chargeOrId));
  } catch {
    return null;
  }
}

/**
 * payment_intent.payment_failed — record one failed attempt (record only, never a state change).
 * @returns {Promise<{ status: "applied"|"ignored", reason?: string }>}
 */
async function recordPaymentAttemptFailed(paymentIntent, { stripe } = {}) {
  const meta = paymentIntent?.metadata || {};
  if (!isOrderzHousePurpose(meta)) return { status: "ignored", reason: "not_orderzhouse_checkout" };
  const charge = stripe ? await retrieveCharge(stripe, paymentIntent.latest_charge) : null;
  const err = paymentIntent.last_payment_error || {};
  logPaymentFunnelEvent({
    event: "payment_attempt_failed",
    flow: paymentFlowOf(meta),
    currency: String(paymentIntent.currency || "").toLowerCase() || null,
    amountBucket: amountBucket(paymentIntent.amount, paymentIntent.currency),
    ...chargeFields(charge),
    ...(charge ? {} : { outcome: err.code === "payment_intent_authentication_failure" ? "authentication_failed" : "no_charge" }),
    errorCode: err.code || null,
    errorDeclineCode: err.decline_code || null,
  });
  return { status: "applied", recordOnly: true };
}

/**
 * checkout.session.completed / .expired — record the terminal outcome of one Checkout Session.
 * An expired Session with a PaymentIntent had at least one failed attempt; the last one is classified.
 */
async function recordCheckoutSessionTerminal(session, eventType, { stripe } = {}) {
  const meta = session?.metadata || {};
  if (!isOrderzHousePurpose(meta)) return;
  const base = {
    flow: paymentFlowOf(meta),
    currency: String(session.currency || "").toLowerCase() || null,
    amountBucket: amountBucket(session.amount_total, session.currency),
    mode: session.mode || null,
  };
  if (eventType === "checkout.session.completed") {
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    logPaymentFunnelEvent({ event: "checkout_completed", ...base, outcome: paid ? "succeeded" : "processing" });
    return;
  }
  const piId = session.payment_intent ? (typeof session.payment_intent === "object" ? session.payment_intent.id : session.payment_intent) : null;
  if (!piId) {
    logPaymentFunnelEvent({ event: "checkout_expired", ...base, attempted: false, outcome: "expired_without_attempt" });
    return;
  }
  let charge = null;
  if (stripe) {
    try {
      const pi = await stripe.paymentIntents.retrieve(String(piId));
      charge = await retrieveCharge(stripe, pi.latest_charge);
    } catch {
      charge = null;
    }
  }
  logPaymentFunnelEvent({ event: "checkout_expired", ...base, attempted: true, ...chargeFields(charge), lastAttempt: charge ? chargeOutcomeCategory(charge) : "unknown" });
}

module.exports = {
  ORDERZHOUSE_PURPOSES,
  isOrderzHousePurpose,
  paymentFlowOf,
  amountBucket,
  cardCountryGroup,
  chargeOutcomeCategory,
  chargeFields,
  logPaymentFunnelEvent,
  recordPaymentAttemptFailed,
  recordCheckoutSessionTerminal,
};
