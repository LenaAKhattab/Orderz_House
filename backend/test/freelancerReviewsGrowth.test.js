/**
 * Run: node --test backend/test/freelancerReviewsGrowth.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const { computeReputation, buildReviewsSummary } = require("../src/services/freelancerDashboardGrowth");

describe("reviews in growth bundle", () => {
  it("buildReviewsSummary marks available with zero reviews", () => {
    const s = buildReviewsSummary({
      available: true,
      totalReviews: 0,
      averageRating: null,
    });
    assert.strictEqual(s.available, true);
    assert.ok(s.messageAr);
  });

  it("computeReputation adds review factor without dominating", () => {
    const rep = computeReputation({
      performance: { completedOrders: 10, completionRate: 90, hasOrderHistory: true },
      profileCompletion: { percentage: 80 },
      eligibility: { eligible: true },
      coursesSummary: { completed: 2 },
      earningsSummary: {},
      reviewsSummary: {
        totalReviews: 5,
        averageRating: 4.8,
        recommendationRate: 100,
      },
      userRow: { email_verified: true },
    });
    assert.ok(rep.ratingsAvailable);
    assert.ok(rep.factors.some((f) => f.key === "client_reviews"));
    assert.ok(rep.trustScore <= 100);
  });
});
