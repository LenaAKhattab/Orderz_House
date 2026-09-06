/**
 * Canonical default plan catalog ids.
 * These are internal enum values — never persist Admin UI labels.
 *
 * Catalogs (do not merge):
 * - main_plans: legacy `plans` on plan_pages.page_type = 'default'
 * - page_plans: legacy `plans` on plan_pages.page_type = 'special'
 * - marketplace_plans: marketplace_membership_plans (باقات العمل)
 */

const PLAN_CATALOG = Object.freeze({
  MAIN_PLANS: "main_plans",
  PAGE_PLANS: "page_plans",
  MARKETPLACE_PLANS: "marketplace_plans",
});

const PLAN_CATALOG_VALUES = Object.freeze(Object.values(PLAN_CATALOG));

const PLAN_CATALOG_SET = new Set(PLAN_CATALOG_VALUES);

/** system_settings key — single source of truth for public + freelancer listings. */
const DEFAULT_PLAN_CATALOG_SETTING_KEY = "default_plan_catalog";

/**
 * Behavior-preserving initial value: public `/plans` currently reads Marketplace Membership.
 * Freelancer dashboard previously listed GET /api/plans separately; this setting synchronizes both.
 */
const DEFAULT_PLAN_CATALOG_INITIAL_VALUE = PLAN_CATALOG.MARKETPLACE_PLANS;

function normalizePlanCatalog(value) {
  const catalog = String(value || "")
    .trim()
    .toLowerCase();
  return PLAN_CATALOG_SET.has(catalog) ? catalog : null;
}

function isPlanCatalog(value) {
  return normalizePlanCatalog(value) != null;
}

module.exports = {
  PLAN_CATALOG,
  PLAN_CATALOG_VALUES,
  PLAN_CATALOG_SET,
  DEFAULT_PLAN_CATALOG_SETTING_KEY,
  DEFAULT_PLAN_CATALOG_INITIAL_VALUE,
  normalizePlanCatalog,
  isPlanCatalog,
};
