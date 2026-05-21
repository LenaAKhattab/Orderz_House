/**
 * Order authorization helpers (no DB).
 * Run: node --test test/orderAuthorization.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const planEligibility = require("../src/services/planOrderValueEligibility");
const orderAuthz = require("../src/services/orderAuthorizationService");
const { sanitizeFreelancerPoolOrder } = require("../src/utils/orderViewerSanitize");

describe("orderAuthorizationService role helpers", () => {
  it("detects staff from admin or super_admin legacy role", () => {
    assert.strictEqual(orderAuthz.isStaffAuth({ legacyRole: "admin" }), true);
    assert.strictEqual(orderAuthz.isStaffAuth({ legacyRole: "super_admin" }), true);
    assert.strictEqual(orderAuthz.isStaffAuth({ primaryRole: "freelancer" }), false);
  });

  it("requireAuthenticatedUserId rejects missing auth", () => {
    assert.throws(() => orderAuthz.requireAuthenticatedUserId(null), (e) => e.statusCode === 401);
  });
});

describe("plan range blocks free real orders", () => {
  it("free plan cannot access real fixed order in catalog logic", () => {
    assert.strictEqual(
      planEligibility.isOrderValueAllowedForPlan(1, { project_type: "fixed", budget: 5 }),
      false,
    );
  });
});

describe("freelancer pool JSON does not leak file URLs", () => {
  it("strips secureUrl and fileUrl from pool detail files", () => {
    const safe = sanitizeFreelancerPoolOrder({
      id: "1",
      title: "t",
      projectType: "fixed",
      budget: 10,
      files: [{ id: "9", secureUrl: "https://cdn.example/x", fileUrl: "https://cdn.example/y" }],
    });
    assert.strictEqual(safe.files.length, 1);
    assert.strictEqual(safe.files[0].secureUrl, undefined);
    assert.strictEqual(safe.files[0].fileUrl, undefined);
    assert.strictEqual(safe.files[0].id, "9");
  });
});

describe("bidding overlap security", () => {
  it("plan 2 freelancer cannot access 5 JOD bidding band", () => {
    assert.strictEqual(
      planEligibility.isOrderValueAllowedForPlan(2, {
        project_type: "bidding",
        bid_budget_min: 1,
        bid_budget_max: 6,
      }),
      false,
    );
  });

  it("plan 3 freelancer cannot access 9 JOD cap bidding band", () => {
    assert.strictEqual(
      planEligibility.isOrderValueAllowedForPlan(3, {
        project_type: "bidding",
        bid_budget_min: 1,
        bid_budget_max: 9,
      }),
      false,
    );
  });
});
