/**
 * Smoke tests for abandoned Stripe pending cleanup helpers.
 * Run: node --test test/cleanupAbandonedStripePending.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/cleanup_abandoned_stripe_pending_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  shouldRetainCurrentSubscription,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_SOURCES,
  SUBSCRIPTION_STATUSES,
} = require("../src/services/subscriptionsService");

describe("shouldRetainCurrentSubscription — pending legacy rows", () => {
  it("treats pending stripe checkout placeholder as retainable until deleted", () => {
    const retain = shouldRetainCurrentSubscription({
      isCurrent: true,
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PENDING,
      status: SUBSCRIPTION_STATUSES.INACTIVE,
      source: SUBSCRIPTION_SOURCES.STRIPE,
    });
    assert.strictEqual(retain, true);
  });

  it("does not retain when no current subscription", () => {
    assert.strictEqual(shouldRetainCurrentSubscription(null), false);
  });

  it("retains paid stripe subscriptions", () => {
    const retain = shouldRetainCurrentSubscription({
      isCurrent: true,
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
      status: SUBSCRIPTION_STATUSES.INACTIVE,
      source: SUBSCRIPTION_SOURCES.STRIPE,
    });
    assert.strictEqual(retain, true);
  });

  it("retains admin-assigned not_required subscriptions", () => {
    const retain = shouldRetainCurrentSubscription({
      isCurrent: true,
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      source: SUBSCRIPTION_SOURCES.ADMIN,
    });
    assert.strictEqual(retain, true);
  });
});

describe("cleanupAbandonedStripePendingSubscriptionsWithFreePlanFallback source", () => {
  it("uses ensureFreelancerDefaultFreePlan after delete (not pending row conversion)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "subscriptionsService.js"),
      "utf8",
    );
    assert.match(src, /cleanupAbandonedStripePendingSubscriptionsWithFreePlanFallback/);
    assert.match(src, /DELETE FROM freelancer_subscriptions fs/);
    assert.match(src, /await ensureFreelancerDefaultFreePlan\(uid\)/);
    assert.doesNotMatch(src, /payment_status = 'pending'[\s\S]*SET payment_status = 'not_required'/);
  });
});
