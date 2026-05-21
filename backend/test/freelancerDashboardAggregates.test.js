/**
 * Run: node --test backend/test/freelancerDashboardAggregates.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  aggregateFinancialClaims,
  aggregateCourses,
  buildPendingActions,
  computeActiveWorkloadCount,
} = require("../src/services/freelancerDashboardAggregates");

describe("freelancerDashboardAggregates", () => {
  it("computeActiveWorkloadCount excludes revisionRequired double-count", () => {
    const n = computeActiveWorkloadCount({
      assigned: 2,
      inProgress: 3,
      waitingClientApproval: 1,
      revisionRequired: 4,
    });
    assert.strictEqual(n, 6);
  });

  it("aggregateFinancialClaims uses paid and remaining amounts", () => {
    const agg = aggregateFinancialClaims([
      { status: "paid", paidAmount: 50, remainingAmount: 0, updatedAt: "2026-01-01" },
      { status: "pending", paidAmount: 0, remainingAmount: 30, userAmountSnapshot: 30, updatedAt: "2026-02-01" },
    ]);
    assert.strictEqual(agg.paidTotalJod, 50);
    assert.strictEqual(agg.pendingTotalJod, 30);
    assert.strictEqual(agg.openClaimsCount, 1);
    assert.ok(agg.latestClaim);
  });

  it("buildPendingActions includes payment pending", () => {
    const actions = buildPendingActions({
      subscription: { paymentStatus: "pending", activationStatus: "company_pending", status: "assigned_not_started" },
      eligibility: { eligible: false, reason: "payment_not_completed" },
      counts: {},
      courses: [],
      claims: [],
      recentOrders: [],
    });
    assert.ok(actions.some((a) => a.type === "payment_pending"));
  });

  it("aggregateCourses counts final test pending", () => {
    const agg = aggregateCourses([
      {
        id: "1",
        title: "دورة",
        isTestingEnabled: true,
        progress: { completedLessons: 5, totalLessons: 5, percentage: 100 },
      },
    ]);
    assert.strictEqual(agg.pendingFinalTest, 1);
  });
});
