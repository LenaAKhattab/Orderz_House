/**
 * FAZAAT Stripe metadata helper tests.
 * Run: node --test test/fazaatStripeMetadata.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFazaatStripeMetadata,
  mergeStripeCheckoutMetadata,
  pickFazaatTrackingLogFields,
  PAYMENT_CONTEXT,
} = require("../src/utils/fazaatStripeMetadata");

describe("buildFazaatStripeMetadata", () => {
  it("includes required FAZAAT tracking fields as strings", () => {
    const meta = buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.CLIENT_FIXED_ORDER,
      purpose: "client_fixed_order",
      userId: 7,
      userEmail: "client@example.com",
      orderId: 42,
      expectedAmountMinor: 5000,
      currency: "jod",
    });
    assert.equal(meta.platform, "FAZAAT");
    assert.equal(meta.project, "Orderz House");
    assert.equal(meta.website, "orderzhouse.com");
    assert.equal(meta.payment_context, "client_fixed_order");
    assert.equal(meta.purpose, "client_fixed_order");
    assert.equal(meta.user_id, "7");
    assert.equal(meta.user_email, "client@example.com");
    assert.equal(meta.order_id, "42");
    assert.equal(meta.expected_amount_minor, "5000");
    assert.equal(meta.currency, "JOD");
  });

  it("omits null, undefined, and empty values", () => {
    const meta = buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.ACTIVATION_FEE_ONLY,
      purpose: "freelancer_activation_fee_only",
      userId: 3,
      userEmail: null,
      orderId: undefined,
      expectedAmountMinor: 25000,
    });
    assert.ok(!("user_email" in meta));
    assert.ok(!("order_id" in meta));
    assert.equal(meta.payment_context, "activation_fee_only");
  });
});

describe("mergeStripeCheckoutMetadata", () => {
  it("preserves legacy camelCase webhook keys alongside FAZAAT fields", () => {
    const fazaat = buildFazaatStripeMetadata({
      paymentContext: PAYMENT_CONTEXT.CLIENT_SELECTED_BID,
      purpose: "client_selected_bid",
      userId: 1,
      orderId: 10,
      bidId: 5,
      expectedAmountMinor: 1000,
    });
    const merged = mergeStripeCheckoutMetadata(fazaat, {
      orderId: "10",
      bidId: "5",
      purpose: "client_selected_bid",
      clientUserId: "1",
      expectedAmountMinor: "1000",
      currency: "JOD",
    });
    assert.equal(merged.orderId, "10");
    assert.equal(merged.bidId, "5");
    assert.equal(merged.clientUserId, "1");
    assert.equal(merged.platform, "FAZAAT");
    assert.equal(merged.payment_context, "client_selected_bid");
  });
});

describe("pickFazaatTrackingLogFields", () => {
  it("extracts safe log fields from merged metadata", () => {
    const fields = pickFazaatTrackingLogFields({
      platform: "FAZAAT",
      project: "Orderz House",
      payment_context: "freelancer_subscription",
      purpose: "freelancer_subscription_purchase",
      planId: "2",
      orderId: "99",
    });
    assert.equal(fields.platform, "FAZAAT");
    assert.equal(fields.payment_context, "freelancer_subscription");
    assert.equal(fields.plan_id, "2");
    assert.equal(fields.order_id, "99");
  });
});
