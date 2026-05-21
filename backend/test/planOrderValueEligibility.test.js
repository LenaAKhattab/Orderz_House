/**
 * Plan ↔ real order value eligibility (catalog-driven, no DB).
 * Run: node --test test/planOrderValueEligibility.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  getPlanOrderValueRange,
  isOrderValueAllowedForPlan,
  isOrderRowAllowedForPlanRange,
  isSingleValueInPlanRange,
  budgetRangesOverlap,
  buildPlanOrderValueWhereClause,
  computePoolOrderPlanEligibility,
} = require("../src/services/planOrderValueEligibility");

describe("getPlanOrderValueRange", () => {
  it("returns catalog ranges for plans 1–3", () => {
    const free = getPlanOrderValueRange(1);
    assert.strictEqual(free.minOrderValue, 3);
    assert.strictEqual(free.maxOrderValue, 7);
    assert.strictEqual(free.blocksRealOrders, true);

    const mid = getPlanOrderValueRange(2);
    assert.strictEqual(mid.minOrderValue, 7);
    assert.strictEqual(mid.maxOrderValue, 20);
    assert.strictEqual(mid.blocksRealOrders, false);

    const plat = getPlanOrderValueRange(3);
    assert.strictEqual(plat.minOrderValue, 10);
    assert.strictEqual(plat.maxOrderValue, null);
    assert.strictEqual(plat.blocksRealOrders, false);
  });
});

describe("fixed orders — budget vs plan", () => {
  const fixed = (budget) => ({ project_type: "fixed", budget });

  it("plan 2 allows 7–20 JOD", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(2, fixed(7)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, fixed(15)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, fixed(20)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, fixed(6.99)), false);
    assert.strictEqual(isOrderValueAllowedForPlan(2, fixed(20.01)), false);
  });

  it("plan 3 allows 10+ JOD", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(3, fixed(10)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(3, fixed(100)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(3, fixed(9.99)), false);
  });

  it("free plan blocks real fixed orders despite 3–7 display range", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(1, fixed(5)), false);
    assert.strictEqual(
      isOrderValueAllowedForPlan(1, { ...fixed(5), orderSource: "fake" }),
      true,
    );
    const range = getPlanOrderValueRange(1);
    assert.strictEqual(isOrderRowAllowedForPlanRange(fixed(5), range), true);
  });
});

describe("bidding orders — budget band overlap", () => {
  const bidding = (min, max) => ({
    project_type: "bidding",
    bid_budget_min: min,
    bid_budget_max: max,
  });

  it("plan 2 overlaps client band 7–20", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(7, 20)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(15, 18)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(1, 6)), false);
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(21, 30)), false);
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(5, 8)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(2, bidding(18, 25)), true);
  });

  it("plan 3 requires overlap with 10+ band", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(3, bidding(10, 50)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(3, bidding(5, 12)), true);
    assert.strictEqual(isOrderValueAllowedForPlan(3, bidding(1, 9)), false);
  });

  it("free plan blocks real bidding", () => {
    assert.strictEqual(isOrderValueAllowedForPlan(1, bidding(3, 7)), false);
  });
});

describe("bid amount within plan", () => {
  it("plan 2 bid amounts", () => {
    const range = getPlanOrderValueRange(2);
    assert.strictEqual(isSingleValueInPlanRange(range, 7), true);
    assert.strictEqual(isSingleValueInPlanRange(range, 20), true);
    assert.strictEqual(isSingleValueInPlanRange(range, 6), false);
    assert.strictEqual(isSingleValueInPlanRange(range, 21), false);
  });
});

describe("budgetRangesOverlap", () => {
  it("open-ended plan max", () => {
    assert.strictEqual(budgetRangesOverlap(10, null, 15, 100), true);
    assert.strictEqual(budgetRangesOverlap(10, null, 1, 9), false);
  });
});

describe("computePoolOrderPlanEligibility", () => {
  it("plan 2 locks fixed order below 7 and above 20", () => {
    const range = getPlanOrderValueRange(2);
    const low = computePoolOrderPlanEligibility({ project_type: "fixed", budget: 5 }, range);
    assert.strictEqual(low.isLockedByPlan, true);
    assert.strictEqual(low.canClaim, false);
    const ok = computePoolOrderPlanEligibility({ project_type: "fixed", budget: 15 }, range);
    assert.strictEqual(ok.isLockedByPlan, false);
    assert.strictEqual(ok.canClaim, true);
    const high = computePoolOrderPlanEligibility({ project_type: "fixed", budget: 25 }, range);
    assert.strictEqual(high.isLockedByPlan, true);
  });

  it("plan 3 locks bidding band below 10", () => {
    const range = getPlanOrderValueRange(3);
    const locked = computePoolOrderPlanEligibility(
      { project_type: "bidding", bid_budget_min: 1, bid_budget_max: 9 },
      range,
    );
    assert.strictEqual(locked.isLockedByPlan, true);
    assert.strictEqual(locked.canBid, false);
    const ok = computePoolOrderPlanEligibility(
      { project_type: "bidding", bid_budget_min: 10, bid_budget_max: 50 },
      range,
    );
    assert.strictEqual(ok.isLockedByPlan, false);
    assert.strictEqual(ok.canBid, true);
  });

  it("free plan locks all real orders", () => {
    const range = getPlanOrderValueRange(1);
    const el = computePoolOrderPlanEligibility({ project_type: "fixed", budget: 5, orderSource: "real" }, range);
    assert.strictEqual(el.isLockedByPlan, true);
    assert.strictEqual(el.canViewDetails, false);
  });

  it("fake pool rows follow plan band (free plan can claim in-band fake fixed)", () => {
    const freeRange = getPlanOrderValueRange(1);
    const fakeFixed = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 5, orderSource: "fake" },
      freeRange,
    );
    assert.strictEqual(fakeFixed.isLockedByPlan, false);
    assert.strictEqual(fakeFixed.canClaim, true);
    assert.strictEqual(fakeFixed.canBid, false);

    const plan2 = getPlanOrderValueRange(2);
    const fakeBidding = computePoolOrderPlanEligibility(
      { project_type: "bidding", bid_budget_min: 50, bid_budget_max: 70, orderSource: "fake" },
      plan2,
    );
    assert.strictEqual(fakeBidding.isLockedByPlan, true);
    assert.strictEqual(fakeBidding.canBid, false);
  });
});

describe("buildPlanOrderValueWhereClause", () => {
  it("emits parameterized fixed and bidding branches", () => {
    const sql = buildPlanOrderValueWhereClause("o", 2, 3);
    assert.match(sql, /o\.budget >= \$2/);
    assert.match(sql, /o\.bid_budget_max >= \$2/);
    assert.match(sql, /o\.bid_budget_min <= \$3/);
  });
});
