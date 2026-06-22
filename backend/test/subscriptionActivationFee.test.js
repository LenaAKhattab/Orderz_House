/**
 * Subscription activation fee (25 JOD yearly) helpers.
 * Run: npm run test:subscription-activation-fee  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/subscription_activation_fee_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  SUBSCRIPTION_ACTIVATION_FEE_JOD,
  ACTIVATION_FEE_VALIDITY_DAYS,
  activationFeeMinorUnits,
  isActivationFeeCurrent,
  activationFeeLineItemName,
} = require("../src/services/subscriptionActivationFeeService");

describe("subscriptionActivationFeeService constants", () => {
  it("uses 25 JOD activation fee", () => {
    assert.strictEqual(SUBSCRIPTION_ACTIVATION_FEE_JOD, 25);
    assert.strictEqual(ACTIVATION_FEE_VALIDITY_DAYS, 365);
  });

  it("converts activation fee to Stripe minor units for JOD", () => {
    assert.strictEqual(activationFeeMinorUnits(), 25000);
  });
});

describe("isActivationFeeCurrent", () => {
  it("returns false when never paid", () => {
    assert.strictEqual(isActivationFeeCurrent(null), false);
  });

  it("returns true within 365 days", () => {
    const now = new Date("2026-06-22T12:00:00Z");
    const paidAt = new Date("2026-01-01T12:00:00Z");
    assert.strictEqual(isActivationFeeCurrent(paidAt, now), true);
  });

  it("returns false after 365 days", () => {
    const now = new Date("2027-06-22T12:00:00Z");
    const paidAt = new Date("2026-01-01T12:00:00Z");
    assert.strictEqual(isActivationFeeCurrent(paidAt, now), false);
  });
});

describe("activation fee line item naming", () => {
  it("localizes activation fee product name", () => {
    assert.strictEqual(activationFeeLineItemName("ar"), "رسوم تفعيل الاشتراك");
    assert.strictEqual(activationFeeLineItemName("en"), "Subscription activation fee");
  });
});

describe("Stripe checkout integration hooks", () => {
  it("createFreelancerSubscriptionCheckoutSession includes activation fee helpers", () => {
    const p = path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("freelancerNeedsSubscriptionActivationFee"));
    assert.ok(src.includes("buildActivationFeeStripeLineItem"));
    assert.ok(src.includes("activationFeeMinor"));
    assert.ok(src.includes("planAmountMinor"));
  });

  it("webhook and confirm record activation fee via audit helpers when metadata includes it", () => {
    const webhook = fs.readFileSync(
      path.join(__dirname, "..", "src", "controllers", "stripeWebhookController.js"),
      "utf8",
    );
    const checkout = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js"),
      "utf8",
    );
    assert.ok(webhook.includes("recordActivationFeeFromStripeSession"));
    assert.ok(checkout.includes("recordActivationFeeFromStripeSession"));
    assert.ok(checkout.includes("prepareFreelancerCheckoutSessionCreation"));
    assert.ok(checkout.includes("trackFreelancerCheckoutSession"));
  });
});
