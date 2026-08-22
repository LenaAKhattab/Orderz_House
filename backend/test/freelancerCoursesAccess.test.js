/**
 * Freelancer courses paid-membership access rules.
 * Run: node --test test/freelancerCoursesAccess.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveFreelancerCourseAccess,
  hasFreelancerPaidCourseEntitlement,
  FREELANCER_COURSE_LOCKED_COPY_AR,
  FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE,
} = require("../src/constants/freelancerCoursesAccess");

describe("freelancerCoursesAccess", () => {
  it("treats Silver/Pro/Elite as paid course entitlement", () => {
    assert.equal(hasFreelancerPaidCourseEntitlement("silver"), true);
    assert.equal(hasFreelancerPaidCourseEntitlement("pro"), true);
    assert.equal(hasFreelancerPaidCourseEntitlement("elite"), true);
    assert.equal(hasFreelancerPaidCourseEntitlement("starter"), false);
    assert.equal(hasFreelancerPaidCourseEntitlement(null), false);
  });

  it("locks premium courses for Starter without assignment", () => {
    const out = resolveFreelancerCourseAccess({
      requiresPaidMembership: true,
      hasAssignment: false,
      tierCode: "starter",
    });
    assert.equal(out.isLocked, true);
    assert.equal(out.canAccess, false);
    assert.equal(out.lockReason, "COURSE_SUBSCRIPTION_REQUIRED");
    assert.deepEqual(out.copyAr, FREELANCER_COURSE_LOCKED_COPY_AR);
  });

  it("unlocks premium courses for paid tiers", () => {
    const out = resolveFreelancerCourseAccess({
      requiresPaidMembership: true,
      hasAssignment: false,
      tierCode: "silver",
    });
    assert.equal(out.isLocked, false);
    assert.equal(out.canAccess, true);
  });

  it("allows assignment override on premium courses", () => {
    const out = resolveFreelancerCourseAccess({
      requiresPaidMembership: true,
      hasAssignment: true,
      tierCode: "starter",
    });
    assert.equal(out.isLocked, false);
    assert.equal(out.canAccess, true);
  });

  it("keeps free/global courses accessible for Starter", () => {
    const out = resolveFreelancerCourseAccess({
      requiresPaidMembership: false,
      hasAssignment: false,
      tierCode: "starter",
    });
    assert.equal(out.isLocked, false);
    assert.equal(out.canAccess, true);
  });

  it("defines free onboarding article course spec", () => {
    assert.equal(FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE.title, "كيفية إنشاء مقال");
    assert.match(FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE.youtubeUrl, /Ivp6fji1uSY/);
  });
});
