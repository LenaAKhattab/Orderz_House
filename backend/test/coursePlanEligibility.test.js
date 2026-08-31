/**
 * Courses-Gating-01 — course plan eligibility (pure logic, no DB).
 * Run: node --test test/coursePlanEligibility.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/course_plan_gating_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateCoursePlanAccessWithContext,
  tierRank,
  normalizeCourseRequiredTierCode,
  UPGRADE_PATH,
} = require("../src/services/coursePlanEligibilityService");

function ctx(currentTierCode, requiredTrainingCourseId = null) {
  return { currentTierCode, requiredTrainingCourseId };
}

describe("coursePlanEligibility — tier ranks", () => {
  it("maps marketplace tiers to course ranks", () => {
    assert.equal(tierRank("starter"), 1);
    assert.equal(tierRank("silver"), 2);
    assert.equal(tierRank("pro"), 3);
    assert.equal(tierRank("elite"), 4);
    assert.equal(tierRank(null), 0);
  });
});

describe("coursePlanEligibility — STARTER vs premium", () => {
  const premiumCourse = { id: 10, required_tier_code: "silver" };

  it("STARTER sees premium in list flags as locked", () => {
    const access = evaluateCoursePlanAccessWithContext({
      course: premiumCourse,
      context: ctx("starter"),
    });
    assert.equal(access.canAccess, false);
    assert.equal(access.isLockedByPlan, true);
    assert.equal(access.upgradeRequired, true);
    assert.equal(access.lockReason, "COURSE_PLAN_UPGRADE_REQUIRED");
    assert.equal(access.requiredTierCode, "silver");
    assert.equal(access.currentTierCode, "starter");
    assert.equal(access.upgradePath, UPGRADE_PATH);
  });

  it("assigned premium course stays locked for STARTER", () => {
    const access = evaluateCoursePlanAccessWithContext({
      course: { id: 99, requiredTierCode: "pro" },
      context: ctx("starter"),
    });
    assert.equal(access.canAccess, false);
    assert.equal(access.isLockedByPlan, true);
  });
});

describe("coursePlanEligibility — tier access matrix", () => {
  it("SILVER can access silver courses", () => {
    const access = evaluateCoursePlanAccessWithContext({
      course: { id: 1, required_tier_code: "silver" },
      context: ctx("silver"),
    });
    assert.equal(access.canAccess, true);
    assert.equal(access.isLockedByPlan, false);
  });

  it("PRO can access silver and pro courses", () => {
    assert.equal(
      evaluateCoursePlanAccessWithContext({
        course: { id: 1, required_tier_code: "silver" },
        context: ctx("pro"),
      }).canAccess,
      true,
    );
    assert.equal(
      evaluateCoursePlanAccessWithContext({
        course: { id: 2, required_tier_code: "pro" },
        context: ctx("pro"),
      }).canAccess,
      true,
    );
  });

  it("ELITE can access all course tiers", () => {
    for (const tier of ["starter", "silver", "pro", "elite"]) {
      const access = evaluateCoursePlanAccessWithContext({
        course: { id: 1, required_tier_code: tier },
        context: ctx("elite"),
      });
      assert.equal(access.canAccess, true, `elite should access ${tier}`);
    }
  });

  it("STARTER can access starter-tier courses", () => {
    const access = evaluateCoursePlanAccessWithContext({
      course: { id: 1, required_tier_code: "starter" },
      context: ctx("starter"),
    });
    assert.equal(access.canAccess, true);
  });
});

describe("coursePlanEligibility — required membership training course", () => {
  it("required training course stays accessible to STARTER even if tier is silver", () => {
    const trainingCourseId = 42;
    const access = evaluateCoursePlanAccessWithContext({
      course: { id: trainingCourseId, required_tier_code: "silver" },
      context: ctx("starter", trainingCourseId),
    });
    assert.equal(access.canAccess, true);
    assert.equal(access.isLockedByPlan, false);
    assert.equal(access.upgradeRequired, false);
  });
});

describe("coursePlanEligibility — defaults", () => {
  it("defaults missing course tier to silver", () => {
    assert.equal(normalizeCourseRequiredTierCode(undefined), "silver");
    assert.equal(normalizeCourseRequiredTierCode(null), "silver");
  });
});
