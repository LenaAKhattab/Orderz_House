const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFreelancerFacts,
  conditionMatches,
  pickBannerItem,
  computeProgress,
  resolveAccountStatusKey,
} = require("../src/services/onboardingConditionResolver");

describe("onboarding condition resolver", () => {
  it("marks training incomplete from course aggregates", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "أ", family_name: "ب", email_verified: true },
      subscription: { activationStatus: "company_pending" },
      coursesAgg: { total: 2, completed: 1, pendingFinalTest: 0 },
    });
    assert.equal(facts.trainingIncomplete, true);
    assert.equal(conditionMatches("training_incomplete", facts), false);
    assert.equal(conditionMatches("activation_pending_review", facts), true);
  });

  it("requires profile before training banner", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "", family_name: "", email_verified: false },
      subscription: { activationStatus: "" },
      coursesAgg: { total: 1, completed: 0, pendingFinalTest: 0 },
      welcomeCompleted: true,
    });
    assert.equal(conditionMatches("profile_incomplete", facts), true);
    assert.equal(conditionMatches("training_incomplete", facts), false);
  });

  it("picks the first matching banner by safe priority", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "أ", family_name: "ب", email_verified: true },
      subscription: { activationStatus: "" },
      coursesAgg: { total: 1, completed: 0, pendingFinalTest: 1 },
      welcomeCompleted: true,
    });
    const items = [
      { id: 1, placement: "dashboard_banner", is_enabled: true, target_role: "freelancer", condition_key: "training_incomplete", item_type: "required" },
      { id: 2, placement: "dashboard_banner", is_enabled: true, target_role: "freelancer", condition_key: "activation_not_requested", item_type: "required" },
    ];
    const picked = pickBannerItem(items, facts, new Map());
    assert.equal(picked.id, 1);
  });

  it("hides pre-activation banners when company approved", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "أ", family_name: "ب", email_verified: true },
      subscription: { activationStatus: "company_approved" },
      coursesAgg: { total: 1, completed: 1, pendingFinalTest: 0 },
      welcomeCompleted: true,
    });
    assert.equal(resolveAccountStatusKey(facts), "activated");
    assert.equal(computeProgress(facts).completedSteps, 5);
    const items = [
      { id: 1, placement: "dashboard_banner", is_enabled: true, target_role: "freelancer", condition_key: "training_incomplete" },
    ];
    assert.equal(pickBannerItem(items, facts, new Map()), null);
  });

  it("does not execute arbitrary condition keys", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "أ", family_name: "ب", email_verified: true },
      subscription: {},
      coursesAgg: { total: 0, completed: 0, pendingFinalTest: 0 },
    });
    assert.equal(conditionMatches("process.exit", facts), false);
    assert.equal(conditionMatches("mini_bid_intro", facts), true);
  });
});
