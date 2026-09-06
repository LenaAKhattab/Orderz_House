/**
 * Canonical default plan catalog ids — must match backend/src/constants/planCatalogs.js.
 * Persist these values, never Admin UI labels.
 */

export const PLAN_CATALOG = Object.freeze({
  MAIN_PLANS: "main_plans",
  PAGE_PLANS: "page_plans",
  MARKETPLACE_PLANS: "marketplace_plans",
});

export const PLAN_CATALOG_VALUES = Object.freeze(Object.values(PLAN_CATALOG));

/** Behavior-preserving initial value: current public `/plans` source. */
export const DEFAULT_PLAN_CATALOG_INITIAL_VALUE = PLAN_CATALOG.MARKETPLACE_PLANS;

export const PLAN_CATALOG_LABELS = Object.freeze({
  [PLAN_CATALOG.MAIN_PLANS]: { ar: "الباقات الرئيسية", en: "Main plans" },
  [PLAN_CATALOG.PAGE_PLANS]: { ar: "باقات الصفحات", en: "Page plans" },
  [PLAN_CATALOG.MARKETPLACE_PLANS]: { ar: "باقات العمل", en: "Work memberships" },
});

export function isPlanCatalog(value) {
  return PLAN_CATALOG_VALUES.includes(String(value || "").trim());
}

export function isMarketplacePlanCatalog(catalog) {
  return catalog === PLAN_CATALOG.MARKETPLACE_PLANS;
}

export function catalogSourceForPlanCatalog(catalog) {
  if (catalog === PLAN_CATALOG.MARKETPLACE_PLANS) return "marketplace_membership";
  if (catalog === PLAN_CATALOG.PAGE_PLANS) return "page_plans";
  if (catalog === PLAN_CATALOG.MAIN_PLANS) return "main_plans";
  return null;
}
