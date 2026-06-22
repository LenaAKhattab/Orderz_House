/** Admin portfolio sections on /dashboard/super-admin/plans */

export const PLAN_ADMIN_SECTION = {
  CORE: "core",
  PAGES: "pages",
};

export function buildPlanPagesIndex(planPages) {
  return new Map((planPages || []).map((page) => [String(page.id), page]));
}

/**
 * Page-specific / marketing display plans (not canonical subscription rows).
 * Rule: has subscription_plan_id OR belongs to a non-default plan page.
 */
export function isPageDisplayPlan(plan, planPagesById) {
  if (plan?.subscriptionPlanId != null && String(plan.subscriptionPlanId).trim() !== "") {
    return true;
  }
  const pageId = plan?.planPageId;
  if (!pageId) return false;
  const page = planPagesById.get(String(pageId));
  return Boolean(page && page.pageType === "special");
}

/** Canonical subscription plans used for checkout / freelancer_subscriptions. */
export function isCanonicalSubscriptionPlan(plan, planPagesById) {
  return !isPageDisplayPlan(plan, planPagesById);
}

export function filterPlansByAdminSection(plans, section, planPagesById) {
  const pick =
    section === PLAN_ADMIN_SECTION.PAGES ? isPageDisplayPlan : isCanonicalSubscriptionPlan;
  return (plans || []).filter((plan) => pick(plan, planPagesById));
}

export function getSpecialPlanPages(planPages) {
  return (planPages || []).filter((page) => page.pageType === "special");
}

export function getDefaultPlanPage(planPages) {
  return (planPages || []).find((page) => page.pageType === "default") || null;
}

export function parsePlanAdminSection(value) {
  return value === PLAN_ADMIN_SECTION.PAGES ? PLAN_ADMIN_SECTION.PAGES : PLAN_ADMIN_SECTION.CORE;
}
