/**
 * Self-service vs company-assigned plan eligibility.
 * Run: npm run test:plan-self-subscribe  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/plan_self_subscribe_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { planEligibleForFreelancerSelfCheckout } = require("../src/services/plansService");

function basePlan(overrides = {}) {
  return {
    deleted_at: null,
    is_active: true,
    is_visible: true,
    self_subscribe_allowed: true,
    price_jod: 25,
    ...overrides,
  };
}

describe("planEligibleForFreelancerSelfCheckout", () => {
  it("allows visible active paid plan with self_subscribe_allowed=true", () => {
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan()), true);
  });

  it("denies visible active paid plan with self_subscribe_allowed=false", () => {
    assert.strictEqual(
      planEligibleForFreelancerSelfCheckout(basePlan({ self_subscribe_allowed: false })),
      false,
    );
  });

  it("denies when plan is not visible or not active or deleted", () => {
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan({ is_visible: false })), false);
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan({ is_active: false })), false);
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan({ deleted_at: new Date() })), false);
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(null), false);
  });

  it("denies non-positive or missing price", () => {
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan({ price_jod: 0 })), false);
    assert.strictEqual(planEligibleForFreelancerSelfCheckout(basePlan({ price_jod: null })), false);
  });
});

describe("company/admin assignment does not require self_subscribe_allowed", () => {
  it("getPlanDurationDays query ignores self_subscribe (assignment stays allowed)", () => {
    const p = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(
      src.includes("SELECT duration_days, is_active, deleted_at FROM plans"),
      "duration lookup must not gate on self_subscribe_allowed",
    );
    assert.ok(!src.includes("self_subscribe"), "getPlanDurationDays should not reference self_subscribe columns");
  });

  it("createFreelancerSubscriptionCheckoutSession loads self_subscribe_allowed and uses planEligibleForFreelancerSelfCheckout", () => {
    const p = path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("self_subscribe_allowed"), "checkout SELECT includes self_subscribe_allowed");
    assert.ok(src.includes("planEligibleForFreelancerSelfCheckout"), "checkout uses shared eligibility helper");
  });

  it("public plan listing filters to self_subscribe_allowed plans", () => {
    const p = path.join(__dirname, "..", "src", "services", "plansService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(
      /listVisibleActivePlans[\s\S]*self_subscribe_allowed\s*=\s*TRUE/.test(src),
      "listVisibleActivePlans must require self_subscribe_allowed",
    );
  });
});
