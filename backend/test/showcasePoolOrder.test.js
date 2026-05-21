/**
 * Pool marketplace: training rows use normal plan eligibility (not display-only).
 * Run: node --test test/showcasePoolOrder.test.js
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/showcase_pool_test";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { computePoolOrderPlanEligibility } = require("../src/services/planOrderValueEligibility");
const { sanitizePublicPoolOrder, sanitizeFreelancerPoolOrder } = require("../src/utils/orderViewerSanitize");

describe("training pool plan eligibility", () => {
  it("allows claim/bid for fake rows when plan band matches", () => {
    const freeRange = { planId: 1, minOrderValue: 3, maxOrderValue: 7, blocksRealOrders: true };
    const fixed = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 5, orderSource: "fake" },
      freeRange,
    );
    assert.strictEqual(fixed.isLockedByPlan, false);
    assert.strictEqual(fixed.canClaim, true);
    assert.strictEqual(fixed.canBid, false);
    assert.ok(!("isDisplayOnly" in fixed));

    const plan2 = { planId: 2, minOrderValue: 7, maxOrderValue: 20, blocksRealOrders: false };
    const bidding = computePoolOrderPlanEligibility(
      { project_type: "bidding", bid_budget_min: 10, bid_budget_max: 18, orderSource: "fake" },
      plan2,
    );
    assert.strictEqual(bidding.isLockedByPlan, false);
    assert.strictEqual(bidding.canBid, true);
  });

  it("locks fake rows outside plan band like real orders", () => {
    const plan2 = { planId: 2, minOrderValue: 7, maxOrderValue: 20, blocksRealOrders: false };
    const out = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 50, orderSource: "fake" },
      plan2,
    );
    assert.strictEqual(out.isLockedByPlan, true);
    assert.strictEqual(out.canClaim, false);
  });
});

describe("training pool sanitizer", () => {
  it("does not expose internal source flags or strip participation", () => {
    const raw = {
      id: "9",
      title: "Job",
      description: "D",
      categoryId: "1",
      orderSource: "fake",
      trainingLabel: "طلب تجريبي",
      isDisplayOnly: true,
      myBid: { id: "1", amount: 12, status: "pending" },
      poolEligibility: { canClaim: true, isLockedByPlan: false },
    };
    const pub = sanitizePublicPoolOrder(raw);
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, "orderSource"));
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, "isDisplayOnly"));
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, "trainingLabel"));

    const fl = sanitizeFreelancerPoolOrder(raw);
    assert.strictEqual(fl.myBid?.status, "pending");
    assert.ok(!Object.prototype.hasOwnProperty.call(fl, "orderSource"));
    assert.ok(!Object.prototype.hasOwnProperty.call(fl, "isDisplayOnly"));
  });
});
