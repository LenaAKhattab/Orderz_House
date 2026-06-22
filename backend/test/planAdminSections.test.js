/**
 * Admin plan section classification (mirrors frontend/src/admin/plans/planAdminSections.js).
 * Run: node --test test/planAdminSections.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");

const PLAN_ADMIN_SECTION = { CORE: "core", PAGES: "pages" };

function buildPlanPagesIndex(planPages) {
  return new Map((planPages || []).map((page) => [String(page.id), page]));
}

function isPageDisplayPlan(plan, planPagesById) {
  if (plan?.subscriptionPlanId != null && String(plan.subscriptionPlanId).trim() !== "") {
    return true;
  }
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return Boolean(page && page.pageType === "special");
}

function isCanonicalSubscriptionPlan(plan, planPagesById) {
  return !isPageDisplayPlan(plan, planPagesById);
}

describe("plan admin section classification", () => {
  const pages = buildPlanPagesIndex([
    { id: "1", pageType: "default", slug: null },
    { id: "2", pageType: "special", slug: "freelancers" },
  ]);

  it("treats canonical plans without subscription_plan_id as core", () => {
    const core = { id: "1", planPageId: "1", subscriptionPlanId: null };
    assert.strictEqual(isCanonicalSubscriptionPlan(core, pages), true);
    assert.strictEqual(isPageDisplayPlan(core, pages), false);
  });

  it("treats display clones with subscription_plan_id as page plans", () => {
    const display = { id: "16", planPageId: "2", subscriptionPlanId: "1" };
    assert.strictEqual(isPageDisplayPlan(display, pages), true);
    assert.strictEqual(isCanonicalSubscriptionPlan(display, pages), false);
  });

  it("treats special-page plans without subscription_plan_id as page plans", () => {
    const marketing = { id: "20", planPageId: "2", subscriptionPlanId: null };
    assert.strictEqual(isPageDisplayPlan(marketing, pages), true);
  });
});
