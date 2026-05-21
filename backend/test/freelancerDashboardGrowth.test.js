/**
 * Run: node --test backend/test/freelancerDashboardGrowth.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  computeProfileCompletion,
  computeReputation,
  buildSmartInsights,
  buildAchievements,
} = require("../src/services/freelancerDashboardGrowth");

describe("freelancerDashboardGrowth", () => {
  it("profile completion reaches 100 when all items satisfied", () => {
    const row = {
      avatar_url: "https://x.com/a.png",
      bio: "bio",
      professional_title: "writer",
      skills: ["seo"],
      portfolio_url: "https://p.com",
      phone: "+962",
      preferred_withdrawal_method: "bank",
      email_verified: true,
    };
    const pc = computeProfileCompletion(row, { coursesCompleted: 1, ordersCompleted: 2 });
    assert.strictEqual(pc.percentage, 100);
    assert.strictEqual(pc.missing.length, 0);
  });

  it("trust score increases with completed orders", () => {
    const rep = computeReputation({
      performance: { completedOrders: 5, completionRate: 90, hasOrderHistory: true },
      profileCompletion: { percentage: 50 },
      eligibility: { eligible: true },
      subscription: { status: "active" },
      coursesSummary: { completed: 1 },
      earningsSummary: { paidTotalJod: 0 },
      userRow: { email_verified: true },
    });
    assert.ok(rep.trustScore >= 20);
    assert.ok(rep.trustLevelAr);
  });

  it("insights include profile when incomplete", () => {
    const insights = buildSmartInsights({
      profileCompletion: { percentage: 40, missing: [{ suggestionAr: "x" }] },
      performance: { completedOrders: 0 },
      coursesSummary: {},
      subscription: {},
      eligibility: { eligible: true },
      counts: {},
      earningsSummary: {},
      pendingActions: [],
    });
    assert.ok(insights.some((i) => i.type === "profile"));
  });

  it("achievements include first order when completed", () => {
    const ach = buildAchievements({
      performance: { completedOrders: 1 },
      coursesSummary: {},
      profileCompletion: { percentage: 0 },
      reputation: { trustScore: 10 },
    });
    assert.ok(ach.some((a) => a.id === "first_order" && a.achieved));
  });
});
