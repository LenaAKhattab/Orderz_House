/** Admin portfolio sections on /dashboard/super-admin/plans */

export const PLAN_ADMIN_SECTION = {
  CORE: "core",
  PAGES: "pages",
};

const CANONICAL_CHECKOUT_NAMES = new Set([
  "orderzhouse_free",
  "orderzhouse_50_jod",
  "orderzhouse_platinum",
  "freelancers_1_month",
  "freelancers_1_year",
  "freelancers_2_year",
]);

export function buildPlanPagesIndex(planPages) {
  return new Map((planPages || []).map((page) => [String(page.id), page]));
}

export function getSpecialPlanPages(planPages) {
  return (planPages || []).filter((page) => page.pageType === "special" && page.isActive !== false);
}

export function getDefaultPlanPage(planPages) {
  return (planPages || []).find((page) => page.pageType === "default") || null;
}

export function isOnDefaultPlanPage(plan, planPagesById) {
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return page?.pageType === "default";
}

export function isOnSpecialPlanPage(plan, planPagesById) {
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return page?.pageType === "special";
}

/**
 * Checkout / subscription product rows (not display clones linked via subscription_plan_id).
 */
export function isCanonicalSubscriptionPlan(plan) {
  if (plan?.subscriptionPlanId != null && String(plan.subscriptionPlanId).trim() !== "") {
    return false;
  }
  const name = String(plan?.name || "").trim();
  return CANONICAL_CHECKOUT_NAMES.has(name);
}

/** @deprecated Use isOnSpecialPlanPage — kept for callers that classified display clones. */
export function isPageDisplayPlan(plan, planPagesById) {
  if (plan?.subscriptionPlanId != null && String(plan.subscriptionPlanId).trim() !== "") {
    return true;
  }
  return isOnSpecialPlanPage(plan, planPagesById);
}

export function filterPlansByAdminSection(plans, section, planPagesById) {
  if (section === PLAN_ADMIN_SECTION.PAGES) {
    return (plans || []).filter((plan) => isOnSpecialPlanPage(plan, planPagesById));
  }
  return (plans || []).filter((plan) => isOnDefaultPlanPage(plan, planPagesById));
}

export function parsePlanAdminSection(value) {
  return value === PLAN_ADMIN_SECTION.PAGES ? PLAN_ADMIN_SECTION.PAGES : PLAN_ADMIN_SECTION.CORE;
}
