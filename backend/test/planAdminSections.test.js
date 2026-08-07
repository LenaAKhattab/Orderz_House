/**
 * Admin plan section classification (mirrors frontend/src/admin/plans/planAdminSections.js).
 * Run: node --test test/planAdminSections.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");

const PLAN_ADMIN_SECTION = { CORE: "core", PAGES: "pages" };

const CANONICAL_CHECKOUT_NAMES = new Set([
  "orderzhouse_free",
  "orderzhouse_50_jod",
  "orderzhouse_platinum",
  "freelancers_1_month",
  "freelancers_1_year",
  "freelancers_2_year",
  "freelancers_monthly_paid_15",
]);

function buildPlanPagesIndex(planPages) {
  return new Map((planPages || []).map((page) => [String(page.id), page]));
}

function getDefaultPlanPage(planPages) {
  return (planPages || []).find((page) => page.pageType === "default") || null;
}

function isOnDefaultPlanPage(plan, planPagesById) {
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return page?.pageType === "default";
}

function isOnSpecialPlanPage(plan, planPagesById) {
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return page?.pageType === "special";
}

function isCanonicalSubscriptionPlan(plan) {
  if (plan?.subscriptionPlanId != null && String(plan.subscriptionPlanId).trim() !== "") {
    return false;
  }
  const name = String(plan?.name || "").trim();
  return CANONICAL_CHECKOUT_NAMES.has(name);
}

function filterPlansByAdminSection(plans, section, planPagesById) {
  if (section === PLAN_ADMIN_SECTION.PAGES) {
    return (plans || []).filter((plan) => isOnSpecialPlanPage(plan, planPagesById));
  }
  return (plans || []).filter((plan) => isOnDefaultPlanPage(plan, planPagesById));
}

describe("plan admin section classification", () => {
  const pages = buildPlanPagesIndex([
    { id: "1", pageType: "default", slug: null },
    { id: "2", pageType: "special", slug: "flf" },
    { id: "3", pageType: "special", slug: "freelancers", isActive: false },
  ]);

  it("groups main /plans tiers on the default page (core section)", () => {
    const main = { id: "20", planPageId: "1", name: "freelancers_1_month", subscriptionPlanId: null };
    const core = filterPlansByAdminSection([main], PLAN_ADMIN_SECTION.CORE, pages);
    assert.strictEqual(core.length, 1);
    assert.strictEqual(isOnDefaultPlanPage(main, pages), true);
  });

  it("groups legacy canonical plans on flf direct page (pages section)", () => {
    const legacy = { id: "2", planPageId: "2", name: "orderzhouse_50_jod", subscriptionPlanId: null };
    const pagePlans = filterPlansByAdminSection([legacy], PLAN_ADMIN_SECTION.PAGES, pages);
    assert.strictEqual(pagePlans.length, 1);
    assert.strictEqual(isCanonicalSubscriptionPlan(legacy), true);
  });

  it("treats display clones with subscription_plan_id as non-canonical checkout rows", () => {
    const display = { id: "19", planPageId: "1", name: "freelancers_free", subscriptionPlanId: "1" };
    assert.strictEqual(isCanonicalSubscriptionPlan(display), false);
  });
});
