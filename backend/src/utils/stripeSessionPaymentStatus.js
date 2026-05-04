/**
 * Stripe Checkout Session `payment_status` values that mean fulfillment can proceed.
 * @see https://docs.stripe.com/api/checkout/sessions/object#checkout_session_object-payment_status
 */
function isCheckoutSessionPaymentSuccessful(session) {
  const ps = String(session?.payment_status || "").toLowerCase();
  return ps === "paid" || ps === "no_payment_required";
}

module.exports = { isCheckoutSessionPaymentSuccessful };
