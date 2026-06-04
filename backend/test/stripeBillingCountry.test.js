const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  pickCountryFromCheckoutSession,
  pickCountryFromPaymentIntent,
} = require("../src/utils/stripeBillingCountry");

describe("stripeBillingCountry", () => {
  it("reads country from checkout customer_details", () => {
    const picked = pickCountryFromCheckoutSession({
      customer_details: { address: { country: "jo" } },
    });
    assert.equal(picked?.code, "JO");
    assert.equal(picked?.source, "checkout_billing_address");
  });

  it("reads country from payment intent latest_charge billing_details", () => {
    const picked = pickCountryFromPaymentIntent({
      latest_charge: {
        billing_details: { address: { country: "SA" } },
      },
    });
    assert.equal(picked?.code, "SA");
    assert.equal(picked?.source, "payment_method_billing");
  });

  it("returns null when no billing country present", () => {
    assert.equal(pickCountryFromCheckoutSession({}), null);
    assert.equal(pickCountryFromPaymentIntent({ charges: { data: [] } }), null);
  });
});
