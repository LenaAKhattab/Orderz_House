/**
 * Extract ISO 3166-1 alpha-2 country from Stripe Checkout / PaymentIntent objects.
 * Sources (priority): Checkout customer_details.address, charge billing_details on PaymentIntent.
 */

function normalizeIsoCountryCode(raw) {
  if (raw == null || raw === "") return null;
  const cc = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

function countryFromBillingDetails(billingDetails) {
  return normalizeIsoCountryCode(billingDetails?.address?.country);
}

/**
 * @param {import('stripe').Stripe.PaymentIntent | null | undefined} pi
 * @returns {{ code: string, source: string } | null}
 */
function pickCountryFromPaymentIntent(pi) {
  if (!pi || typeof pi !== "object") return null;

  const latestCharge = pi.latest_charge;
  if (latestCharge && typeof latestCharge === "object") {
    const fromLatest = countryFromBillingDetails(latestCharge.billing_details);
    if (fromLatest) {
      return { code: fromLatest, source: "payment_method_billing" };
    }
  }

  const charges = pi.charges?.data;
  if (Array.isArray(charges) && charges.length > 0) {
    for (const charge of charges) {
      const fromCharge = countryFromBillingDetails(charge?.billing_details);
      if (fromCharge) {
        return { code: fromCharge, source: "payment_method_billing" };
      }
    }
  }

  return null;
}

/**
 * @param {import('stripe').Stripe.Checkout.Session | null | undefined} session
 * @returns {{ code: string, source: string } | null}
 */
function pickCountryFromCheckoutSession(session) {
  if (!session || typeof session !== "object") return null;

  const fromCustomerDetails = normalizeIsoCountryCode(session.customer_details?.address?.country);
  if (fromCustomerDetails) {
    return { code: fromCustomerDetails, source: "checkout_billing_address" };
  }

  const pi = session.payment_intent;
  if (pi && typeof pi === "object") {
    const fromPi = pickCountryFromPaymentIntent(pi);
    if (fromPi) return fromPi;
  }

  return null;
}

module.exports = {
  normalizeIsoCountryCode,
  pickCountryFromCheckoutSession,
  pickCountryFromPaymentIntent,
};
