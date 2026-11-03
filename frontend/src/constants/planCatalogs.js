/**
 * Canonical default plan catalog ids — must match backend/src/constants/planCatalogs.js.
 * Persist these values, never Admin UI labels.
 */

import { withCatalogLabels } from "./constantsI18n.js";

export const PLAN_CATALOG = Object.freeze({
  MAIN_PLANS: "main_plans",
  PAGE_PLANS: "page_plans",
  MARKETPLACE_PLANS: "marketplace_plans",
});

export const PLAN_CATALOG_VALUES = Object.freeze(Object.values(PLAN_CATALOG));

/** Behavior-preserving initial value: current public `/plans` source. */
export const DEFAULT_PLAN_CATALOG_INITIAL_VALUE = PLAN_CATALOG.MARKETPLACE_PLANS;

/**
 * Catalog labels (platformConstants.planCatalogs.<id>): `ar` follows the non-English UI branch (Arabic, or the
 * active de / nl / ro locale), `en` is English, `labelKey` the catalog key.
 */
export const PLAN_CATALOG_LABELS = Object.freeze(
  Object.fromEntries(
    PLAN_CATALOG_VALUES.map((id) => [
      id,
      Object.freeze(withCatalogLabels({}, `planCatalogs.${id}`, { ar: "local", en: "en" })),
    ]),
  ),
);

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
